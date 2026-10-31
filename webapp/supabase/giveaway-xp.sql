-- ============================================================================================
-- XP GIVEAWAY PREMIUM (pembuat giveaway dapat XP saat hadiahnya DIKLAIM)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH gift-xp.sql, giveaway-premium.sql, giveaway-tanpa-limit.sql. Jalankan ini TERAKHIR.
--
-- ATURAN KETAT (semua dijaga SERVER, aplikasi hanya menampilkan):
--  1. XP = jumlah HARI yang benar-benar diklaim x xp_per_day. Rata, TANPA tingkatan / pengali / bonus makin naik.
--       Bawaan 600 XP per hari:  giveaway 1 hari x 1 orang terklaim = 600 XP,  3 hari x 2 orang = 3.600 XP.
--  2. XP dibayar SAAT klaim terjadi (trigger, satu transaksi dengan klaim). Hadiah yang tidak terklaim, kedaluwarsa,
--     atau dikembalikan = 0 XP. Giveaway / klaim yang gagal tidak memberi XP.
--  3. Hanya PEMBUAT yang dapat XP. Pengklaim tidak. Pembuat tidak bisa klaim sendiri (XP = 0 kalau tetap terjadi).
--  4. Satu klaim hanya dibayar SEKALI (kolom unik source_key). Dipanggil ulang / dobel = 0 XP.
--  5. Batas harian XP giveaway per pembuat (hari WIB, bawaan 36.000 XP = 60 hari/hari). Lewat batas = XP dipotong / 0,
--     giveaway dan klaim tetap sukses.
--  6. Pengklaim yang SAMA ke pembuat yang SAMA hanya menghasilkan XP SEKALI per hari WIB (anti akun kloningan).
--  7. Pembuat atau pengklaim yang sedang diblokir = 0 XP.
--  8. XP giveaway TIDAK MASUK LEADERBOARD: hanya menambah user_xp (level). Tidak menulis xp_daily maupun lb_adjust,
--     sedangkan Leaderboard & badge TOP LB hanya membaca xp_daily + lb_adjust.
--  9. user_xp_guard dikunci: kenaikan XP lewat jalur giveaway hanya diizinkan oleh fungsi ini (maks 60.000 per klaim).
-- 10. xp_per_day (0-2000) dan daily_cap (0-1.000.000) dibatasi CHECK di tabel. Hanya DEVELOPER yang bisa mengubahnya
--     (Panel Developer > XP Giveaway), dicek di server dan dicatat di dev_audit. Perubahan hanya berlaku untuk klaim berikutnya.
-- 11. Error pemberian XP tidak pernah menggagalkan klaim (dicatat sebagai WARNING).
-- ============================================================================================

create table if not exists public.giveaway_xp_config (
  id         boolean primary key default true check (id),
  xp_per_day int not null default 600   check (xp_per_day between 0 and 2000),
  daily_cap  int not null default 36000 check (daily_cap between 0 and 1000000)
);
insert into public.giveaway_xp_config (id) values (true) on conflict (id) do nothing;

create table if not exists public.giveaway_xp_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  claimer     uuid not null,
  giveaway_id bigint not null,
  source_key  text not null unique,
  days        int not null check (days between 1 and 30),
  per_day     int not null,
  xp          int not null check (xp between 0 and 60000),
  day         date not null,
  created_at  timestamptz not null default now()
);
create index if not exists giveaway_xp_log_user_day on public.giveaway_xp_log (user_id, day);
create index if not exists giveaway_xp_log_pair on public.giveaway_xp_log (user_id, claimer, day);
create index if not exists giveaway_xp_log_gid on public.giveaway_xp_log (giveaway_id);

alter table public.giveaway_xp_config enable row level security;
alter table public.giveaway_xp_log enable row level security;
revoke all on public.giveaway_xp_config, public.giveaway_xp_log from anon, authenticated;

create or replace function public.user_xp_guard() returns trigger
language plpgsql set search_path = public as $$
declare mode text := current_setting('wp.xp_mode', true);
begin
  if tg_op = 'INSERT' then
    if new.xp <> 0 and mode is distinct from 'beat' and mode is distinct from 'gift' and mode is distinct from 'gaxp' and not public.is_developer() then
      raise exception 'XP hanya bisa berubah lewat sesi nonton';
    end if;
  elsif new.xp is distinct from old.xp then
    if public.is_developer() then null;
    elsif mode = 'beat' and new.xp > old.xp and new.xp - old.xp <= 150 then null;
    elsif mode = 'gift' and new.xp > old.xp and new.xp - old.xp <= 15000 then null;
    elsif mode = 'gaxp' and new.xp > old.xp and new.xp - old.xp <= 60000 then null;
    else raise exception 'XP hanya bisa berubah lewat sesi nonton atau Panel Developer';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists user_xp_guard on public.user_xp;
create trigger user_xp_guard before insert or update on public.user_xp
  for each row execute function public.user_xp_guard();

create or replace function public.grant_giveaway_xp(p_owner uuid, p_claimer uuid, p_gid bigint, p_days int) returns int
language plpgsql security definer set search_path = public as $$
declare
  cfg public.giveaway_xp_config;
  today date := (now() at time zone 'Asia/Jakarta')::date;
  key text := 'ga:' || p_gid::text || ':' || p_claimer::text;
  used int; amt int; n int;
begin
  if p_owner is null or p_claimer is null or p_gid is null or p_days is null or p_days < 1 or p_days > 30 then return 0; end if;
  if p_owner = p_claimer then return 0; end if;
  select * into cfg from public.giveaway_xp_config where id;
  if not found or cfg.xp_per_day <= 0 then return 0; end if;

  perform pg_advisory_xact_lock(hashtext('gaxp:' || p_owner::text));
  if exists (select 1 from public.giveaway_xp_log where source_key = key) then return 0; end if;
  if public.is_banned(p_owner) or public.is_banned(p_claimer) then return 0; end if;

  if exists (select 1 from public.giveaway_xp_log where user_id = p_owner and claimer = p_claimer and day = today) then
    amt := 0;
  else
    select coalesce(sum(xp), 0) into used from public.giveaway_xp_log where user_id = p_owner and day = today;
    amt := least(p_days * cfg.xp_per_day, greatest(cfg.daily_cap - used, 0));
  end if;

  insert into public.giveaway_xp_log (user_id, claimer, giveaway_id, source_key, days, per_day, xp, day)
  values (p_owner, p_claimer, p_gid, key, p_days, cfg.xp_per_day, amt, today)
  on conflict (source_key) do nothing;
  get diagnostics n = row_count;
  if n = 0 or amt <= 0 then return 0; end if;

  insert into public.user_xp (user_id, xp, last_tick) values (p_owner, 0, now() - interval '1 hour') on conflict (user_id) do nothing;
  perform set_config('wp.xp_mode', 'gaxp', true);
  update public.user_xp set xp = xp + amt where user_id = p_owner;
  perform set_config('wp.xp_mode', '', true);
  return amt;
end; $$;
revoke all on function public.grant_giveaway_xp(uuid, uuid, bigint, int) from public, anon, authenticated;

create or replace function public.trg_giveaway_xp_claim() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  begin
    select creator into owner from public.giveaways where id = new.giveaway_id;
    if owner is not null then
      perform public.grant_giveaway_xp(owner, new.user_id, new.giveaway_id, new.days);
    end if;
  exception when others then
    raise warning 'XP giveaway gagal (giveaway %): %', new.giveaway_id, sqlerrm;
  end;
  return new;
end; $$;
revoke all on function public.trg_giveaway_xp_claim() from public, anon, authenticated;

drop trigger if exists gift_xp_after on public.giveaway_claims;
drop trigger if exists giveaway_xp_after on public.giveaway_claims;
create trigger giveaway_xp_after after insert on public.giveaway_claims
  for each row execute function public.trg_giveaway_xp_claim();

create or replace function public.giveaway_xp_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); cfg public.giveaway_xp_config; used int;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  select * into cfg from public.giveaway_xp_config where id;
  if not found then return jsonb_build_object('xp_per_day', 0, 'daily_cap', 0, 'left_today', 0); end if;
  select coalesce(sum(xp), 0) into used from public.giveaway_xp_log where user_id = me and day = (now() at time zone 'Asia/Jakarta')::date;
  return jsonb_build_object('xp_per_day', cfg.xp_per_day, 'daily_cap', cfg.daily_cap, 'left_today', greatest(cfg.daily_cap - used, 0));
end; $$;
revoke all on function public.giveaway_xp_info() from public, anon;
grant execute on function public.giveaway_xp_info() to authenticated;

create or replace function public.giveaway_states(p_ids bigint[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'days', g.days, 'slots', g.slots, 'claimed', g.claimed,
    'status', case when g.status = 'open' and g.expires_at <= now() then 'ended' else g.status end,
    'expires_at', g.expires_at, 'server_now', now(),
    'owner', g.creator = auth.uid(),
    'mine', exists (select 1 from public.giveaway_claims c where c.giveaway_id = g.id and c.user_id = auth.uid()),
    'xp', case when g.creator = auth.uid() then (select coalesce(sum(x.xp), 0) from public.giveaway_xp_log x where x.giveaway_id = g.id) else 0 end
  )), '[]'::jsonb)
  from public.giveaways g where g.id = any (p_ids[1:100]);
$$;
revoke all on function public.giveaway_states(bigint[]) from public, anon;
grant execute on function public.giveaway_states(bigint[]) to authenticated;

create or replace function public.dev_giveaway_xp_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg public.giveaway_xp_config;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  select * into cfg from public.giveaway_xp_config where id;
  return jsonb_build_object('xp_per_day', cfg.xp_per_day, 'daily_cap', cfg.daily_cap,
    'paid_today', (select coalesce(sum(xp), 0) from public.giveaway_xp_log where day = (now() at time zone 'Asia/Jakarta')::date));
end; $$;
revoke all on function public.dev_giveaway_xp_get() from public, anon;
grant execute on function public.dev_giveaway_xp_get() to authenticated;

create or replace function public.dev_giveaway_xp_set(p_xp_per_day int, p_daily_cap int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare old public.giveaway_xp_config;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_xp_per_day is null or p_xp_per_day < 0 or p_xp_per_day > 2000 then raise exception 'XP per hari harus 0 sampai 2000'; end if;
  if p_daily_cap is null or p_daily_cap < 0 or p_daily_cap > 1000000 then raise exception 'Batas harian harus 0 sampai 1000000'; end if;
  select * into old from public.giveaway_xp_config where id for update;
  update public.giveaway_xp_config set xp_per_day = p_xp_per_day, daily_cap = p_daily_cap where id;
  insert into public.dev_audit (actor, target, field, old_value, new_value)
  values (auth.uid(), null, 'giveaway_xp', old.xp_per_day || '/' || old.daily_cap, p_xp_per_day || '/' || p_daily_cap);
  return jsonb_build_object('xp_per_day', p_xp_per_day, 'daily_cap', p_daily_cap);
end; $$;
revoke all on function public.dev_giveaway_xp_set(int, int) from public, anon;
grant execute on function public.dev_giveaway_xp_set(int, int) to authenticated;

-- Cek cepat (opsional, jalankan terpisah):
-- select * from public.giveaway_xp_config;                                  -- 600 / 36000
-- select tgname from pg_trigger where tgrelid = 'public.giveaway_claims'::regclass and not tgisinternal;   -- ada giveaway_xp_after, TIDAK ada gift_xp_after
-- select * from public.giveaway_xp_log order by id desc limit 20;

notify pgrst, 'reload schema';
