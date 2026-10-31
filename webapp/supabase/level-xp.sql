-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
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
  -- +150 XP per menit; permintaan yang datang < 55 detik setelah sebelumnya diabaikan (anti-curang)
  update public.user_xp set xp = xp + 150, last_tick = now()
   where user_id = uid and last_tick <= now() - interval '55 seconds';
  select xp into cur from public.user_xp where user_id = uid;
  return cur;
end; $$;
revoke all on function public.add_xp() from public, anon;
grant execute on function public.add_xp() to authenticated;
