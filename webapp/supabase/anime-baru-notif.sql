-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Urutan: jalankan SETELAH anime-tambahan.sql dan notifikasi-supabase.sql.
-- Isi:
--  1) Panel Developer > "Anime Baru": tambah anime yang BELUM ADA di API sama sekali (judul, poster, sinopsis, genre) dengan ATURAN KETAT.
--     Setiap anime baru yang disimpan OTOMATIS mengirim notifikasi "Anime baru" ke semua pengguna.
--  2) Developer menambah episode (Upload Anime) -> pengguna yang memfavoritkan / menonton anime itu otomatis dapat notifikasi episode baru.
-- Tabel tertutup untuk akses langsung; tulis hanya developer lewat fungsi di bawah, semua isian divalidasi di server.

-- ============================================================ 1) ANIME BARU (buatan developer)
create table if not exists public.custom_anime (
  id         text primary key default ('c_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  title      text not null check (char_length(title) between 2 and 120),
  poster     text not null check (char_length(poster) <= 600 and poster ~* '^https://[^\s"''<>]+\.(jpe?g|png|webp|gif|avif)(\?[^\s"''<>]{0,30})?$'),
  synopsis   text not null check (char_length(synopsis) between 30 and 2000),
  genres     text[] not null check (cardinality(genres) between 1 and 5),
  status     text not null default 'Ongoing' check (status in ('Ongoing', 'Completed', 'Upcoming')),
  type       text not null default 'TV' check (type in ('TV', 'Movie', 'OVA', 'ONA', 'Special')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists custom_anime_title_uq on public.custom_anime (lower(btrim(title)));
create index if not exists custom_anime_created on public.custom_anime (created_at desc);
alter table public.custom_anime enable row level security;
revoke all on public.custom_anime from anon, authenticated;     -- tanpa kebijakan = tidak bisa diakses langsung


-- ============================================================ 1b) DAFTAR "NEW EPS" BERANDA
-- Setiap kali developer menyimpan nomor episode BARU (Upload Anime), anime itu dicatat di sini supaya muncul di "New Eps Anime" di beranda
-- (termasuk anime dari API yang episodenya ditambah lewat Panel Developer). Tampil 14 hari sejak episode terakhir ditambahkan.
create table if not exists public.new_eps_feed (
  anime_id   text primary key check (anime_id ~ '^[A-Za-z0-9_:.-]{1,120}$'),
  title      text not null check (char_length(title) between 1 and 120),
  poster     text check (poster is null or char_length(poster) <= 600),
  number     numeric not null,
  updated_at timestamptz not null default now()
);
create index if not exists new_eps_feed_updated on public.new_eps_feed (updated_at desc);
alter table public.new_eps_feed enable row level security;
revoke all on public.new_eps_feed from anon, authenticated;

create or replace function public.new_eps_latest(p_limit int default 20)
returns table (id text, title text, poster text, number numeric, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.anime_id, f.title, f.poster, f.number, f.updated_at
    from public.new_eps_feed f
   where auth.uid() is not null and f.updated_at > now() - interval '14 days'
   order by f.updated_at desc limit least(greatest(coalesce(p_limit, 20), 1), 40);
$$;
revoke all on function public.new_eps_latest(int) from public, anon;
grant execute on function public.new_eps_latest(int) to authenticated;

-- PERBAIKAN: versi lama memakai regex dengan batas {4,560}/{4,590} yang DITOLAK Postgres (maksimal 255) -> "invalid regular expression".
-- Constraint di tabel yang sudah ada diganti di sini (aman diulang).
alter table public.custom_anime drop constraint if exists custom_anime_poster_check;
alter table public.custom_anime add constraint custom_anime_poster_check
  check (char_length(poster) <= 600 and poster ~* '^https://[^\s"''<>]+\.(jpe?g|png|webp|gif|avif)(\?[^\s"''<>]{0,30})?$');
do $$ declare c record; begin      -- buang constraint lama yang memuat regex {4,590} (apa pun namanya)
  for c in select conname from pg_constraint where conrelid = 'public.extra_episodes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%4,590%' loop
    execute format('alter table public.extra_episodes drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.extra_episodes drop constraint if exists extra_episodes_check;
alter table public.extra_episodes add constraint extra_episodes_check
  check ((kind = 'api' and ref ~ '^[A-Za-z0-9_:.-]{1,120}$') or (kind = 'link' and ref ~ '^https://[^\s"''<>]+$'));

-- Dibaca semua user yang login
create or replace function public.custom_anime_get(p_id text)
returns table (id text, title text, poster text, synopsis text, genres text[], status text, type text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, a.poster, a.synopsis, a.genres, a.status, a.type, a.created_at
    from public.custom_anime a where auth.uid() is not null and a.id = p_id;
$$;
revoke all on function public.custom_anime_get(text) from public, anon;
grant execute on function public.custom_anime_get(text) to authenticated;

create or replace function public.custom_anime_latest(p_limit int default 12)
returns table (id text, title text, poster text, synopsis text, genres text[], status text, type text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, a.poster, a.synopsis, a.genres, a.status, a.type, a.created_at
    from public.custom_anime a where auth.uid() is not null
   order by a.created_at desc limit least(greatest(coalesce(p_limit, 12), 1), 30);
$$;
revoke all on function public.custom_anime_latest(int) from public, anon;
grant execute on function public.custom_anime_latest(int) to authenticated;

create or replace function public.custom_anime_search(p_q text)
returns table (id text, title text, poster text, synopsis text, genres text[], status text, type text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, a.poster, a.synopsis, a.genres, a.status, a.type, a.created_at
    from public.custom_anime a
   where auth.uid() is not null and char_length(btrim(coalesce(p_q, ''))) >= 2
     and position(lower(btrim(p_q)) in lower(a.title)) > 0
   order by a.created_at desc limit 20;
$$;
revoke all on function public.custom_anime_search(text) from public, anon;
grant execute on function public.custom_anime_search(text) to authenticated;

-- Developer: daftar lengkap
create or replace function public.dev_anime_list()
returns table (id text, title text, poster text, synopsis text, genres text[], status text, type text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  return query select a.id, a.title, a.poster, a.synopsis, a.genres, a.status, a.type, a.created_at
                 from public.custom_anime a order by a.created_at desc limit 500;
end; $$;
revoke all on function public.dev_anime_list() from public, anon;
grant execute on function public.dev_anime_list() to authenticated;

-- Developer: tambah (p_id kosong) atau ubah (p_id diisi) anime. Anime BARU otomatis mengirim notifikasi ke semua pengguna.
-- ATURAN: judul 2-120 (tanpa < >), poster link https gambar (jpg/png/webp/gif/avif), sinopsis 30-2000 huruf (tanpa tag HTML),
--         genre 1-5 (unik, 2-30 karakter), judul tidak boleh kembar, maksimal 500 anime buatan.
create or replace function public.dev_anime_save(
  p_title text, p_poster text, p_synopsis text, p_genres text[],
  p_status text default 'Ongoing', p_type text default 'TV', p_id text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare ttl text; pos text; syn text; gl text[] := '{}'; g text; rid text; c int;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  ttl := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  if char_length(ttl) < 2 or char_length(ttl) > 120 then raise exception 'Judul harus 2 sampai 120 huruf'; end if;
  if ttl ~ '[[:cntrl:]<>]' then raise exception 'Judul tidak boleh memuat karakter < > atau karakter kontrol'; end if;
  pos := btrim(coalesce(p_poster, ''));
  if char_length(pos) > 600 or pos !~* '^https://[^\s"''<>]+\.(jpe?g|png|webp|gif|avif)(\?[^\s"''<>]{0,30})?$' then
    raise exception 'Poster harus link https langsung ke gambar (.jpg .png .webp .gif .avif)';
  end if;
  syn := btrim(replace(coalesce(p_synopsis, ''), E'\r', ''));
  if char_length(syn) < 30 or char_length(syn) > 2000 then raise exception 'Sinopsis harus 30 sampai 2000 huruf'; end if;
  if syn ~ '<[A-Za-z/!]' then raise exception 'Sinopsis tidak boleh memuat tag HTML'; end if;
  if p_genres is null then raise exception 'Pilih minimal 1 genre'; end if;
  foreach g in array p_genres loop
    g := btrim(coalesce(g, ''));
    if g !~ '^[A-Za-z0-9 &./+-]{2,30}$' then raise exception 'Genre "%" tidak valid (2-30 huruf/angka)', g; end if;
    if lower(g) = any (select lower(x) from unnest(gl) x) then raise exception 'Genre "%" dobel', g; end if;
    gl := gl || g;
  end loop;
  if cardinality(gl) < 1 or cardinality(gl) > 5 then raise exception 'Pilih 1 sampai 5 genre'; end if;
  if p_status not in ('Ongoing', 'Completed', 'Upcoming') then raise exception 'Status tidak valid'; end if;
  if p_type not in ('TV', 'Movie', 'OVA', 'ONA', 'Special') then raise exception 'Tipe tidak valid'; end if;

  begin
    if p_id is null or btrim(p_id) = '' then
      if (select count(*) from public.custom_anime) >= 500 then raise exception 'Batas 500 anime buatan sudah tercapai'; end if;
      insert into public.custom_anime (title, poster, synopsis, genres, status, type)
      values (ttl, pos, syn, gl, p_status, p_type) returning id into rid;
      -- Anime baru -> notifikasi otomatis ke semua pengguna
      insert into public.notifications (user_id, type, title, body, data, dedupe_key)
      select p.user_id, 'new_anime', left(ttl, 120), 'Anime baru ditambahkan ke WakuPlay!',
             jsonb_build_object('anime_id', rid, 'poster', pos, 'number', null), 'na-' || rid
        from public.profiles p
      on conflict do nothing;
    else
      if p_id !~ '^c_[a-f0-9]{12}$' then raise exception 'ID anime tidak valid'; end if;
      update public.custom_anime set title = ttl, poster = pos, synopsis = syn, genres = gl, status = p_status, type = p_type, updated_at = now()
       where id = p_id returning id into rid;
      if rid is null then raise exception 'Anime tidak ditemukan'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Judul "%" sudah ada di daftar anime buatan', ttl;
  end;
  return rid;
end; $$;
revoke all on function public.dev_anime_save(text, text, text, text[], text, text, text) from public, anon;
grant execute on function public.dev_anime_save(text, text, text, text[], text, text, text) to authenticated;

-- Developer: hapus anime buatan beserta episode tambahan & notifikasinya
create or replace function public.dev_anime_delete(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_id is null or p_id !~ '^c_[a-f0-9]{12}$' then raise exception 'ID anime tidak valid'; end if;
  delete from public.extra_episodes where anime_id = p_id;
  delete from public.new_eps_feed where anime_id = p_id;
  delete from public.notifications where data->>'anime_id' = p_id;
  delete from public.custom_anime where id = p_id;
end; $$;
revoke all on function public.dev_anime_delete(text) from public, anon;
grant execute on function public.dev_anime_delete(text) to authenticated;

-- ============================================================ 2) EPISODE BARU dari Panel Developer -> notifikasi otomatis
-- Hanya SATU notifikasi per simpan (nomor episode baru TERTINGGI) supaya mengisi episode lama tidak membanjiri notifikasi.
-- Nomor yang sudah pernah ada / hanya mengganti episode rusak TIDAK memicu notifikasi.
-- Penerima: yang memfavoritkan, yang menonton anime itu (180 hari terakhir), dan developer yang menyimpan (sebagai bukti terkirim).
-- p_all = true -> kirim ke SEMUA pengguna. Kalau pengguna sudah pernah dapat notifikasi nomor yang sama (mis. episode dihapus lalu ditambah lagi),
-- notifikasinya dimunculkan lagi (bukan diam-diam dilewati). Mengembalikan jsonb: saved, notified, is_new, newest.
drop function if exists public.dev_extra_save(text, jsonb);
drop function if exists public.dev_extra_save(text, jsonb, text, text, boolean);
create or replace function public.dev_extra_save(p_anime text, p_rows jsonb, p_title text default null, p_poster text default null, p_notify boolean default true, p_all boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; n numeric; k text; f text; t text; cnt int := 0; seen numeric[] := '{}'; existed boolean; newmax numeric := null; ttl text; pos text; epl text; sent int := 0;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_anime is null or p_anime !~ '^[A-Za-z0-9_:.-]{1,120}$' then raise exception 'ID anime tidak valid'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Data episode tidak valid'; end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 200 then raise exception 'Kirim 1 sampai 200 episode sekali simpan'; end if;
  if (select count(*) from public.extra_episodes where anime_id = p_anime) > 3000 then raise exception 'Terlalu banyak episode tambahan untuk anime ini'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin n := (r ->> 'number')::numeric; exception when others then raise exception 'Nomor episode tidak valid'; end;
    k := r ->> 'kind'; f := btrim(coalesce(r ->> 'ref', '')); t := nullif(btrim(coalesce(r ->> 'title', '')), '');
    if n is null or n <= 0 or n > 99999 then raise exception 'Nomor episode harus 1 sampai 99999'; end if;
    if n = any(seen) then raise exception 'Nomor episode % dobel dalam satu kiriman', n; end if;
    seen := seen || n;
    if k = 'api' then
      if f !~ '^[A-Za-z0-9_:.-]{1,120}$' then raise exception 'Episode %: ID episode API tidak valid', n; end if;
    elsif k = 'link' then
      if char_length(f) > 600 or f !~ '^https://[^\s"''<>]+$' then raise exception 'Episode %: link harus diawali https:// tanpa spasi', n; end if;
    else raise exception 'Episode %: jenis harus api atau link', n; end if;
    if t is not null and char_length(t) > 120 then raise exception 'Judul episode % terlalu panjang', n; end if;
    select exists (select 1 from public.extra_episodes where anime_id = p_anime and number = n) into existed;
    insert into public.extra_episodes (anime_id, number, title, kind, ref)
    values (p_anime, n, t, k, f)
    on conflict (anime_id, number) do update set title = excluded.title, kind = excluded.kind, ref = excluded.ref, created_by = auth.uid(), created_at = now();
    cnt := cnt + 1;
    if not existed and (newmax is null or n > newmax) then newmax := n; end if;
  end loop;

  if newmax is not null then
    ttl := left(coalesce(nullif(btrim(coalesce(p_title, '')), ''), (select a.title from public.custom_anime a where a.id = p_anime), 'Anime'), 120);
    pos := case when char_length(btrim(coalesce(p_poster, ''))) <= 600 and btrim(coalesce(p_poster, '')) ~ '^https://[^\s"''<>]+$' then btrim(p_poster)
                else (select a.poster from public.custom_anime a where a.id = p_anime) end;
    epl := case when newmax = trunc(newmax) then trunc(newmax)::text else trim(trailing '0' from newmax::text) end;
    -- Catat untuk "New Eps Anime" di beranda (selalu, tidak tergantung pilihan notifikasi)
    insert into public.new_eps_feed (anime_id, title, poster, number, updated_at)
    values (p_anime, ttl, pos, newmax, now())
    on conflict (anime_id) do update set
      title = excluded.title,
      poster = coalesce(excluded.poster, public.new_eps_feed.poster),
      number = case when public.new_eps_feed.updated_at > now() - interval '14 days' then greatest(public.new_eps_feed.number, excluded.number) else excluded.number end,
      updated_at = now();
  end if;
  if coalesce(p_notify, true) and newmax is not null then
    insert into public.notifications (user_id, type, title, body, data, dedupe_key)
    select u.user_id, 'episode', ttl, 'Episode ' || epl || ' sudah tayang di WakuPlay!',
           jsonb_build_object('anime_id', p_anime, 'episode_id', null, 'poster', pos, 'number', newmax::text),
           'ep-' || left(p_anime, 80) || '-' || newmax::text
      from (select user_id from public.favorites where anime_id = p_anime
            union
            select user_id from public.watch_history where anime_id = p_anime and updated_at > now() - interval '180 days'
            union
            select auth.uid()
            union
            select user_id from public.profiles where coalesce(p_all, false)) u
    where u.user_id is not null
    on conflict (user_id, dedupe_key) where dedupe_key is not null
    do update set created_at = now(), read_at = null, title = excluded.title, body = excluded.body, data = excluded.data;
    get diagnostics sent = row_count;
  end if;
  return jsonb_build_object('saved', cnt, 'notified', sent, 'is_new', newmax is not null, 'newest', epl);
end; $$;
revoke all on function public.dev_extra_save(text, jsonb, text, text, boolean, boolean) from public, anon;
grant execute on function public.dev_extra_save(text, jsonb, text, text, boolean, boolean) to authenticated;
