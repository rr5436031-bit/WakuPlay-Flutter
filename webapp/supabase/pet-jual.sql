-- ============================================================================================
-- PET: JUAL PET dari Penyimpanan
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH pet-v2.sql.
--
-- ATURAN (semua dijaga SERVER, aplikasi hanya menampilkan)
--   * Harga jual = pendapatan MINIMUM pet itu per 24 jam (pets.income_min). Contoh: pet 100-100 -> dijual 100 WakuGold.
--     Minimum dipakai supaya harganya pasti (tidak diundi) dan tidak bisa dijadikan untung dari gacha lewat pet berpendapatan tinggi.
--   * Hanya pet di PENYIMPANAN yang bisa dijual. Pet yang terpasang harus disimpan dulu
--     (Simpan sendiri sudah menolak pet yang hadiahnya belum diklaim, jadi hadiah tidak pernah hilang).
--   * Satu penjualan = satu pet. Pet yang dijual dihapus permanen, tidak bisa dikembalikan.
--   * Harga ditentukan server. Aplikasi mengirim harga yang terlihat di layar; kalau harga di server sudah berubah
--     (developer mengubah pendapatan), penjualan DITOLAK dan layar dimuat ulang, jadi pemain tidak pernah kaget.
--   * Dikunci per pemain (sama dengan gacha/pasang/klaim) + baris pet dikunci: klik ganda atau dua HP bersamaan
--     tidak bisa menjual satu pet dua kali.
--   * Akun diblokir tidak bisa menjual.
--   * Batas 50 penjualan per 24 jam per pemain (pet_config 'sell_daily_limit').
--   * Saklar darurat untuk developer: pet_config 'sell_enabled' = 0 mematikan jual seketika
--       update public.pet_config set value = 0 where key = 'sell_enabled';      -- matikan
--       update public.pet_config set value = 1 where key = 'sell_enabled';      -- hidupkan lagi
--   * WakuGold masuk lewat dompet + tercatat di gold_ledger (alasan 'pet_sell').
--   * Koleksi (pet_inventory) otomatis disamakan dengan jumlah pet sebenarnya. Kalau pet jenis itu habis terjual,
--     di Katalog kembali tampil "?" (belum dimiliki).
-- ============================================================================================

do $$
begin
  if to_regclass('public.pet_units') is null then raise exception 'Tabel pet_units belum ada. Jalankan pet-v2.sql dulu.'; end if;
  if to_regclass('public.pet_config') is null then raise exception 'Tabel pet_config belum ada. Jalankan pet.sql dulu.'; end if;
  if to_regclass('public.gold_ledger') is null or to_regclass('public.wallets') is null then raise exception 'Dompet WakuGold belum ada. Jalankan wakugames-clan.sql dulu.'; end if;
end $$;

insert into public.pet_config (key, value) values ('sell_enabled', 1), ('sell_daily_limit', 50) on conflict (key) do nothing;

create or replace function public.pet_sell(p_pet bigint, p_expected bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  g public.pets;
  uid bigint;
  price bigint;
  bal bigint;
  lim int;
  sold int;
  left_units int;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if p_pet is null or p_expected is null then raise exception 'Pet tidak valid'; end if;
  if public.is_banned(me) then raise exception 'Akunmu sedang diblokir'; end if;
  if coalesce((select value from public.pet_config where key = 'sell_enabled'), 1) < 1 then
    raise exception 'Jual pet sedang dinonaktifkan sementara';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(me::text, 13));          -- satu aksi pet per pemain dalam satu waktu

  select * into g from public.pets where id = p_pet;
  if not found then raise exception 'Pet tidak ditemukan'; end if;
  price := g.income_min;
  if price is null or price < 1 then raise exception 'Pet ini belum bisa dijual'; end if;
  if p_expected <> price then raise exception 'Harga jual berubah menjadi % WakuGold. Cek lagi lalu coba jual', price; end if;

  -- batas harian
  lim := coalesce((select value from public.pet_config where key = 'sell_daily_limit'), 50)::int;
  select count(*) into sold from public.gold_ledger where user_id = me and reason = 'pet_sell' and created_at > now() - interval '24 hours';
  if sold >= lim then raise exception 'Batas jual harian tercapai (% pet per 24 jam)', lim; end if;

  -- hanya dari Penyimpanan (tidak terpasang); baris dikunci
  select id into uid from public.pet_units where user_id = me and pet_id = p_pet and not placed order by id limit 1 for update;
  if uid is null then raise exception 'Pet itu tidak ada di Penyimpanan. Simpan dulu kalau masih terpasang.'; end if;

  delete from public.pet_units where id = uid;

  -- samakan koleksi dengan jumlah pet sebenarnya
  select count(*) into left_units from public.pet_units where user_id = me and pet_id = p_pet;
  if left_units > 0 then
    update public.pet_inventory set count = left_units where user_id = me and pet_id = p_pet;
  else
    delete from public.pet_inventory where user_id = me and pet_id = p_pet;
  end if;

  insert into public.wallets (user_id) values (me) on conflict do nothing;
  update public.wallets set gold = gold + price, updated_at = now() where user_id = me returning gold into bal;
  insert into public.gold_ledger (user_id, delta, reason) values (me, price, 'pet_sell');

  return jsonb_build_object('ok', true, 'price', price, 'gold', bal);
end; $$;
revoke all on function public.pet_sell(bigint, bigint) from public, anon;
grant execute on function public.pet_sell(bigint, bigint) to authenticated;
