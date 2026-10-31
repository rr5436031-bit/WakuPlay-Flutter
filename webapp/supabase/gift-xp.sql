-- ============================================================================================
-- XP DARI GIFT PREMIUM + PAJAK GIFT DITURUNKAN
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH xp-aman.sql, gift-premium.sql, giveaway-premium.sql, biaya-gift.sql, dev-lb-gift.sql.
--
-- ATURAN KETAT (semua dijaga SERVER, aplikasi hanya menampilkan):
--  1. Pemberi dapat XP = jumlah HARI yang benar-benar berpindah x xp_per_day (bawaan 500).
--       gift 1 hari x 1 orang  = 500 XP     gift 7 hari = 3.500 XP     (XP giveaway: lihat giveaway-xp.sql)
--  2. XP dihitung SAAT hari benar-benar berpindah, dalam transaksi yang sama (trigger):
--       - gift langsung  : saat baris premium_gifts tercipta (gift berhasil)
--     Jadi gift gagal / dibatalkan / dikembalikan TIDAK PERNAH memberi XP. Hanya PEMBERI yang dapat XP, penerima/pengklaim tidak.
--  3. Satu transfer hanya boleh dibayar SEKALI (kolom unik source_key di gift_xp_log). Diulang / dipanggil dobel = 0 XP.
--  4. Batas harian XP gift per akun (bawaan 30000 XP / hari WIB, tabel gift_xp_config). Lewat batas = tidak dapat XP (gift tetap sukses).
--  5. XP gift TIDAK MASUK LEADERBOARD: hanya menambah user_xp (level). Tidak menulis xp_daily maupun lb_adjust,
--     sedangkan Leaderboard & badge TOP LB hanya membaca xp_daily + lb_adjust.
--  6. Penjaga user_xp_guard dikunci: XP hanya boleh naik dari sesi nonton (maks 150), Panel Developer,
--     atau grant_gift_xp() (maks 15000 per kali; angka ini = batas 30 hari x xp_per_day maksimum 500). Selain itu ditolak.
--  7. Kalau pemberian XP error, gift/klaim TETAP sukses (error dicatat sebagai WARNING). XP tidak pernah menggagalkan gift.
--  8. xp_per_day (0-500) dan daily_cap (0-100000) dibatasi CHECK di tabel, tidak bisa diubah dari aplikasi.
-- ============================================================================================

-- ---------- 1) Pengaturan & catatan ----------
create table if not exists public.gift_xp_config (
  id         boolean primary key default true check (id),            -- hanya boleh 1 baris
  xp_per_day int not null default 500  check (xp_per_day between 0 and 500),
  daily_cap  int not null default 30000 check (daily_cap between 0 and 100000)
);
insert into public.gift_xp_config (id) values (true) on conflict (id) do nothing;
-- Nilai terbaru (1 hari x 1 orang = 100 XP; batas harian 6000 = sama dengan batas gift langsung 60 hari/hari).
-- Baris ini menimpa angka lama sekali saat file dijalankan; setelah itu ubah lewat Table Editor.
alter table public.gift_xp_config drop constraint if exists gift_xp_config_xp_per_day_check;
alter table public.gift_xp_config add constraint gift_xp_config_xp_per_day_check check (xp_per_day between 0 and 500);
update public.gift_xp_config set xp_per_day = 500, daily_cap = 30000 where id;

create table if not exists public.gift_xp_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  source_key text not null unique,                                   -- 'gift:<id premium_gifts>' atau 'claim:<id giveaway>:<id pengklaim>'
  days       int not null check (days between 1 and 30),
  xp         int not null check (xp between 0 and 15000),
  day        date not null,                                          -- hari WIB
  created_at timestamptz not null default now()
);
alter table public.gift_xp_log drop constraint if exists gift_xp_log_xp_check;
alter table public.gift_xp_log add constraint gift_xp_log_xp_check check (xp between 0 and 15000);
create index if not exists gift_xp_log_user_day on public.gift_xp_log (user_id, day);

alter table public.gift_xp_config enable row level security;
alter table public.gift_xp_log enable row level security;
revoke all on public.gift_xp_config, public.gift_xp_log from anon, authenticated;

-- ---------- 2) Penjaga user_xp (kunci ganda): tambah satu jalur resmi 'gift' ----------
create or replace function public.user_xp_guard() returns trigger
language plpgsql set search_path = public as $$
declare mode text := current_setting('wp.xp_mode', true);
begin
  if tg_op = 'INSERT' then
    if new.xp <> 0 and mode is distinct from 'beat' and mode is distinct from 'gift' and mode is distinct from 'gaxp' and not public.is_developer() then
      raise exception 'XP hanya bisa berubah lewat sesi nonton';
    end if;
  elsif new.xp is distinct from old.xp then
    if public.is_developer() then null;                                                     -- Panel Developer
    elsif mode = 'beat' and new.xp > old.xp and new.xp - old.xp <= 150 then null;           -- sesi nonton: maks 150 XP
    elsif mode = 'gift' and new.xp > old.xp and new.xp - old.xp <= 15000 then null;         -- gift premium: maks 15000 XP sekali jalan
    elsif mode = 'gaxp' and new.xp > old.xp and new.xp - old.xp <= 60000 then null;         -- giveaway (giveaway-xp.sql)
    else raise exception 'XP hanya bisa berubah lewat sesi nonton atau Panel Developer';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists user_xp_guard on public.user_xp;
create trigger user_xp_guard before insert or update on public.user_xp
  for each row execute function public.user_xp_guard();

-- ---------- 3) Pemberi XP (internal, tidak bisa dipanggil dari aplikasi) ----------
create or replace function public.grant_gift_xp(p_user uuid, p_days int, p_key text) returns int
language plpgsql security definer set search_path = public as $$
declare
  cfg public.gift_xp_config;
  today date := (now() at time zone 'Asia/Jakarta')::date;
  used int; amt int; n int;
begin
  if p_user is null or p_key is null or p_days is null or p_days < 1 or p_days > 30 then return 0; end if;
  select * into cfg from public.gift_xp_config where id;
  if not found or cfg.xp_per_day <= 0 then return 0; end if;

  perform pg_advisory_xact_lock(hashtext('gxp:' || p_user::text));                          -- satu pemberian XP per akun dalam satu waktu
  if exists (select 1 from public.gift_xp_log where source_key = p_key) then return 0; end if;   -- sudah pernah dibayar

  select coalesce(sum(xp), 0) into used from public.gift_xp_log where user_id = p_user and day = today;
  amt := least(p_days * cfg.xp_per_day, greatest(cfg.daily_cap - used, 0));                 -- dipotong sisa batas harian

  insert into public.gift_xp_log (user_id, source_key, days, xp, day) values (p_user, p_key, p_days, amt, today)
  on conflict (source_key) do nothing;
  get diagnostics n = row_count;
  if n = 0 or amt <= 0 then return 0; end if;

  insert into public.user_xp (user_id, xp, last_tick) values (p_user, 0, now() - interval '1 hour') on conflict (user_id) do nothing;
  perform set_config('wp.xp_mode', 'gift', true);                                           -- izin khusus untuk user_xp_guard (hanya transaksi ini)
  update public.user_xp set xp = xp + amt where user_id = p_user;                           -- TIDAK menulis xp_daily / lb_adjust -> tidak masuk Leaderboard
  perform set_config('wp.xp_mode', '', true);
  return amt;
end; $$;
revoke all on function public.grant_gift_xp(uuid, int, text) from public, anon, authenticated;

-- ---------- 4) Trigger: XP otomatis saat hari benar-benar berpindah ----------
-- (memakai trigger supaya fungsi gift/giveaway lama tidak perlu diganti; menjalankan ulang biaya-gift.sql tidak menghapus fitur ini)
create or replace function public.trg_gift_xp_gift() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.grant_gift_xp(new.from_user, new.days, 'gift:' || new.id::text);
  exception when others then
    raise warning 'XP gift gagal (gift %): %', new.id, sqlerrm;                             -- gift tetap sukses
  end;
  return new;
end; $$;
revoke all on function public.trg_gift_xp_gift() from public, anon, authenticated;
drop trigger if exists gift_xp_after on public.premium_gifts;
create trigger gift_xp_after after insert on public.premium_gifts
  for each row execute function public.trg_gift_xp_gift();

-- XP giveaway tidak lagi dibayar di sini: lihat giveaway-xp.sql (tarif sendiri, bawaan 600 XP per hari, bisa diubah di Panel Developer).
drop trigger if exists gift_xp_after on public.giveaway_claims;

-- ---------- 5) Info untuk popup (pratinjau XP; server tetap penentu) ----------
create or replace function public.gift_xp_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); cfg public.gift_xp_config; used int;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  select * into cfg from public.gift_xp_config where id;
  if not found then return jsonb_build_object('xp_per_day', 0, 'daily_cap', 0, 'left_today', 0); end if;
  select coalesce(sum(xp), 0) into used from public.gift_xp_log where user_id = me and day = (now() at time zone 'Asia/Jakarta')::date;
  return jsonb_build_object('xp_per_day', cfg.xp_per_day, 'daily_cap', cfg.daily_cap, 'left_today', greatest(cfg.daily_cap - used, 0));
end; $$;
revoke all on function public.gift_xp_info() from public, anon;
grant execute on function public.gift_xp_info() to authenticated;

-- ---------- 6) PAJAK GIFT DITURUNKAN (dari 50/60/70/80% menjadi 20/25/30/35%) ----------
-- Progresif per bagian total hari (hari x orang). Dibulatkan ke atas per jam. Bisa diubah lagi di tabel gift_fee_tiers.
insert into public.gift_fee_tiers (from_days, rate) values (0, 0.20), (5, 0.25), (15, 0.30), (30, 0.35)
on conflict (from_days) do update set rate = excluded.rate;

-- ---------- Cek cepat (opsional, jalankan terpisah) ----------
-- select * from public.gift_fee_tiers order by from_days;                       -- harus 0.20 / 0.25 / 0.30 / 0.35
-- select public.gift_fee_hours(1);                                              -- 5  (1 hari x 1 orang = biaya 5 jam)
-- select * from public.gift_xp_log order by id desc limit 20;                   -- riwayat XP gift
-- select tgname from pg_trigger where tgname in ('gift_xp_after', 'user_xp_guard') and not tgisinternal;   -- 3 baris
