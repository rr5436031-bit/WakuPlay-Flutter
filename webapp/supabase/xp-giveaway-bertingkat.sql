-- ============================================================================================
-- PERBAIKAN XP GIVEAWAY & GIFT: tidak lagi SAMA, dan lebih BANYAK untuk hadiah lebih besar
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH giveaway-xp-kirim.sql, gift-xp-500.sql, xp-nonton-2menit.sql. Jalankan ini PALING TERAKHIR.
--
-- PENYEBAB XP SAMA: batas harian XP giveaway hanya 36.000 (dan gift 30.000). Giveaway sebesar 60 hari ke atas langsung
--   menabrak batas itu, jadi hasilnya selalu angka batas yang sama berapa pun hari yang dibagikan.
--
-- ATURAN KETAT (semua dijaga SERVER, aplikasi hanya menampilkan):
--  1. XP giveaway BERTINGKAT per bagian total hari (hari x orang), dihitung per bagian seperti pajak progresif:
--        hari ke   1 - 25  : 100% x xp_per_day
--        hari ke  26 - 100 : 115%
--        hari ke 101 - 250 : 130%
--        hari ke 251 ke atas: 150%
--     Jadi makin besar giveaway, XP makin banyak DAN setiap ukuran giveaway menghasilkan XP berbeda.
--     Tingkatan ada di tabel giveaway_xp_tiers (hanya bisa diubah dari SQL Editor, tidak dari aplikasi); persen dibatasi 100-300.
--  2. xp_per_day bawaan naik 600 -> 1000 (sekali, saat file ini pertama dijalankan; setelah itu Developer bebas mengubah
--     lewat Panel Developer, file ini tidak menimpanya lagi). Contoh 1 hari x 5 orang = 5.000 XP, 3 hari x 20 = 60 hari = 65.000 XP.
--  3. Batas harian giveaway naik 36.000 -> 3.000.000 dan batas per giveaway 60.000 -> 2.000.000, supaya batas
--     tidak lagi memotong giveaway normal. Batas tetap ada sebagai pengaman, dan tetap dipotong rapi (tidak error).
--  4. XP gift langsung: bawaan 500 -> 1000 per hari (maks 30 hari per gift = 30.000), batas harian 30.000 -> 300.000.
--     Gift tetap linear (1 hari = 1x tarif, 7 hari = 7x tarif), jadi setiap jumlah hari menghasilkan XP berbeda.
--  5. Semua aturan lama TETAP: sekali per giveaway / gift (source_key unik), akun diblokir = 0 XP, XP hanya dari transaksi
--     yang berhasil, tidak masuk Leaderboard, error XP tidak pernah menggagalkan giveaway / gift.
--  6. KUNCI GANDA user_xp_guard disesuaikan: nonton maks 500, gift maks 60.000, giveaway maks 2.000.000 per kali.
--  7. Hanya Developer yang bisa mengubah xp_per_day (0-2000) dan batas harian (0-10.000.000), tercatat di dev_audit.
-- ============================================================================================

-- ---------- 1) Batas CHECK diperlebar (nilai lama tetap valid) ----------
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.giveaway_xp_config'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%daily_cap%' loop
    execute format('alter table public.giveaway_xp_config drop constraint %I', c.conname);
  end loop;
  for c in select conname from pg_constraint
            where conrelid = 'public.gift_xp_config'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%daily_cap%' loop
    execute format('alter table public.gift_xp_config drop constraint %I', c.conname);
  end loop;
  for c in select conname from pg_constraint
            where conrelid = 'public.giveaway_xp_log'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%xp >=%' and pg_get_constraintdef(oid) not ilike '%days%' loop
    execute format('alter table public.giveaway_xp_log drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.giveaway_xp_config drop constraint if exists giveaway_xp_config_daily_cap_range;
alter table public.giveaway_xp_config add constraint giveaway_xp_config_daily_cap_range check (daily_cap between 0 and 10000000);
alter table public.gift_xp_config drop constraint if exists gift_xp_config_daily_cap_range;
alter table public.gift_xp_config add constraint gift_xp_config_daily_cap_range check (daily_cap between 0 and 1000000);
alter table public.gift_xp_config drop constraint if exists gift_xp_config_xp_per_day_check;
alter table public.gift_xp_config add constraint gift_xp_config_xp_per_day_check check (xp_per_day between 0 and 2000);
alter table public.giveaway_xp_log drop constraint if exists giveaway_xp_log_xp_range;
alter table public.giveaway_xp_log add constraint giveaway_xp_log_xp_range check (xp between 0 and 2000000);
alter table public.gift_xp_log drop constraint if exists gift_xp_log_xp_check;
alter table public.gift_xp_log add constraint gift_xp_log_xp_check check (xp between 0 and 60000);
alter table public.giveaway_xp_config alter column xp_per_day set default 1000;
alter table public.giveaway_xp_config alter column daily_cap set default 3000000;
alter table public.gift_xp_config alter column xp_per_day set default 1000;
alter table public.gift_xp_config alter column daily_cap set default 300000;

-- ---------- 2) Nilai bawaan baru, HANYA SEKALI ----------
alter table public.giveaway_xp_config add column if not exists tiered boolean not null default false;
update public.giveaway_xp_config set xp_per_day = 1000, daily_cap = 3000000, tiered = true where id and not tiered;
alter table public.gift_xp_config add column if not exists raised boolean not null default false;
update public.gift_xp_config set xp_per_day = 1000, daily_cap = 300000, raised = true where id and not raised;

-- ---------- 3) Tingkatan XP giveaway ----------
create table if not exists public.giveaway_xp_tiers (
  from_days int primary key check (from_days >= 0),
  pct       int not null check (pct between 100 and 300)
);
insert into public.giveaway_xp_tiers (from_days, pct) values (0, 100), (25, 115), (100, 130), (250, 150)
on conflict (from_days) do nothing;
alter table public.giveaway_xp_tiers enable row level security;
revoke all on public.giveaway_xp_tiers from anon, authenticated;

-- Hitung XP bertingkat (internal). Selalu >= linear 100% karena pct minimal 100.
create or replace function public.giveaway_xp_calc(p_total int, p_per_day int) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(nullif((
    select sum(greatest(least(p_total, t.nxt) - t.from_days, 0)::bigint * p_per_day::bigint * t.pct / 100)
      from (select from_days, pct, coalesce(lead(from_days) over (order by from_days), 2147483647) as nxt
              from public.giveaway_xp_tiers) t
  ), 0), p_total::bigint * p_per_day::bigint);       -- tabel kosong = linear
$$;
revoke all on function public.giveaway_xp_calc(int, int) from public, anon, authenticated;

-- ---------- 4) Penjaga user_xp ----------
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
    elsif mode = 'beat' and new.xp > old.xp and new.xp - old.xp <= 500 then null;
    elsif mode = 'gift' and new.xp > old.xp and new.xp - old.xp <= 60000 then null;
    elsif mode = 'gaxp' and new.xp > old.xp and new.xp - old.xp <= 2000000 then null;
    else raise exception 'XP hanya bisa berubah lewat sesi nonton atau Panel Developer';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists user_xp_guard on public.user_xp;
create trigger user_xp_guard before insert or update on public.user_xp
  for each row execute function public.user_xp_guard();

-- ---------- 5) Bayar XP saat giveaway dikirim (bertingkat) ----------
create or replace function public.grant_giveaway_send_xp(p_owner uuid, p_gid bigint, p_total_days int) returns int
language plpgsql security definer set search_path = public as $$
declare
  cfg public.giveaway_xp_config;
  today date := (now() at time zone 'Asia/Jakarta')::date;
  key text := 'gac:' || p_gid::text;
  used bigint; want bigint; amt int; n int;
begin
  if p_owner is null or p_gid is null or p_total_days is null or p_total_days < 1 or p_total_days > 1500 then return 0; end if;
  select * into cfg from public.giveaway_xp_config where id;
  if not found or cfg.xp_per_day <= 0 then return 0; end if;

  perform pg_advisory_xact_lock(hashtext('gaxp:' || p_owner::text));
  if exists (select 1 from public.giveaway_xp_log where source_key = key) then return 0; end if;
  if public.is_banned(p_owner) then return 0; end if;
  if not exists (select 1 from public.giveaways where id = p_gid and creator = p_owner) then return 0; end if;

  select coalesce(sum(xp), 0) into used from public.giveaway_xp_log where user_id = p_owner and day = today;
  want := public.giveaway_xp_calc(p_total_days, cfg.xp_per_day);
  amt := least(want, 2000000, greatest(cfg.daily_cap - used, 0))::int;

  insert into public.giveaway_xp_log (user_id, claimer, giveaway_id, source_key, days, per_day, xp, day)
  values (p_owner, p_owner, p_gid, key, p_total_days, cfg.xp_per_day, amt, today)
  on conflict (source_key) do nothing;
  get diagnostics n = row_count;
  if n = 0 or amt <= 0 then return 0; end if;

  insert into public.user_xp (user_id, xp, last_tick) values (p_owner, 0, now() - interval '1 hour') on conflict (user_id) do nothing;
  perform set_config('wp.xp_mode', 'gaxp', true);
  update public.user_xp set xp = xp + amt where user_id = p_owner;
  perform set_config('wp.xp_mode', '', true);
  return amt;
end; $$;
revoke all on function public.grant_giveaway_send_xp(uuid, bigint, int) from public, anon, authenticated;

-- ---------- 6) Info untuk layar Buat Giveaway (pratinjau; server tetap penentu) ----------
create or replace function public.giveaway_xp_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); cfg public.giveaway_xp_config; used bigint;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  select * into cfg from public.giveaway_xp_config where id;
  if not found then return jsonb_build_object('xp_per_day', 0, 'daily_cap', 0, 'left_today', 0, 'per_giveaway_cap', 2000000, 'tiers', '[]'::jsonb); end if;
  select coalesce(sum(xp), 0) into used from public.giveaway_xp_log where user_id = me and day = (now() at time zone 'Asia/Jakarta')::date;
  return jsonb_build_object('xp_per_day', cfg.xp_per_day, 'daily_cap', cfg.daily_cap, 'left_today', greatest(cfg.daily_cap - used, 0),
    'per_giveaway_cap', 2000000,
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('from', t.from_days, 'pct', t.pct) order by t.from_days) from public.giveaway_xp_tiers t), '[]'::jsonb));
end; $$;
revoke all on function public.giveaway_xp_info() from public, anon;
grant execute on function public.giveaway_xp_info() to authenticated;

-- ---------- 7) Panel Developer: batas harian sampai 10.000.000 ----------
create or replace function public.dev_giveaway_xp_set(p_xp_per_day int, p_daily_cap int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare old public.giveaway_xp_config;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_xp_per_day is null or p_xp_per_day < 0 or p_xp_per_day > 2000 then raise exception 'XP per hari harus 0 sampai 2000'; end if;
  if p_daily_cap is null or p_daily_cap < 0 or p_daily_cap > 10000000 then raise exception 'Batas harian harus 0 sampai 10000000'; end if;
  select * into old from public.giveaway_xp_config where id for update;
  update public.giveaway_xp_config set xp_per_day = p_xp_per_day, daily_cap = p_daily_cap where id;
  insert into public.dev_audit (actor, target, field, old_value, new_value)
  values (auth.uid(), null, 'giveaway_xp', old.xp_per_day || '/' || old.daily_cap, p_xp_per_day || '/' || p_daily_cap);
  return jsonb_build_object('xp_per_day', p_xp_per_day, 'daily_cap', p_daily_cap);
end; $$;
revoke all on function public.dev_giveaway_xp_set(int, int) from public, anon;
grant execute on function public.dev_giveaway_xp_set(int, int) to authenticated;

-- Cek cepat (opsional, jalankan terpisah):
-- select * from public.giveaway_xp_config;                               -- 1000 / 3000000, tiered = true
-- select * from public.gift_xp_config;                                   -- 1000 / 300000
-- select public.giveaway_xp_calc(5, 1000), public.giveaway_xp_calc(60, 1000), public.giveaway_xp_calc(300, 1000);
--   -- hasil: 5000 / 66000 -> bukan angka batas yang sama; (60 hari = 25x1000 + 35x1150)

notify pgrst, 'reload schema';
