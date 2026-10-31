-- ============================================================================================
-- PANEL DEVELOPER: (1) EDIT XP LEADERBOARD (Harian / Minggu / Bulan)  (2) GIFT PREMIUM
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH premium.sql dan premium-bonus-top.sql.
--
-- (1) XP LEADERBOARD
--   XP yang tampil di Leaderboard = XP nonton asli (tabel xp_daily) + penyesuaian Developer (tabel baru lb_adjust).
--   Mengubah XP LB HANYA menulis ke lb_adjust. XP asli (user_xp), level, dan batas XP harian TIDAK berubah.
--   Contoh: XP asli 0, Lvl 1 -> set XP LB bulan = 9999 -> Leaderboard Bulanan menampilkan 9999, level tetap 1, XP asli tetap 0.
--   Penyesuaian disimpan di hari awal periode (hari ini / Senin / tanggal 1) supaya tiap periode bisa diatur sendiri.
-- (2) GIFT PREMIUM
--   Cari user dengan ID persis, isi jumlah HARI, Tambah atau Kurangi. Tidak memberi bonus WakuGold (bukan pembelian).
-- Semua fungsi dicek is_developer() di server. Semua perubahan tercatat (lb_adjust_log, premium_gift_log).
-- JANGAN jalankan ulang leaderboard-xp.sql setelah file ini (akan menimpa fungsi leaderboard di bawah).
-- ============================================================================================

-- ---------- 1) Tabel (terkunci dari APK) ----------
create table if not exists public.lb_adjust (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  delta      numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists lb_adjust_day_idx on public.lb_adjust (day);

create table if not exists public.lb_adjust_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  period     text not null,
  old_value  numeric(14, 2) not null,
  new_value  numeric(14, 2) not null,
  by_user    uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.premium_gift_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  days        int not null,                 -- positif = tambah, negatif = kurangi
  old_expires timestamptz,
  new_expires timestamptz not null,
  by_user     uuid,
  created_at  timestamptz not null default now()
);

alter table public.lb_adjust       enable row level security;
alter table public.lb_adjust_log   enable row level security;
alter table public.premium_gift_log enable row level security;
revoke all on public.lb_adjust, public.lb_adjust_log, public.premium_gift_log from anon, authenticated;

-- ---------- 2) Total XP Leaderboard per periode = xp_daily + penyesuaian ----------
create or replace function public.lb_totals(p_from date) returns table (user_id uuid, gain numeric)
language sql stable set search_path = public as $$
  select t.user_id, sum(t.g)
    from (select d.user_id, d.gained as g from public.xp_daily d where d.day >= p_from
          union all
          select a.user_id, a.delta   as g from public.lb_adjust a where a.day >= p_from) t
   group by t.user_id
  having sum(t.g) > 0;
$$;
revoke all on function public.lb_totals(date) from public, anon, authenticated;

-- ---------- 3) Leaderboard memakai total di atas ----------
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
  from public.lb_totals(from_day) g
  join auth.users u on u.id = g.user_id
  left join public.profiles p on p.user_id = g.user_id
  left join public.user_xp x on x.user_id = g.user_id
  order by g.gain desc, g.user_id
  limit 50;
end; $$;
revoke all on function public.get_xp_leaderboard(text) from public, anon;
grant execute on function public.get_xp_leaderboard(text) to authenticated;

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
  select coalesce((select t.gain from public.lb_totals(from_day) t where t.user_id = auth.uid()), 0) into mine;
  if mine <= 0 then return query select null::bigint, 0::numeric; return; end if;
  return query select (select count(*) + 1 from public.lb_totals(from_day) t where t.gain > mine), mine;
end; $$;
revoke all on function public.get_my_xp_rank(text) from public, anon;
grant execute on function public.get_my_xp_rank(text) to authenticated;

-- Badge TOP LB di profil juga mengikuti XP LB bulanan (termasuk penyesuaian Developer)
create or replace function public.monthly_top_of(p_user uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare from_day date := date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date; mine numeric; r int;
begin
  if auth.uid() is null or p_user is null then return null; end if;
  select coalesce((select t.gain from public.lb_totals(from_day) t where t.user_id = p_user), 0) into mine;
  if mine <= 0 then return null; end if;
  select count(*)::int + 1 into r from public.lb_totals(from_day) t where t.gain > mine;
  return case when r <= 10 then r end;
end; $$;
revoke all on function public.monthly_top_of(uuid) from public, anon;
grant execute on function public.monthly_top_of(uuid) to authenticated;

-- ---------- 4) Panel Developer: daftar semua user + XP LB periode ----------
create or replace function public.dev_lb_list(p_period text, p_q text default null, p_limit int default 40, p_offset int default 0)
returns table (user_id uuid, name text, seq bigint, role text, lb_xp numeric, real_xp numeric, adjusted boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  from_day date;
  q text := lower(btrim(coalesce(p_q, '')));
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_period not in ('daily', 'weekly', 'monthly') then raise exception 'Periode tidak valid'; end if;
  from_day := case p_period when 'weekly' then date_trunc('week', today)::date when 'monthly' then date_trunc('month', today)::date else today end;
  return query
  select p.user_id, public.wp_name(p.user_id), p.seq, coalesce(p.role, 'user'),
         coalesce(t.gain, 0)::numeric, coalesce(x.xp, 0)::numeric,
         exists (select 1 from public.lb_adjust a where a.user_id = p.user_id and a.day >= from_day and a.delta <> 0)
    from public.profiles p
    left join public.lb_totals(from_day) t on t.user_id = p.user_id
    left join public.user_xp x on x.user_id = p.user_id
   where q = '' or position(q in lower(public.wp_name(p.user_id))) > 0 or p.seq::text = regexp_replace(q, '^#', '')
   order by coalesce(t.gain, 0) desc, public.wp_name(p.user_id), p.user_id
   limit least(greatest(coalesce(p_limit, 40), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end; $$;
revoke all on function public.dev_lb_list(text, text, int, int) from public, anon;
grant execute on function public.dev_lb_list(text, text, int, int) to authenticated;

-- Atur XP LB satu user untuk satu periode menjadi nilai tertentu. XP asli & level TIDAK disentuh.
create or replace function public.dev_lb_set(p_target uuid, p_period text, p_value numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  anchor date; cur numeric;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_period not in ('daily', 'weekly', 'monthly') then raise exception 'Periode tidak valid'; end if;
  if p_value is null or p_value < 0 or p_value > 1000000000 then raise exception 'XP LB harus 0 sampai 1.000.000.000'; end if;
  if not exists (select 1 from public.profiles where user_id = p_target) then raise exception 'User tidak ditemukan'; end if;
  anchor := case p_period when 'weekly' then date_trunc('week', today)::date when 'monthly' then date_trunc('month', today)::date else today end;

  perform pg_advisory_xact_lock(hashtext('lbadj:' || p_target::text));
  select coalesce((select t.gain from public.lb_totals(anchor) t where t.user_id = p_target), 0) into cur;
  if round(p_value, 2) = round(cur, 2) then return cur; end if;

  insert into public.lb_adjust (user_id, day, delta) values (p_target, anchor, round(p_value - cur, 2))
  on conflict (user_id, day) do update set delta = public.lb_adjust.delta + excluded.delta, updated_at = now();
  insert into public.lb_adjust_log (user_id, period, old_value, new_value, by_user) values (p_target, p_period, cur, round(p_value, 2), auth.uid());
  return round(p_value, 2);
end; $$;
revoke all on function public.dev_lb_set(uuid, text, numeric) from public, anon;
grant execute on function public.dev_lb_set(uuid, text, numeric) to authenticated;

-- Kembalikan XP LB ke XP asli (hapus penyesuaian dalam periode itu)
create or replace function public.dev_lb_reset(p_target uuid, p_period text) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  from_day date; cur numeric; nw numeric;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_period not in ('daily', 'weekly', 'monthly') then raise exception 'Periode tidak valid'; end if;
  from_day := case p_period when 'weekly' then date_trunc('week', today)::date when 'monthly' then date_trunc('month', today)::date else today end;
  perform pg_advisory_xact_lock(hashtext('lbadj:' || p_target::text));
  select coalesce((select t.gain from public.lb_totals(from_day) t where t.user_id = p_target), 0) into cur;
  delete from public.lb_adjust where user_id = p_target and day >= from_day;
  select coalesce((select t.gain from public.lb_totals(from_day) t where t.user_id = p_target), 0) into nw;
  insert into public.lb_adjust_log (user_id, period, old_value, new_value, by_user) values (p_target, p_period || ':reset', cur, nw, auth.uid());
  return nw;
end; $$;
revoke all on function public.dev_lb_reset(uuid, text) from public, anon;
grant execute on function public.dev_lb_reset(uuid, text) to authenticated;

-- ---------- 5) Gift Premium ----------
create or replace function public.dev_premium_info(p_target uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m public.premium_members;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  select * into m from public.premium_members where user_id = p_target;
  if not found then return jsonb_build_object('active', false, 'expires_at', null); end if;
  return jsonb_build_object('active', m.expires_at > now(), 'expires_at', m.expires_at, 'started_at', m.started_at,
                            'days_left', greatest(0, ceil(extract(epoch from (m.expires_at - now())) / 86400)::int));
end; $$;
revoke all on function public.dev_premium_info(uuid) from public, anon;
grant execute on function public.dev_premium_info(uuid) to authenticated;

-- Tambah ('add') atau kurangi ('sub') HARI Premium. Tidak memberi bonus WakuGold.
create or replace function public.dev_premium_gift(p_target uuid, p_days int, p_mode text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare m public.premium_members; old_exp timestamptz; new_exp timestamptz; left_days int;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_mode not in ('add', 'sub') then raise exception 'Pilih tambah atau kurangi'; end if;
  if p_days is null or p_days < 1 or p_days > 3650 then raise exception 'Jumlah hari harus 1 sampai 3650'; end if;
  if not exists (select 1 from public.profiles where user_id = p_target) then raise exception 'User tidak ditemukan'; end if;

  perform pg_advisory_xact_lock(hashtext('premium:' || p_target::text));      -- sama dengan kunci pembelian: tidak bentrok
  select * into m from public.premium_members where user_id = p_target for update;
  old_exp := m.expires_at;

  if p_mode = 'add' then
    new_exp := greatest(coalesce(old_exp, now()), now()) + make_interval(days => p_days);
    insert into public.premium_members as pm (user_id, started_at, expires_at, plan_id, updated_at)
    values (p_target, now(), new_exp, 'gift', now())
    on conflict (user_id) do update
       set started_at = case when pm.expires_at > now() then pm.started_at else now() end,
           expires_at = new_exp,
           plan_id    = case when pm.expires_at > now() then pm.plan_id else 'gift' end,
           updated_at = now();
  else
    if m.user_id is null or m.expires_at <= now() then raise exception 'User tidak punya Premium aktif'; end if;
    left_days := ceil(extract(epoch from (m.expires_at - now())) / 86400)::int;
    if p_days > left_days then raise exception 'Sisa Premium hanya % hari, tidak bisa dikurangi % hari', left_days, p_days; end if;
    new_exp := greatest(m.expires_at - make_interval(days => p_days), now());
    update public.premium_members set expires_at = new_exp, updated_at = now() where user_id = p_target;
  end if;

  insert into public.premium_gift_log (user_id, days, old_expires, new_expires, by_user)
  values (p_target, case when p_mode = 'add' then p_days else -p_days end, old_exp, new_exp, auth.uid());
  return new_exp;
end; $$;
revoke all on function public.dev_premium_gift(uuid, int, text) from public, anon;
grant execute on function public.dev_premium_gift(uuid, int, text) to authenticated;
