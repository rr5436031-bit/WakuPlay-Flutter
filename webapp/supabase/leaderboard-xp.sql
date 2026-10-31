-- PERHATIAN: fungsi leaderboard di file ini sudah digantikan oleh dev-lb-gift.sql (XP LB + penyesuaian Developer).
-- Kalau database sudah memakai dev-lb-gift.sql, JANGAN jalankan ulang file ini.
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Leaderboard XP: Harian / Mingguan / Bulanan (hari dihitung zona waktu WIB)

create table if not exists public.xp_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  gained  numeric(14,2) not null default 0,
  primary key (user_id, day)
);
create index if not exists xp_daily_day on public.xp_daily (day);
alter table public.xp_daily enable row level security;
revoke all on public.xp_daily from anon, authenticated;

-- add_xp versi baru: selain menambah total XP, juga mencatat XP per hari
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

-- Top 50 per periode: 'daily' | 'weekly' | 'monthly'
create or replace function public.get_xp_leaderboard(p_period text default 'daily')
returns table (rank bigint, user_id uuid, name text, avatar text, seq bigint, role text, gain numeric, total_xp numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  from_day date;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  from_day := case p_period
    when 'weekly'  then date_trunc('week', today)::date
    when 'monthly' then date_trunc('month', today)::date
    else today end;
  return query
  select row_number() over (order by g.gain desc, g.user_id) as rank,
         g.user_id,
         coalesce(u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'full_name',
                  u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'User') as name,
         u.raw_user_meta_data->>'avatar_url' as avatar,
         p.seq, coalesce(p.role, 'user') as role, g.gain,
         coalesce(x.xp, 0) as total_xp
  from (select d.user_id, sum(d.gained) as gain from public.xp_daily d where d.day >= from_day group by d.user_id) g
  join auth.users u on u.id = g.user_id
  left join public.profiles p on p.user_id = g.user_id
  left join public.user_xp x on x.user_id = g.user_id
  order by g.gain desc, g.user_id
  limit 50;
end; $$;
revoke all on function public.get_xp_leaderboard(text) from public, anon;
grant execute on function public.get_xp_leaderboard(text) to authenticated;

-- Peringkat & XP milik sendiri pada periode itu (untuk kalau belum masuk 50 besar)
create or replace function public.get_my_xp_rank(p_period text default 'daily')
returns table (rank bigint, gain numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  from_day date;
  mine numeric;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  from_day := case p_period
    when 'weekly'  then date_trunc('week', today)::date
    when 'monthly' then date_trunc('month', today)::date
    else today end;
  select coalesce(sum(gained), 0) into mine from public.xp_daily where user_id = auth.uid() and day >= from_day;
  if mine <= 0 then return query select null::bigint, 0::numeric; return; end if;
  return query
  select (select count(*) + 1 from (select sum(gained) s from public.xp_daily where day >= from_day group by user_id) t where t.s > mine), mine;
end; $$;
revoke all on function public.get_my_xp_rank(text) from public, anon;
grant execute on function public.get_my_xp_rank(text) to authenticated;
