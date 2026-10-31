-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Fitur: lihat profil user lain + banner profil (.gif)

alter table public.profiles add column if not exists banner_url text;

-- Pasang / hapus banner milik sendiri (hanya link http(s) berbentuk .gif; kosong = hapus banner)
create or replace function public.set_my_banner(p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v is not null and (char_length(v) > 500 or v !~* '^https?://[^[:space:]]+$' or v !~* '\.gif($|[?#])') then
    raise exception 'Link banner harus berupa URL .gif';
  end if;
  insert into public.profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.profiles set banner_url = v where user_id = auth.uid();
end; $$;
revoke all on function public.set_my_banner(text) from public, anon;
grant execute on function public.set_my_banner(text) to authenticated;

-- Data profil publik satu user (nama & foto terbaru, ID #, role, banner, XP, jumlah komentar, tanggal gabung)
create or replace function public.get_public_profile(p_uid uuid)
returns table (user_id uuid, name text, avatar text, seq bigint, role text, banner_url text, joined timestamptz, xp numeric, comments bigint)
language sql stable security definer set search_path = public as $$
  select p.user_id,
         coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
         u.raw_user_meta_data->>'avatar_url',
         p.seq, p.role, p.banner_url,
         -- developer & admin: tanggal gabung, XP & jumlah komentar TIDAK dikirim sama sekali (aplikasi menampilkannya sebagai unlimited)
         case when p.role in ('developer', 'admin') then null else coalesce(u.created_at, p.created_at) end,
         case when p.role in ('developer', 'admin') then null else coalesce((select x.xp from public.user_xp x where x.user_id = p.user_id), 0) end,
         case when p.role in ('developer', 'admin') then null else (select count(*) from public.comments c where c.user_id = p.user_id) end
  from public.profiles p
  left join auth.users u on u.id = p.user_id
  where p.user_id = p_uid;
$$;
revoke all on function public.get_public_profile(uuid) from public, anon;
grant execute on function public.get_public_profile(uuid) to authenticated;

-- Riwayat tonton user lain (hanya bisa dibaca, maks. 60 terbaru)
create or replace function public.get_public_history(p_uid uuid, p_limit int default 40)
returns setof public.watch_history
language sql stable security definer set search_path = public as $$
  select h.* from public.watch_history h
  where h.user_id = p_uid
    and not exists (select 1 from public.profiles d where d.user_id = p_uid and d.role in ('developer', 'admin'))   -- riwayat developer & admin tidak bisa dilihat siapa pun
  order by h.updated_at desc limit least(greatest(p_limit, 1), 60);
$$;
revoke all on function public.get_public_history(uuid, int) from public, anon;
grant execute on function public.get_public_history(uuid, int) to authenticated;

-- Komentar milik satu user (untuk tab Komentar di profil). Komentar developer & admin tidak dikembalikan.
create or replace function public.get_public_comments(p_uid uuid, p_limit int default 40)
returns setof public.comments
language sql stable security definer set search_path = public as $$
  select c.* from public.comments c
  where c.user_id = p_uid
    and not exists (select 1 from public.profiles d where d.user_id = p_uid and d.role in ('developer', 'admin'))
  order by c.created_at desc limit least(greatest(p_limit, 1), 60);
$$;
revoke all on function public.get_public_comments(uuid, int) from public, anon;
grant execute on function public.get_public_comments(uuid, int) to authenticated;

-- Nomor ID (#) beberapa user sekaligus (untuk ditampilkan di komentar). Hanya nomor, tidak ada data lain.
create or replace function public.get_user_seqs(p_ids uuid[])
returns table (user_id uuid, seq bigint)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.seq from public.profiles p where p.user_id = any(p_ids) limit 200;
$$;
revoke all on function public.get_user_seqs(uuid[]) from public, anon;
grant execute on function public.get_user_seqs(uuid[]) to authenticated;
