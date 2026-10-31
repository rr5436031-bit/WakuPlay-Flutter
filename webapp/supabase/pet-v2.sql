-- ============================================================================================
-- PET v2: habitat (pasang / simpan), pendapatan WakuGold tiap 24 jam, klaim, lihat pet orang lain (hanya baca)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH pet.sql.
--
-- ATURAN (semua dijaga SERVER, aplikasi hanya menampilkan)
--  HABITAT
--   * Maksimal 15 pet terpasang sekaligus (pet_config 'max_active'). Pet kembar TIDAK ditumpuk di habitat: satu pet = satu unit sendiri.
--   * Di Penyimpanan pet sejenis ditumpuk (x2, x3). "Pasang" mengambil SATU unit dari tumpukan, "Simpan" mengembalikannya.
--   * Pet tidak bisa dijual, dipindah, atau diberikan ke orang lain. Hanya pemiliknya yang bisa memasang / menyimpan / klaim.
--  PENDAPATAN
--   * Tiap pet terpasang menghasilkan WakuGold sekali per 24 jam (pet_config 'claim_hours').
--     Hitung mundur dimulai saat pet DIPASANG. Pet yang disimpan tidak menghitung.
--   * Jumlah WakuGold DIUNDI SERVER tiap klaim di antara pendapatan minimum dan maksimum pet itu (diatur developer),
--     jadi tiap klaim bisa berbeda. Aplikasi tidak mengirim jumlah.
--   * Klaim hanya sah kalau waktunya sudah tiba. Setelah klaim, hitung mundur mulai ULANG 24 jam dari saat klaim
--     (hadiah yang telat diambil tidak menumpuk).
--   * Pet yang sudah siap klaim tidak bisa disimpan sebelum diklaim (supaya hadiah tidak hilang / tidak bisa dicurangi).
--   * Klik ganda / klaim paralel aman: dikunci per pemain (sama dengan gacha) dan baris pet dikunci saat klaim.
--  LIHAT PET ORANG
--   * pet_view hanya MEMBACA (stable). Yang dikirim: nama, rarity, gambar pet yang TERPASANG (maks 15).
--     Tidak dikirim: WakuGold, pendapatan, waktu klaim, isi penyimpanan, jumlah koleksi, id unit.
--   * Harus login. Semua fungsi aksi pet tidak punya parameter pemain: hanya bekerja pada akun yang sedang login.
--  DEVELOPER
--   * Tiap pet punya Pendapatan WakuGold minimum & maksimum per 24 jam (1 .. 1.000.000, maks >= min).
-- ============================================================================================

-- ---------- Konfigurasi & kolom pendapatan ----------
insert into public.pet_config (key, value) values ('max_active', 15), ('claim_hours', 24) on conflict (key) do nothing;

alter table public.pets add column if not exists income_min bigint not null default 50;
alter table public.pets add column if not exists income_max bigint not null default 100;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pets_income_chk') then
    alter table public.pets add constraint pets_income_chk check (income_min >= 1 and income_max >= income_min and income_max <= 1000000);
  end if;
end $$;

-- Nilai awal pet lama menurut rarity (hanya sekali; developer bebas mengubahnya di Panel Developer > Pet)
do $$ begin
  if not exists (select 1 from public.pet_config where key = 'income_seeded') then
    update public.pets set
      income_min = case rarity when 'mythic' then 1000 when 'legendary' then 500 when 'epic' then 200 when 'rare' then 100 else 50 end,
      income_max = case rarity when 'mythic' then 2000 when 'legendary' then 1000 when 'epic' then 400 when 'rare' then 200 else 100 end;
    insert into public.pet_config (key, value) values ('income_seeded', 1);
  end if;
end $$;

-- ---------- Unit pet (satu baris = satu pet milik pemain) ----------
create table if not exists public.pet_units (
  id         bigint generated always as identity primary key,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  pet_id     bigint not null references public.pets(id) on delete cascade,
  placed     boolean not null default false,
  ready_at   timestamptz,
  created_at timestamptz not null default now(),
  constraint pet_units_state_chk check ((placed and ready_at is not null) or (not placed and ready_at is null))
);
create index if not exists pet_units_user on public.pet_units (user_id, placed);
alter table public.pet_units enable row level security;
revoke all on public.pet_units from anon, authenticated;

-- Pindahkan koleksi lama (pet_inventory.count) menjadi unit. Aman diulang: hanya menambah selisih yang belum ada.
insert into public.pet_units (user_id, pet_id)
select i.user_id, i.pet_id
  from public.pet_inventory i
  cross join lateral generate_series(1, greatest(0, i.count - (select count(*)::int from public.pet_units u where u.user_id = i.user_id and u.pet_id = i.pet_id)));

-- ---------- Gacha: sekarang tiap hasil juga menjadi satu unit ----------
create or replace function public.pet_summon(p_count int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); cost bigint; tot numeric; n int; i int; r numeric; pid bigint; pick public.pets; had boolean;
  res jsonb := '[]'::jsonb; bal bigint;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if p_count is null or p_count not in (1, 10) then raise exception 'Jumlah gacha tidak valid'; end if;
  if public.is_banned(me) then raise exception 'Akunmu sedang diblokir'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 13));          -- satu aksi pet per pengguna dalam satu waktu

  select coalesce(sum(weight), 0), count(*) into tot, n from public.pets where active;
  if n = 0 then raise exception 'Belum ada pet di gacha'; end if;
  cost := (select value from public.pet_config where key = case p_count when 1 then 'cost_1' else 'cost_10' end)::bigint;

  perform public.wallet_debit(me, cost, 'gacha_pet');                      -- melempar 'WakuGold tidak cukup' kalau saldo kurang

  for i in 1..p_count loop
    r := random() * tot;
    select g.id into pid from (
      select w.id, sum(w.weight) over (order by w.id) as cum from public.pets w where w.active
    ) g where g.cum > r order by g.cum limit 1;
    if pid is null then select id into pid from public.pets where active order by id desc limit 1; end if;
    select * into pick from public.pets where id = pid;

    select exists (select 1 from public.pet_inventory where user_id = me and pet_id = pick.id) into had;
    if had then update public.pet_inventory set count = count + 1 where user_id = me and pet_id = pick.id;
    else insert into public.pet_inventory (user_id, pet_id) values (me, pick.id); end if;
    insert into public.pet_units (user_id, pet_id) values (me, pick.id);   -- unit baru, masuk Penyimpanan
    res := res || jsonb_build_array(jsonb_build_object('id', pick.id, 'name', pick.name, 'rarity', pick.rarity, 'image_url', pick.image_url, 'dupe', had));
  end loop;

  insert into public.pet_log (user_id, pulls, cost, result) values (me, p_count, cost, res);
  select gold into bal from public.wallets where user_id = me;
  return jsonb_build_object('ok', true, 'results', res, 'spent', cost, 'gold', bal);
end; $$;
revoke all on function public.pet_summon(int) from public, anon;
grant execute on function public.pet_summon(int) to authenticated;

-- ---------- Info Katalog: sekarang menyertakan pendapatan (hanya untuk pet yang sudah dimiliki) ----------
create or replace function public.pet_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); tot numeric; r jsonb; w jsonb; n int;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  select coalesce(sum(weight), 0), count(*) into tot, n from public.pets where active;
  select coalesce(jsonb_agg(jsonb_build_object('rarity', x.rarity, 'pct', round((x.s / nullif(tot, 0) * 100)::numeric, 2))
           order by array_position(array['mythic', 'legendary', 'epic', 'rare', 'common'], x.rarity)), '[]'::jsonb)
    into r from (select rarity, sum(weight) s from public.pets where active group by rarity) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'rarity', g.rarity,
           'name', case when i.user_id is not null then g.name end,
           'image_url', case when i.user_id is not null then g.image_url end,
           'income_min', case when i.user_id is not null then g.income_min end,
           'income_max', case when i.user_id is not null then g.income_max end,
           'pct', round((g.weight / nullif(tot, 0) * 100)::numeric, 3), 'owned', i.user_id is not null, 'count', coalesce(i.count, 0))
           order by array_position(array['mythic', 'legendary', 'epic', 'rare', 'common'], g.rarity), g.weight, g.id), '[]'::jsonb)
    into w from public.pets g left join public.pet_inventory i on i.pet_id = g.id and i.user_id = me where g.active or i.user_id is not null;
  return jsonb_build_object(
    'cost1', (select value from public.pet_config where key = 'cost_1'),
    'cost10', (select value from public.pet_config where key = 'cost_10'),
    'total', n, 'rarity', r, 'list', w,
    'owned', (select count(*) from public.pet_inventory where user_id = me));
end; $$;
revoke all on function public.pet_info() from public, anon;
grant execute on function public.pet_info() to authenticated;

-- ---------- Habitat milikku: pet terpasang (satu per unit) + penyimpanan (ditumpuk per jenis) ----------
create or replace function public.pet_habitat_me() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  return jsonb_build_object(
    'now', now(),
    'max', (select value from public.pet_config where key = 'max_active')::int,
    'placed', coalesce((
      select jsonb_agg(jsonb_build_object('unit', u.id, 'pet_id', g.id, 'name', g.name, 'rarity', g.rarity, 'image_url', g.image_url,
               'ready_at', u.ready_at, 'min', g.income_min, 'max', g.income_max) order by u.ready_at, u.id)
        from public.pet_units u join public.pets g on g.id = u.pet_id where u.user_id = me and u.placed), '[]'::jsonb),
    'stored', coalesce((
      select jsonb_agg(jsonb_build_object('pet_id', s.id, 'name', s.name, 'rarity', s.rarity, 'image_url', s.image_url,
               'min', s.income_min, 'max', s.income_max, 'count', s.c)
               order by array_position(array['mythic', 'legendary', 'epic', 'rare', 'common'], s.rarity), s.name, s.id)
        from (select g.*, count(*) c from public.pet_units u join public.pets g on g.id = u.pet_id
               where u.user_id = me and not u.placed group by g.id) s), '[]'::jsonb));
end; $$;
revoke all on function public.pet_habitat_me() from public, anon;
grant execute on function public.pet_habitat_me() to authenticated;

-- ---------- PASANG: ambil satu unit dari Penyimpanan ----------
create or replace function public.pet_place(p_pet bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); mx int; hrs int; n int; uid bigint;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if p_pet is null then raise exception 'Pet tidak valid'; end if;
  if public.is_banned(me) then raise exception 'Akunmu sedang diblokir'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 13));
  mx  := (select value from public.pet_config where key = 'max_active')::int;
  hrs := (select value from public.pet_config where key = 'claim_hours')::int;
  select count(*) into n from public.pet_units where user_id = me and placed;
  if n >= mx then raise exception 'Habitat penuh (maksimal % pet). Simpan salah satu dulu.', mx; end if;
  select id into uid from public.pet_units where user_id = me and pet_id = p_pet and not placed order by id limit 1 for update;
  if uid is null then raise exception 'Pet itu tidak ada di Penyimpanan'; end if;
  update public.pet_units set placed = true, ready_at = now() + make_interval(hours => hrs) where id = uid;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.pet_place(bigint) from public, anon;
grant execute on function public.pet_place(bigint) to authenticated;

-- ---------- SIMPAN: kembalikan unit ke Penyimpanan (ditolak kalau hadiahnya sudah siap diklaim) ----------
create or replace function public.pet_store(p_unit bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); u public.pet_units;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if p_unit is null then raise exception 'Pet tidak valid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 13));
  select * into u from public.pet_units where id = p_unit and user_id = me and placed for update;
  if not found then raise exception 'Pet tidak ditemukan di habitat'; end if;
  if u.ready_at <= now() then raise exception 'WakuGold pet ini sudah siap. Klaim dulu sebelum menyimpannya.'; end if;
  update public.pet_units set placed = false, ready_at = null where id = u.id;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.pet_store(bigint) from public, anon;
grant execute on function public.pet_store(bigint) to authenticated;

-- ---------- KLAIM satu pet ----------
create or replace function public.pet_claim(p_unit bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); hrs int; u public.pet_units; g public.pets; earned bigint; nxt timestamptz; bal bigint;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if p_unit is null then raise exception 'Pet tidak valid'; end if;
  if public.is_banned(me) then raise exception 'Akunmu sedang diblokir'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 13));
  hrs := (select value from public.pet_config where key = 'claim_hours')::int;
  select * into u from public.pet_units where id = p_unit and user_id = me and placed for update;
  if not found then raise exception 'Pet tidak ditemukan di habitat'; end if;
  if u.ready_at > now() then return jsonb_build_object('ok', false, 'code', 'NOT_READY', 'ready_at', u.ready_at); end if;
  select * into g from public.pets where id = u.pet_id;
  earned := g.income_min + floor(random() * (g.income_max - g.income_min + 1))::bigint;     -- berbeda tiap klaim
  nxt := now() + make_interval(hours => hrs);
  insert into public.wallets (user_id) values (me) on conflict do nothing;
  update public.wallets set gold = gold + earned, updated_at = now() where user_id = me returning gold into bal;
  insert into public.gold_ledger (user_id, delta, reason) values (me, earned, 'pet_income');
  update public.pet_units set ready_at = nxt where id = u.id;
  return jsonb_build_object('ok', true, 'earned', earned, 'gold', bal, 'ready_at', nxt);
end; $$;
revoke all on function public.pet_claim(bigint) from public, anon;
grant execute on function public.pet_claim(bigint) to authenticated;

-- ---------- KLAIM SEMUA yang sudah siap ----------
create or replace function public.pet_claim_all() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); hrs int; r record; total bigint := 0; n int := 0; amt bigint; nxt timestamptz; bal bigint;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if public.is_banned(me) then raise exception 'Akunmu sedang diblokir'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 13));
  hrs := (select value from public.pet_config where key = 'claim_hours')::int;
  nxt := now() + make_interval(hours => hrs);
  for r in
    select u.id, g.income_min, g.income_max from public.pet_units u join public.pets g on g.id = u.pet_id
     where u.user_id = me and u.placed and u.ready_at <= now() order by u.id for update of u
  loop
    amt := r.income_min + floor(random() * (r.income_max - r.income_min + 1))::bigint;
    total := total + amt; n := n + 1;
    update public.pet_units set ready_at = nxt where id = r.id;
  end loop;
  if n = 0 then return jsonb_build_object('ok', false, 'code', 'NONE'); end if;
  insert into public.wallets (user_id) values (me) on conflict do nothing;
  update public.wallets set gold = gold + total, updated_at = now() where user_id = me returning gold into bal;
  insert into public.gold_ledger (user_id, delta, reason) values (me, total, 'pet_income');
  return jsonb_build_object('ok', true, 'count', n, 'earned', total, 'gold', bal);
end; $$;
revoke all on function public.pet_claim_all() from public, anon;
grant execute on function public.pet_claim_all() to authenticated;

-- ---------- LIHAT PET ORANG LAIN (hanya baca) ----------
create or replace function public.pet_view(p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); mx int := (select value from public.pet_config where key = 'max_active')::int;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if p_uid is null then raise exception 'Pemain tidak valid'; end if;
  return jsonb_build_object('readonly', true, 'max', mx, 'pets', coalesce((
    select jsonb_agg(jsonb_build_object('name', v.name, 'rarity', v.rarity, 'image_url', v.image_url))
      from (select g.name, g.rarity, g.image_url
              from public.pet_units u join public.pets g on g.id = u.pet_id
             where u.user_id = p_uid and u.placed
             order by array_position(array['mythic', 'legendary', 'epic', 'rare', 'common'], g.rarity), u.id
             limit mx) v), '[]'::jsonb));
end; $$;
revoke all on function public.pet_view(uuid) from public, anon;
grant execute on function public.pet_view(uuid) to authenticated;

-- ---------- PANEL DEVELOPER: daftar & simpan pet (sekarang dengan pendapatan) ----------
create or replace function public.pet_dev_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tot numeric;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  select coalesce(sum(weight), 0) into tot from public.pets where active;
  return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'rarity', g.rarity, 'weight', g.weight, 'image_url', g.image_url,
           'income_min', g.income_min, 'income_max', g.income_max,
           'active', g.active, 'pct', case when g.active then round((g.weight / nullif(tot, 0) * 100)::numeric, 3) else 0 end,
           'owners', (select count(*) from public.pet_inventory i where i.pet_id = g.id)) order by g.id desc) from public.pets g), '[]'::jsonb);
end; $$;
revoke all on function public.pet_dev_list() from public, anon;
grant execute on function public.pet_dev_list() to authenticated;

drop function if exists public.pet_dev_save(bigint, text, text, numeric, text, boolean);
create or replace function public.pet_dev_save(p_id bigint, p_name text, p_rarity text, p_weight numeric, p_url text, p_active boolean default true,
                                               p_income_min bigint default 50, p_income_max bigint default 100) returns bigint
language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(p_name, '')); u text := btrim(coalesce(p_url, '')); rid bigint;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  if char_length(nm) < 1 or char_length(nm) > 40 then raise exception 'Nama wajib diisi (maks 40 huruf)'; end if;
  if p_rarity is null or p_rarity not in ('common', 'rare', 'epic', 'legendary', 'mythic') then raise exception 'Rarity tidak valid'; end if;
  if p_weight is null or p_weight <= 0 or p_weight > 1000000 then raise exception 'Peluang harus lebih dari 0'; end if;
  if p_income_min is null or p_income_max is null or p_income_min < 1 then raise exception 'Pendapatan minimum minimal 1 WakuGold'; end if;
  if p_income_max < p_income_min then raise exception 'Pendapatan maksimum tidak boleh lebih kecil dari minimum'; end if;
  if p_income_max > 1000000 then raise exception 'Pendapatan maksimum 1.000.000 WakuGold'; end if;
  if u !~* '^https://[^[:space:]]+$' or char_length(u) > 500 then raise exception 'Link gambar harus https dan maks 500 karakter'; end if;
  if u !~* '\.(gif|png|webp)([?#].*)?$' then raise exception 'Link harus berupa gambar transparan .png / .webp / .gif'; end if;
  if p_id is null then
    insert into public.pets (name, rarity, weight, image_url, active, income_min, income_max)
      values (nm, p_rarity, p_weight, u, coalesce(p_active, true), p_income_min, p_income_max) returning id into rid;
  else
    update public.pets set name = nm, rarity = p_rarity, weight = p_weight, image_url = u, active = coalesce(p_active, true),
           income_min = p_income_min, income_max = p_income_max where id = p_id returning id into rid;
    if rid is null then raise exception 'Pet tidak ditemukan'; end if;
  end if;
  return rid;
end; $$;
revoke all on function public.pet_dev_save(bigint, text, text, numeric, text, boolean, bigint, bigint) from public, anon;
grant execute on function public.pet_dev_save(bigint, text, text, numeric, text, boolean, bigint, bigint) to authenticated;
