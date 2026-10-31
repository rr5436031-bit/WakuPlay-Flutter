-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Buff XP: tiap 1 menit menonton = +150 XP (sebelumnya 3,5; kini di-nerf jadi 150). Anti-curang tetap: maksimal 1x per ~55 detik.
-- Rumus level ada di aplikasi (src/lib/xp.js): Lvl 999.999 butuh sekitar 4 juta XP.
-- Butuh tabel xp_daily dari leaderboard-xp.sql.

create or replace function public.add_xp() returns numeric
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cur numeric;
  n   int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  insert into public.user_xp (user_id, xp, last_tick) values (uid, 0, now() - interval '1 hour')
  on conflict (user_id) do nothing;
  update public.user_xp set xp = xp + 150, last_tick = now()
   where user_id = uid and last_tick <= now() - interval '55 seconds';
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.xp_daily (user_id, day, gained)
    values (uid, (now() at time zone 'Asia/Jakarta')::date, 150)
    on conflict (user_id, day) do update set gained = public.xp_daily.gained + 150;
  end if;
  select xp into cur from public.user_xp where user_id = uid;
  return cur;
end; $$;
revoke all on function public.add_xp() from public, anon;
grant execute on function public.add_xp() to authenticated;
