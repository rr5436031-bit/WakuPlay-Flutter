-- ============================================================================================
-- XP GIVEAWAY CAIR LANGSUNG SAAT GIVEAWAY DIKIRIM (tidak perlu menunggu ada yang klaim)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH giveaway-xp.sql, biaya-gift.sql, giveaway-min5.sql. Jalankan ini PALING TERAKHIR.
--
-- ATURAN KETAT (semua dijaga SERVER, aplikasi hanya menampilkan):
--  1. XP dibayar SAAT giveaway berhasil dibuat, satu transaksi dengan pemotongan Premium dan pesan Chat Global.
--     Giveaway yang GAGAL dibuat (Premium kurang, diblokir, input salah, terlalu cepat) = 0 XP dan tidak ada yang berubah.
--  2. XP = total hari hadiah (hari x jumlah orang) x xp_per_day. Rata, tanpa pengali / bonus makin naik.
--     Bawaan 600 XP per hari: 1 hari x 5 orang = 3.000 XP.
--  3. Satu giveaway hanya dibayar SEKALI (kolom unik source_key 'gac:<id giveaway>'). Dipanggil ulang = 0 XP.
--  4. Maksimal 60.000 XP per giveaway dan batas harian per pembuat (hari WIB, bawaan 36.000 XP).
--     Lewat batas = XP dipotong / 0. Giveaway tetap sukses.
--  5. Yang dihitung ke batas harian = XP kirim + XP klaim lama, jadi tidak bisa menembus batas lewat dua jalur.
--  6. Hadiah yang tidak diklaim dan dikembalikan TIDAK menarik XP kembali (sesuai aturan: XP cair saat kirim).
--     Pencegah curang: Premium yang dikembalikan sudah dipotong biaya gift, jeda antar giveaway 30 detik,
--     dan ada batas harian di atas.
--  7. Pembuat yang sedang diblokir = 0 XP. Error pemberian XP tidak pernah menggagalkan giveaway (dicatat WARNING).
--  8. XP giveaway TIDAK MASUK LEADERBOARD (hanya menambah user_xp / level). Tidak menulis xp_daily maupun lb_adjust.
--  9. XP dari KLAIM tidak diberikan lagi untuk giveaway baru (tidak ada XP ganda). Giveaway yang sudah berjalan
--     saat file ini dijalankan tetap dibayar dengan cara lama sampai selesai, supaya tidak ada yang rugi.
-- 10. user_xp_guard tetap: kenaikan XP lewat jalur ini maksimal 60.000 per pemanggilan.
-- 11. xp_per_day dan daily_cap tetap hanya bisa diubah Developer (Panel Developer > XP Giveaway), tercatat di dev_audit.
-- ============================================================================================

-- Penanda: giveaway yang dibuat SEBELUM waktu ini masih dibayar saat klaim (cara lama)
alter table public.giveaway_xp_config add column if not exists send_since timestamptz;
update public.giveaway_xp_config set send_since = now() where id and send_since is null;

-- Log: total hari satu giveaway bisa sampai 30 x 50 = 1500; baris kirim memakai claimer = pembuat
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.giveaway_xp_log'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%days%' and pg_get_constraintdef(oid) not ilike '%xp%' loop
    execute format('alter table public.giveaway_xp_log drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.giveaway_xp_log drop constraint if exists giveaway_xp_log_days_range;
alter table public.giveaway_xp_log add constraint giveaway_xp_log_days_range check (days between 1 and 1500);

-- Bayar XP saat kirim (internal). Mengembalikan XP yang benar-benar masuk.
create or replace function public.grant_giveaway_send_xp(p_owner uuid, p_gid bigint, p_total_days int) returns int
language plpgsql security definer set search_path = public as $$
declare
  cfg public.giveaway_xp_config;
  today date := (now() at time zone 'Asia/Jakarta')::date;
  key text := 'gac:' || p_gid::text;
  used int; amt int; n int;
begin
  if p_owner is null or p_gid is null or p_total_days is null or p_total_days < 1 or p_total_days > 1500 then return 0; end if;
  select * into cfg from public.giveaway_xp_config where id;
  if not found or cfg.xp_per_day <= 0 then return 0; end if;

  perform pg_advisory_xact_lock(hashtext('gaxp:' || p_owner::text));          -- kunci yang sama dengan jalur klaim lama
  if exists (select 1 from public.giveaway_xp_log where source_key = key) then return 0; end if;
  if public.is_banned(p_owner) then return 0; end if;
  if not exists (select 1 from public.giveaways where id = p_gid and creator = p_owner) then return 0; end if;

  select coalesce(sum(xp), 0) into used from public.giveaway_xp_log where user_id = p_owner and day = today;
  amt := least(p_total_days * cfg.xp_per_day, 60000, greatest(cfg.daily_cap - used, 0));

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

-- Jalur klaim lama: HANYA untuk giveaway yang dibuat sebelum send_since. Giveaway baru = 0 (sudah dibayar saat kirim).
create or replace function public.trg_giveaway_xp_claim() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; made timestamptz; since timestamptz;
begin
  begin
    select creator, created_at into owner, made from public.giveaways where id = new.giveaway_id;
    select send_since into since from public.giveaway_xp_config where id;
    if owner is not null and since is not null and made < since then
      perform public.grant_giveaway_xp(owner, new.user_id, new.giveaway_id, new.days);
    end if;
  exception when others then
    raise warning 'XP giveaway gagal (giveaway %): %', new.giveaway_id, sqlerrm;
  end;
  return new;
end; $$;
revoke all on function public.trg_giveaway_xp_claim() from public, anon, authenticated;

-- Buat giveaway (versi biaya-gift + min 5 orang) + XP langsung
create or replace function public.giveaway_create(p_days int, p_slots int, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); s public.premium_members; total int; fee_h int; cost_d numeric; left_d numeric; note text; gid bigint; mid bigint; s_new timestamptz; xp_got int := 0;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if p_days is null or p_days < 1 or p_days > 30 or p_slots is null or p_slots < 1 or p_slots > 50 then return jsonb_build_object('ok', false, 'code', 'BAD_INPUT'); end if;
  if p_slots < 5 then return jsonb_build_object('ok', false, 'code', 'MIN_SLOTS'); end if;
  if public.is_banned(me) then return jsonb_build_object('ok', false, 'code', 'BANNED'); end if;
  note := left(btrim(regexp_replace(coalesce(p_note, ''), E'[\\x01-\\x1f\\x7f]', ' ', 'g')), 100);

  perform public.giveaway_sweep();
  perform pg_advisory_xact_lock(hashtext('gift:' || me::text));
  select * into s from public.premium_members where user_id = me for update;
  if not found or s.expires_at <= now() then return jsonb_build_object('ok', false, 'code', 'NO_PREMIUM'); end if;
  total := p_days * p_slots;
  left_d := extract(epoch from s.expires_at - now()) / 86400;
  fee_h := public.gift_fee_hours(total);
  cost_d := total + fee_h / 24.0;
  if left_d <= cost_d then return jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH', 'left_days', round(left_d::numeric, 2), 'need', round(cost_d, 2), 'fee_hours', fee_h); end if;

  if exists (select 1 from public.giveaways where creator = me and created_at > now() - interval '30 seconds') then return jsonb_build_object('ok', false, 'code', 'TOO_FAST'); end if;

  s_new := s.expires_at - make_interval(days => total, hours => fee_h);
  update public.premium_members set expires_at = s_new, updated_at = now() where user_id = me;
  insert into public.giveaways (creator, days, slots, fee_hours, note, expires_at) values (me, p_days, p_slots, fee_h, nullif(note, ''), now() + interval '24 hours') returning id into gid;
  insert into public.global_messages (user_id, body, kind, meta)
  values (me, 'Giveaway Premium', 'giveaway', jsonb_build_object('gid', gid, 'days', p_days, 'slots', p_slots, 'note', nullif(note, '')))
  returning id into mid;
  update public.giveaways set message_id = mid where id = gid;

  -- XP langsung cair. Blok ini terisolasi: kalau gagal, hanya XP yang batal, giveaway tetap jadi.
  begin
    xp_got := public.grant_giveaway_send_xp(me, gid, total);
  exception when others then
    xp_got := 0;
    raise warning 'XP kirim giveaway gagal (giveaway %): %', gid, sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'gid', gid, 'fee_hours', fee_h, 'xp', xp_got, 'left_days', round((extract(epoch from s_new - now()) / 86400)::numeric, 2));
end; $$;
revoke all on function public.giveaway_create(int, int, text) from public, anon;
grant execute on function public.giveaway_create(int, int, text) to authenticated;

-- Info XP untuk layar "Buat Giveaway": tambah batas per giveaway
create or replace function public.giveaway_xp_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); cfg public.giveaway_xp_config; used int;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  select * into cfg from public.giveaway_xp_config where id;
  if not found then return jsonb_build_object('xp_per_day', 0, 'daily_cap', 0, 'left_today', 0, 'per_giveaway_cap', 60000); end if;
  select coalesce(sum(xp), 0) into used from public.giveaway_xp_log where user_id = me and day = (now() at time zone 'Asia/Jakarta')::date;
  return jsonb_build_object('xp_per_day', cfg.xp_per_day, 'daily_cap', cfg.daily_cap, 'left_today', greatest(cfg.daily_cap - used, 0), 'per_giveaway_cap', 60000);
end; $$;
revoke all on function public.giveaway_xp_info() from public, anon;
grant execute on function public.giveaway_xp_info() to authenticated;

-- Cek cepat (opsional, jalankan terpisah):
-- select * from public.giveaway_xp_config;                                      -- send_since terisi
-- select source_key, xp, day from public.giveaway_xp_log order by id desc limit 20;   -- baris 'gac:<id>' muncul tepat saat giveaway dibuat

notify pgrst, 'reload schema';
