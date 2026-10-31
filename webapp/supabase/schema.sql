-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run
-- Hanya memakai RLS; tidak ada Secret Key di aplikasi.

create table if not exists public.favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  anime_id   text not null,
  title      text,
  poster     text,
  created_at timestamptz not null default now(),
  primary key (user_id, anime_id)
);

create table if not exists public.watch_history (
  user_id        uuid not null references auth.users(id) on delete cascade,
  anime_id       text not null,
  episode_id     text not null,
  episode_number text,
  anime_title    text,
  anime_poster   text,
  progress       integer not null default 0,
  duration       integer not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (user_id, episode_id)
);
create index if not exists watch_history_user_updated on public.watch_history (user_id, updated_at desc);
create index if not exists watch_history_user_anime on public.watch_history (user_id, anime_id);

alter table public.favorites enable row level security;
alter table public.watch_history enable row level security;

drop policy if exists "favorites own select" on public.favorites;
drop policy if exists "favorites own insert" on public.favorites;
drop policy if exists "favorites own update" on public.favorites;
drop policy if exists "favorites own delete" on public.favorites;
create policy "favorites own select" on public.favorites for select using ((select auth.uid()) = user_id);
create policy "favorites own insert" on public.favorites for insert with check ((select auth.uid()) = user_id);
create policy "favorites own update" on public.favorites for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "favorites own delete" on public.favorites for delete using ((select auth.uid()) = user_id);

drop policy if exists "history own select" on public.watch_history;
drop policy if exists "history own insert" on public.watch_history;
drop policy if exists "history own update" on public.watch_history;
drop policy if exists "history own delete" on public.watch_history;
create policy "history own select" on public.watch_history for select using ((select auth.uid()) = user_id);
create policy "history own insert" on public.watch_history for insert with check ((select auth.uid()) = user_id);
create policy "history own update" on public.watch_history for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "history own delete" on public.watch_history for delete using ((select auth.uid()) = user_id);

-- ===== Komentar & laporan (halaman nonton) =====
create table if not exists public.comments (
  id         bigint generated always as identity primary key,
  episode_id text not null,
  anime_id   text,
  user_id    uuid not null references auth.users(id) on delete cascade,
  user_name  text,
  user_avatar text,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists comments_episode_created on public.comments (episode_id, created_at desc);

create table if not exists public.reports (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  anime_id   text,
  episode_id text,
  reason     text not null,
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;
alter table public.reports enable row level security;

drop policy if exists "comments read" on public.comments;
drop policy if exists "comments insert own" on public.comments;
drop policy if exists "comments delete own" on public.comments;
create policy "comments read" on public.comments for select to authenticated using (true);
create policy "comments insert own" on public.comments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "comments delete own" on public.comments for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "reports insert own" on public.reports;
create policy "reports insert own" on public.reports for insert to authenticated with check ((select auth.uid()) = user_id);


-- ===== ID urut pengguna (#1, #2, ...) =====
-- Nomor diambil dari satu baris penghitung yang dikunci (row lock) di dalam transaksi yang sama dengan
-- pembuatan profil. Dua orang yang login di detik yang sama akan antre: yang pertama dapat #N, yang kedua #N+1.
-- Tidak ada duplikat dan tidak ada nomor bolong (kalau pendaftaran gagal, nomornya ikut dibatalkan).
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  seq        bigint unique,
  created_at timestamptz not null default now()
);
-- Jika tabel lama masih memakai identity, lepas (nomor yang sudah ada tetap dipertahankan)
alter table public.profiles alter column seq drop identity if exists;
alter table public.profiles enable row level security;
drop policy if exists "profiles own select" on public.profiles;
create policy "profiles own select" on public.profiles for select using ((select auth.uid()) = user_id);

create table if not exists public.profile_counter (
  id       int primary key default 1 check (id = 1),
  last_seq bigint not null default 0
);
alter table public.profile_counter enable row level security;
insert into public.profile_counter (id, last_seq)
values (1, coalesce((select max(seq) from public.profiles), 0))
on conflict (id) do nothing;

create or replace function public.assign_profile_seq() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.seq is null then
    update public.profile_counter set last_seq = last_seq + 1 where id = 1 returning last_seq into new.seq;
  end if;
  return new;
end; $$;
drop trigger if exists profiles_assign_seq on public.profiles;
create trigger profiles_assign_seq before insert on public.profiles for each row execute function public.assign_profile_seq();

-- Otomatis dibuat saat user baru pertama kali login (akun dibuat di auth.users)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Cadangan dipanggil aplikasi bila profil belum ada
create or replace function public.ensure_profile() returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select seq into v from public.profiles where user_id = auth.uid();
  if v is null then
    insert into public.profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
    select seq into v from public.profiles where user_id = auth.uid();
  end if;
  return v;
end; $$;
revoke all on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;

-- Beri nomor untuk akun yang sudah ada, urut berdasarkan waktu daftar (yang paling awal = #1)
insert into public.profiles (user_id)
select u.id from auth.users u
where not exists (select 1 from public.profiles p where p.user_id = u.id)
order by u.created_at;


-- ===== Chat global (file terpisah: supabase/chat-global.sql) =====
create table if not exists public.global_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  user_name   text,
  user_avatar text,
  user_seq    bigint,
  body        text not null check (char_length(body) between 1 and 500),
  reply_to    bigint,
  reply_name  text,
  reply_body  text,
  created_at  timestamptz not null default now()
);
create index if not exists global_messages_created on public.global_messages (created_at desc);

alter table public.global_messages enable row level security;
drop policy if exists "gchat read" on public.global_messages;
drop policy if exists "gchat insert own" on public.global_messages;
drop policy if exists "gchat delete own" on public.global_messages;
create policy "gchat read" on public.global_messages for select to authenticated using (true);
create policy "gchat insert own" on public.global_messages for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "gchat delete own" on public.global_messages for delete to authenticated using ((select auth.uid()) = user_id);

-- Realtime (pesan baru muncul langsung tanpa refresh)
do $$ begin
  alter publication supabase_realtime add table public.global_messages;
exception when duplicate_object then null; end $$;
alter table public.global_messages replica identity full;


-- ===== Level & XP (file terpisah: supabase/level-xp.sql) =====
create table if not exists public.user_xp (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  xp        numeric(14,2) not null default 0,
  last_tick timestamptz not null default now()
);
alter table public.user_xp enable row level security;
drop policy if exists "xp read all" on public.user_xp;
-- Semua user login boleh MELIHAT XP/level (untuk ditampilkan di chat). Tidak ada policy tulis:
-- XP hanya bisa bertambah lewat fungsi add_xp() di bawah, jadi tidak bisa diubah-ubah dari aplikasi.
create policy "xp read all" on public.user_xp for select to authenticated using (true);

create or replace function public.add_xp() returns numeric
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cur numeric;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  insert into public.user_xp (user_id, xp, last_tick) values (uid, 0, now() - interval '1 hour')
  on conflict (user_id) do nothing;
  -- +3.5 XP per menit; permintaan yang datang < 55 detik setelah sebelumnya diabaikan (anti-curang)
  update public.user_xp set xp = xp + 3.5, last_tick = now()
   where user_id = uid and last_tick <= now() - interval '55 seconds';
  select xp into cur from public.user_xp where user_id = uid;
  return cur;
end; $$;
revoke all on function public.add_xp() from public, anon;
grant execute on function public.add_xp() to authenticated;


-- ===== Keamanan (file terpisah: supabase/keamanan.sql) =====
-- ============================================================
-- KEAMANAN WakuPlay: ID, level/XP, role, dan anti-pemalsuan data
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run
-- (aman dijalankan berulang). Jalankan SETELAH schema.sql, chat-global.sql, level-xp.sql.
-- ============================================================

-- ---------- 1) ROLE & BISU di profil (tidak bisa diubah user dari aplikasi) ----------
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists muted_until timestamptz;
do $$ begin
  alter table public.profiles add constraint profiles_role_check check (role in ('user', 'moderator', 'admin'));
exception when duplicate_object then null; end $$;

-- ---------- 2) CABUT HAK TULIS LANGSUNG ke tabel penting ----------
-- ID (#), role, XP/level hanya bisa berubah lewat fungsi server (trigger / add_xp), bukan dari aplikasi.
revoke all on public.profiles, public.profile_counter, public.user_xp from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;
revoke insert, update, delete, truncate on public.user_xp from authenticated;
revoke all on public.profile_counter from authenticated;
-- Chat & komentar: tidak boleh diedit setelah dikirim (hanya kirim & hapus milik sendiri)
revoke all on public.global_messages from anon;
revoke update, truncate on public.global_messages from authenticated;
revoke all on public.comments from anon;
revoke update, truncate on public.comments from authenticated;

-- ---------- 3) Pembantu: apakah user ini staf (moderator/admin)? ----------
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role in ('moderator', 'admin'));
$$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- Staf boleh menghapus pesan/komentar siapa pun (moderasi)
drop policy if exists "gchat delete staff" on public.global_messages;
create policy "gchat delete staff" on public.global_messages for delete to authenticated using (public.is_staff());
drop policy if exists "comments delete staff" on public.comments;
create policy "comments delete staff" on public.comments for delete to authenticated using (public.is_staff());

-- ---------- 4) CHAT GLOBAL: identitas SELALU dari server ----------
alter table public.global_messages add column if not exists user_role text;

create or replace function public.chat_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  r public.global_messages;
  nm text;
  av text;
  recent int;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Tidak diizinkan';
  end if;

  select * into p from public.profiles where user_id = new.user_id;
  if p.muted_until is not null and p.muted_until > now() then
    raise exception 'Kamu sedang dibisukan sampai % WIB', to_char(p.muted_until at time zone 'Asia/Jakarta', 'DD/MM HH24:MI');
  end if;

  -- isi pesan: buang karakter kontrol, tidak boleh kosong
  new.body := btrim(regexp_replace(new.body, '[[:cntrl:]]', '', 'g'));
  if char_length(new.body) = 0 then raise exception 'Pesan kosong'; end if;

  -- anti-spam: maksimal 5 pesan per 10 detik
  select count(*) into recent from public.global_messages where user_id = new.user_id and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'Terlalu cepat, tunggu beberapa detik'; end if;

  -- nama, foto, ID, role: diambil server-side, kiriman dari aplikasi DIABAIKAN (tidak bisa dipalsukan)
  select coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''),
                  nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
         u.raw_user_meta_data->>'avatar_url'
    into nm, av from auth.users u where u.id = new.user_id;
  nm := left(btrim(regexp_replace(coalesce(nm, ''), '[^[:alnum:] ]', '', 'g')), 20);
  new.user_name   := coalesce(nullif(nm, ''), 'User');
  new.user_avatar := case when av ~ '^https://[a-z0-9-]+\.googleusercontent\.com/' and length(av) <= 500 then av else null end;
  new.user_seq    := p.seq;
  new.user_role   := coalesce(p.role, 'user');

  -- kutipan balasan: diambil dari pesan aslinya, bukan dari kiriman user
  if new.reply_to is not null then
    select * into r from public.global_messages where id = new.reply_to;
    if found then
      new.reply_name := r.user_name; new.reply_body := left(r.body, 120);
    else
      new.reply_to := null; new.reply_name := null; new.reply_body := null;
    end if;
  else
    new.reply_name := null; new.reply_body := null;
  end if;

  new.created_at := now();
  return new;
end; $$;
drop trigger if exists gchat_before_insert on public.global_messages;
create trigger gchat_before_insert before insert on public.global_messages for each row execute function public.chat_before_insert();

-- ---------- 5) KOMENTAR: identitas dari server + anti-spam ----------
create or replace function public.comment_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  nm text;
  av text;
  recent int;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Tidak diizinkan';
  end if;
  select * into p from public.profiles where user_id = new.user_id;
  if p.muted_until is not null and p.muted_until > now() then
    raise exception 'Kamu sedang dibisukan sampai % WIB', to_char(p.muted_until at time zone 'Asia/Jakarta', 'DD/MM HH24:MI');
  end if;
  new.body := btrim(regexp_replace(new.body, '[[:cntrl:]]', ' ', 'g'));
  if char_length(new.body) = 0 then raise exception 'Komentar kosong'; end if;
  select count(*) into recent from public.comments where user_id = new.user_id and created_at > now() - interval '30 seconds';
  if recent >= 5 then raise exception 'Terlalu cepat, tunggu beberapa detik'; end if;

  select coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''),
                  nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
         u.raw_user_meta_data->>'avatar_url'
    into nm, av from auth.users u where u.id = new.user_id;
  nm := left(btrim(regexp_replace(coalesce(nm, ''), '[^[:alnum:] ]', '', 'g')), 20);
  new.user_name   := coalesce(nullif(nm, ''), 'User');
  new.user_avatar := case when av ~ '^https://[a-z0-9-]+\.googleusercontent\.com/' and length(av) <= 500 then av else null end;
  new.created_at  := now();
  return new;
end; $$;
drop trigger if exists comment_before_insert on public.comments;
create trigger comment_before_insert before insert on public.comments for each row execute function public.comment_before_insert();

-- ============================================================
-- CARA PAKAI (jalankan manual di SQL Editor bila perlu):
--   Jadikan admin / moderator (ganti angka dengan ID # user):
--     update public.profiles set role = 'admin'     where seq = 1;
--     update public.profiles set role = 'moderator' where seq = 5;
--   Bisukan user 1 jam / buka bisu:
--     update public.profiles set muted_until = now() + interval '1 hour' where seq = 7;
--     update public.profiles set muted_until = null where seq = 7;
--   Cek semua aturan (RLS) yang aktif:
--     select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by 1, 2;
-- ============================================================


-- ===== Role live (file terpisah: supabase/keamanan-4-role-live.sql) =====
-- Daftar admin/moderator yang SEDANG berlaku, bisa dibaca semua user login (untuk centang di chat & komentar).
-- Hanya mengeluarkan id user + role staf; ID (#) dan data profil lain tetap privat.
create or replace function public.get_staff() returns table (user_id uuid, role text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.role from public.profiles p where p.role in ('moderator', 'admin');
$$;
revoke all on function public.get_staff() from public, anon;
grant execute on function public.get_staff() to authenticated;


-- ===== Role developer (file terpisah: supabase/keamanan-5-developer.sql) =====
-- Menambah role "developer" (pangkat tertinggi: developer > admin > moderator > user).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'moderator', 'admin', 'developer'));

-- Developer, admin, dan moderator semuanya dianggap staf (boleh menghapus pesan/komentar siapa pun)
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role in ('moderator', 'admin', 'developer'));
$$;

create or replace function public.get_staff() returns table (user_id uuid, role text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.role from public.profiles p where p.role in ('moderator', 'admin', 'developer');
$$;
revoke all on function public.get_staff() from public, anon;
grant execute on function public.get_staff() to authenticated;

-- Cara memberi pangkat (ganti angka dengan ID # user):
--   update public.profiles set role = 'developer' where seq = 1;


-- ===== Panel Developer (file terpisah: supabase/keamanan-6-panel-developer.sql) =====
-- Panel Developer: daftar user + ubah data. SEMUA fungsi mengecek role = 'developer' di server,
-- jadi user biasa / admin / moderator tidak bisa memakainya walau memanggil API langsung.

-- Catatan perubahan (siapa mengubah apa) - hanya bisa dibaca lewat SQL Editor
create table if not exists public.dev_audit (
  id         bigint generated always as identity primary key,
  actor      uuid,
  target     uuid,
  field      text,
  old_value  text,
  new_value  text,
  created_at timestamptz not null default now()
);
alter table public.dev_audit enable row level security;
revoke all on public.dev_audit from anon, authenticated;

create or replace function public.is_developer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'developer');
$$;
revoke all on function public.is_developer() from public, anon;
grant execute on function public.is_developer() to authenticated;

-- Daftar user (cari: #ID, nama, email, atau awalan UID)
create or replace function public.dev_list_users(p_q text default '', p_limit int default 50, p_offset int default 0)
returns table (user_id uuid, seq bigint, name text, email text, role text, xp numeric, muted_until timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  qq text := btrim(coalesce(p_q, ''));
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  return query
  select p.user_id, p.seq, d.nm, u.email::text, p.role, coalesce(x.xp, 0), p.muted_until, u.created_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join public.user_xp x on x.user_id = p.user_id
    cross join lateral (
      select coalesce(nullif(left(btrim(regexp_replace(coalesce(
               nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''),
               nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)), '[^[:alnum:] ]', '', 'g')), 20), ''), 'User') as nm
    ) d
   where qq = ''
      or (case when qq ~ '^#?[0-9]{1,15}$' then p.seq = regexp_replace(qq, '^#', '')::bigint else false end)
      or p.user_id::text ilike qq || '%'
      or d.nm ilike '%' || qq || '%'
      or u.email ilike '%' || qq || '%'
   order by p.seq asc nulls last
   limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end; $$;
revoke all on function public.dev_list_users(text, int, int) from public, anon;
grant execute on function public.dev_list_users(text, int, int) to authenticated;

-- Ubah satu kolom user: role | seq (ID #) | xp | muted_until | name
create or replace function public.dev_update_user(p_target uuid, p_field text, p_val text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v text := nullif(btrim(coalesce(p_val, '')), '');
  v_old text;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if not exists (select 1 from public.profiles where user_id = p_target) then raise exception 'User tidak ditemukan'; end if;

  if p_field = 'role' then
    if v is null or v not in ('user', 'moderator', 'admin', 'developer') then raise exception 'Role tidak valid'; end if;
    select role into v_old from public.profiles where user_id = p_target;
    if v_old = 'developer' and v <> 'developer'
       and not exists (select 1 from public.profiles where role = 'developer' and user_id <> p_target) then
      raise exception 'Harus ada minimal 1 developer';
    end if;
    update public.profiles set role = v where user_id = p_target;

  elsif p_field = 'seq' then
    if v is null or v !~ '^[0-9]{1,12}$' then raise exception 'ID harus berupa angka'; end if;
    if v::bigint < 1 then raise exception 'ID minimal 1'; end if;
    if exists (select 1 from public.profiles where seq = v::bigint and user_id <> p_target) then
      raise exception 'ID # % sudah dipakai user lain', v;
    end if;
    select seq::text into v_old from public.profiles where user_id = p_target;
    update public.profiles set seq = v::bigint where user_id = p_target;
    -- penghitung ID user baru tidak boleh tertinggal di bawah ID tertinggi
    update public.profile_counter set last_seq = greatest(last_seq, (select coalesce(max(seq), 0) from public.profiles)) where id = 1;
    update public.global_messages set user_seq = v::bigint where user_id = p_target;

  elsif p_field = 'xp' then
    if v is null or v !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' then raise exception 'XP harus angka (maks. 2 desimal)'; end if;
    select xp::text into v_old from public.user_xp where user_id = p_target;
    insert into public.user_xp (user_id, xp, last_tick) values (p_target, v::numeric, now() - interval '1 hour')
    on conflict (user_id) do update set xp = excluded.xp;

  elsif p_field = 'muted_until' then
    select muted_until::text into v_old from public.profiles where user_id = p_target;
    if v is null then
      update public.profiles set muted_until = null where user_id = p_target;
    else
      begin
        update public.profiles set muted_until = v::timestamptz where user_id = p_target;
      exception when others then
        raise exception 'Format tanggal tidak valid';
      end;
    end if;

  elsif p_field = 'name' then
    v := regexp_replace(coalesce(v, ''), '\s+', ' ', 'g');
    if v !~ '^[A-Za-z0-9 ]{1,20}$' or btrim(v) = '' then raise exception 'Nama: 1-20 karakter, huruf/angka saja'; end if;
    select raw_user_meta_data->>'display_name' into v_old from auth.users where id = p_target;
    update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('display_name', v) where id = p_target;
    update public.global_messages set user_name = v where user_id = p_target;
    update public.comments set user_name = v where user_id = p_target;

  else
    raise exception 'Kolom tidak dikenal';
  end if;

  insert into public.dev_audit (actor, target, field, old_value, new_value) values (auth.uid(), p_target, p_field, v_old, v);
end; $$;
revoke all on function public.dev_update_user(uuid, text, text) from public, anon;
grant execute on function public.dev_update_user(uuid, text, text) to authenticated;

-- Lihat catatan perubahan:
--   select * from public.dev_audit order by id desc limit 50;
