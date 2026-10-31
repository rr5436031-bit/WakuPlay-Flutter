-- Jalankan di Supabase -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Daftar admin/moderator yang SEDANG berlaku, bisa dibaca semua user login (untuk centang di chat & komentar).
-- Hanya mengeluarkan id user + role staf; ID (#) dan data profil lain tetap privat.
create or replace function public.get_staff() returns table (user_id uuid, role text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.role from public.profiles p where p.role in ('moderator', 'admin');
$$;
revoke all on function public.get_staff() from public, anon;
grant execute on function public.get_staff() to authenticated;
