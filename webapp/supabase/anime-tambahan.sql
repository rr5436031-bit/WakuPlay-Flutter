-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Fitur: Panel Developer > tab "Upload Anime". Menambah / memperbaiki episode anime yang kosong atau rusak di API anime,
-- TANPA upload file mp4. Episode tambahan menunjuk ke:
--   kind 'api'  = ID episode milik API anime (bisa dari anime lain di API yang sama). Stream tetap diambil dari API saat diputar.
--   kind 'link' = link stream https (m3u8 / halaman embed), dipakai kalau episode tidak ada di API sama sekali.
-- Episode tambahan dengan nomor yang sama MENGGANTI episode dari API (untuk memperbaiki episode yang rusak).
-- ATURAN KETAT: tulis/hapus hanya developer lewat fungsi di bawah (tabel tertutup untuk akses langsung), semua isian divalidasi di server.

create table if not exists public.extra_episodes (
  id         uuid primary key default gen_random_uuid(),
  anime_id   text not null check (anime_id ~ '^[A-Za-z0-9_:.-]{1,120}$'),
  number     numeric not null check (number > 0 and number <= 99999),
  title      text check (title is null or char_length(title) <= 120),
  kind       text not null check (kind in ('api', 'link')),
  ref        text not null check (char_length(ref) between 1 and 600),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (anime_id, number),
  check ((kind = 'api'  and ref ~ '^[A-Za-z0-9_:.-]{1,120}$')
      or (kind = 'link' and ref ~ '^https://[^\s"''<>]+$'))
);
alter table public.extra_episodes enable row level security;
revoke all on public.extra_episodes from anon, authenticated;     -- tanpa kebijakan = tidak bisa diakses langsung; hanya lewat fungsi

-- Dibaca semua user yang login: daftar episode tambahan satu anime (link stream TIDAK ikut dikirim, hanya saat diputar)
create or replace function public.extra_episodes_of(p_anime text)
returns table (id uuid, number numeric, title text, kind text, ref text)
language sql stable security definer set search_path = public as $$
  select e.id, e.number, e.title, e.kind, case when e.kind = 'api' then e.ref else null end
  from public.extra_episodes e
  where auth.uid() is not null and e.anime_id = p_anime
  order by e.number
  limit 2000;
$$;
revoke all on function public.extra_episodes_of(text) from public, anon;
grant execute on function public.extra_episodes_of(text) to authenticated;

-- Link stream satu episode tambahan (dipanggil saat episode diputar)
create or replace function public.extra_episode_stream(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select e.ref from public.extra_episodes e where auth.uid() is not null and e.id = p_id and e.kind = 'link';
$$;
revoke all on function public.extra_episode_stream(uuid) from public, anon;
grant execute on function public.extra_episode_stream(uuid) to authenticated;

-- Developer: daftar lengkap (termasuk ref)
create or replace function public.dev_extra_list(p_anime text)
returns table (id uuid, number numeric, title text, kind text, ref text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  return query select e.id, e.number, e.title, e.kind, e.ref, e.created_at
               from public.extra_episodes e where e.anime_id = p_anime order by e.number limit 2000;
end; $$;
revoke all on function public.dev_extra_list(text) from public, anon;
grant execute on function public.dev_extra_list(text) to authenticated;

-- Developer: simpan banyak episode sekaligus (maks 200 per kirim). Nomor sama = diganti.
-- p_rows: [{"number":7,"kind":"api","ref":"abc123","title":"opsional"}, ...]
create or replace function public.dev_extra_save(p_anime text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n numeric; k text; f text; t text; cnt int := 0; seen numeric[] := '{}';
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
      if f !~ '^https://[^\s"''<>]+$' then raise exception 'Episode %: link harus diawali https:// tanpa spasi', n; end if;
    else raise exception 'Episode %: jenis harus api atau link', n; end if;
    if t is not null and char_length(t) > 120 then raise exception 'Judul episode % terlalu panjang', n; end if;
    insert into public.extra_episodes (anime_id, number, title, kind, ref)
    values (p_anime, n, t, k, f)
    on conflict (anime_id, number) do update set title = excluded.title, kind = excluded.kind, ref = excluded.ref, created_by = auth.uid(), created_at = now();
    cnt := cnt + 1;
  end loop;
  return cnt;
end; $$;
revoke all on function public.dev_extra_save(text, jsonb) from public, anon;
grant execute on function public.dev_extra_save(text, jsonb) to authenticated;

create or replace function public.dev_extra_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  delete from public.extra_episodes where id = p_id;
end; $$;
revoke all on function public.dev_extra_delete(uuid) from public, anon;
grant execute on function public.dev_extra_delete(uuid) to authenticated;

create or replace function public.dev_extra_clear(p_anime text) returns int
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  delete from public.extra_episodes where anime_id = p_anime;
  get diagnostics c = row_count;
  return c;
end; $$;
revoke all on function public.dev_extra_clear(text) from public, anon;
grant execute on function public.dev_extra_clear(text) to authenticated;
