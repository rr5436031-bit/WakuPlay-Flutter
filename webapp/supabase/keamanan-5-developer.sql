-- Jalankan di Supabase -> SQL Editor -> New query -> Run (aman dijalankan berulang)
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
