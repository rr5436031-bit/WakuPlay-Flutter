-- ============================================================================================
-- KEBUN WAKU (game kebun wortel di WakuGames)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH wakugames-clan.sql (butuh tabel wallets, gold_ledger, fungsi wallet_debit).
--
-- ATURAN (semua dihitung & dijaga SERVER; aplikasi hanya menampilkan):
--  * Awalnya kebun KOSONG (level 0). Harus Upgrade ke level 1 dulu untuk dapat penanam wortel.
--  * Wortel berbuah tiap "interval" level kebun (level 1 = 60 menit). 1 wortel = 20 WakuGold (tabel farm_config).
--  * Tiap Upgrade: waktu berbuah lebih singkat, buah per panen lebih banyak, keranjang lebih besar (tabel farm_levels).
--  * Buah menumpuk di keranjang sampai penuh (walau aplikasi ditutup). Keranjang penuh = produksi berhenti sampai dipanen.
--  * PANEN memindahkan buah jadi WakuGold. Upgrade & beli dekorasi memakai WakuGold (dipotong di server).
--  * Dekorasi (pagar, lampu, pohon, pet, orang) dibeli sekali, lalu dipasang satu per kategori.
--  * Semua perubahan terkunci per pemain (klik ganda / dua HP bersamaan aman).
-- Ubah angka game langsung di tabel farm_config / farm_levels / farm_items (Table Editor).
-- ============================================================================================

create table if not exists public.farm_config (key text primary key, value numeric not null);
insert into public.farm_config (key, value) values ('carrot_gold', 20) on conflict (key) do nothing;

create table if not exists public.farm_levels (
  level        int primary key check (level >= 1),
  cost         bigint not null check (cost >= 0),      -- harga untuk NAIK ke level ini
  interval_min int not null check (interval_min >= 1), -- menit per sekali berbuah
  yield        int not null check (yield >= 1),        -- wortel per sekali berbuah
  cap          int not null check (cap >= 1)           -- kapasitas keranjang
);
insert into public.farm_levels (level, cost, interval_min, yield, cap) values
  (1,     300,   60, 1,  3),   -- 60 menit
  (2,     600,   60, 1,  4),   -- 60 menit
  (3,    1200,   50, 2,  5),
  (4,    2400,   45, 2,  6),
  (5,    4800,   40, 3,  8),
  (6,    9000,   35, 3, 10),
  (7,   16000,   30, 4, 12),
  (8,   28000,   25, 5, 15),
  (9,   50000,   20, 6, 18),
  (10,  90000,   15, 8, 24)
on conflict (level) do nothing;

create table if not exists public.farm_items (
  id     text primary key,
  cat    text not null check (cat in ('fence', 'lamp', 'tree', 'pet', 'person')),
  name   text not null,
  rarity text not null check (rarity in ('common', 'rare', 'epic', 'legendary')),
  price  bigint not null check (price > 0),
  emoji  text not null,
  sort   int not null default 0,
  active boolean not null default true
);
insert into public.farm_items (id, cat, name, rarity, price, emoji, sort) values
  ('fence_wood',  'fence', 'Pagar Kayu',      'common',     200, '🪵', 1),
  ('fence_white', 'fence', 'Pagar Putih',     'rare',       600, '🤍', 2),
  ('fence_stone', 'fence', 'Pagar Batu',      'epic',      1500, '🪨', 3),
  ('fence_gold',  'fence', 'Pagar Emas',      'legendary', 4000, '👑', 4),
  ('lamp_lantern','lamp',  'Lentera',         'common',     150, '🏮', 1),
  ('lamp_bulb',   'lamp',  'Lampu Taman',     'rare',       500, '💡', 2),
  ('lamp_torch',  'lamp',  'Obor',            'epic',      1200, '🔥', 3),
  ('lamp_crystal','lamp',  'Kristal Bulan',   'legendary', 3000, '🔮', 4),
  ('tree_apple',  'tree',  'Pohon Rindang',   'common',     300, '🌳', 1),
  ('tree_pine',   'tree',  'Cemara',          'rare',       700, '🎄', 2),
  ('tree_sakura', 'tree',  'Sakura',          'epic',      1500, '🌸', 3),
  ('tree_palm',   'tree',  'Palem',           'epic',      2500, '🌴', 4),
  ('tree_rainbow','tree',  'Pohon Pelangi',   'legendary', 5000, '🌈', 5),
  ('pet_bird',    'pet',   'Burung Biru',     'common',     500, '🐦', 1),
  ('pet_cat',     'pet',   'Kucing',          'rare',      1000, '🐱', 2),
  ('pet_rabbit',  'pet',   'Kelinci',         'rare',      1200, '🐰', 3),
  ('pet_dog',     'pet',   'Anjing',          'epic',      1800, '🐶', 4),
  ('pet_dragon',  'pet',   'Naga Mini',       'legendary', 5000, '🐲', 5),
  ('man_farmer',  'person','Petani',          'common',     400, '👨‍🌾', 1),
  ('man_farmerw', 'person','Petani Wanita',   'common',     400, '👩‍🌾', 2),
  ('man_wizard',  'person','Penyihir',        'rare',      1500, '🧙', 3),
  ('man_robot',   'person','Robot Tani',      'legendary', 4500, '🤖', 4)
on conflict (id) do nothing;

create table if not exists public.farm_players (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  level      int  not null default 0,
  stock      int  not null default 0 check (stock >= 0),
  last_tick  timestamptz,                                  -- awal siklus berbuah yang sedang jalan (null = berhenti: kosong / keranjang penuh)
  equipped   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.farm_owned (
  user_id   uuid not null references auth.users(id) on delete cascade,
  item_id   text not null references public.farm_items(id) on delete cascade,
  bought_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
do $$ declare t text; begin
  foreach t in array array['farm_config', 'farm_levels', 'farm_items', 'farm_players', 'farm_owned'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------- Hitung produksi sejak terakhir (dipanggil di awal SETIAP aksi, baris pemain dikunci) ----------
create or replace function public.farm_settle(p_uid uuid) returns public.farm_players
language plpgsql security definer set search_path = public as $$
declare p public.farm_players; lv public.farm_levels; cycles bigint; ns bigint;
begin
  insert into public.farm_players (user_id) values (p_uid) on conflict do nothing;
  select * into p from public.farm_players where user_id = p_uid for update;
  if p.level > 0 then
    select * into lv from public.farm_levels where level = p.level;
    if p.last_tick is not null then
      cycles := floor(extract(epoch from (now() - p.last_tick)) / (lv.interval_min * 60));
      if cycles > 0 then
        ns := least(lv.cap::bigint, p.stock + cycles * lv.yield);
        p.stock := ns::int;
        p.last_tick := case when ns >= lv.cap then null else p.last_tick + make_interval(mins => (cycles * lv.interval_min)::int) end;
      end if;
    elsif p.stock < lv.cap then
      p.last_tick := now();
    end if;
    update public.farm_players set stock = p.stock, last_tick = p.last_tick where user_id = p_uid;
  end if;
  return p;
end; $$;
revoke all on function public.farm_settle(uuid) from public, anon, authenticated;

create or replace function public.farm_build_state(p public.farm_players) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cur public.farm_levels; nxt public.farm_levels; maxl int;
begin
  select * into cur from public.farm_levels where level = p.level;
  select * into nxt from public.farm_levels where level = p.level + 1;
  select max(level) into maxl from public.farm_levels;
  return jsonb_build_object(
    'level', p.level, 'max_level', maxl, 'stock', p.stock,
    'cap', cur.cap, 'interval_min', cur.interval_min, 'yield', cur.yield,
    'next_at', case when p.last_tick is not null and cur.interval_min is not null then p.last_tick + make_interval(mins => cur.interval_min) end,
    'next', case when nxt.level is null then null else jsonb_build_object('level', nxt.level, 'cost', nxt.cost, 'interval_min', nxt.interval_min, 'yield', nxt.yield, 'cap', nxt.cap) end,
    'carrot_gold', (select value from public.farm_config where key = 'carrot_gold'),
    'equipped', p.equipped,
    'owned', coalesce((select jsonb_agg(item_id) from public.farm_owned where user_id = p.user_id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'cat', cat, 'name', name, 'rarity', rarity, 'price', price, 'emoji', emoji) order by cat, sort, price) from public.farm_items where active), '[]'::jsonb),
    'gold', (select gold from public.wallets where user_id = p.user_id),
    'server_now', now());
end; $$;
revoke all on function public.farm_build_state(public.farm_players) from public, anon, authenticated;

create or replace function public.farm_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.farm_players;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  p := public.farm_settle(me);
  return public.farm_build_state(p);
end; $$;
revoke all on function public.farm_state() from public, anon;
grant execute on function public.farm_state() to authenticated;

-- ---------- PANEN: wortel di keranjang -> WakuGold ----------
create or replace function public.farm_harvest() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.farm_players; per numeric; earned bigint; n int; lv public.farm_levels;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  p := public.farm_settle(me);
  if p.level = 0 then raise exception 'Kebun masih kosong. Upgrade dulu untuk menanam wortel.'; end if;
  if p.stock = 0 then return jsonb_build_object('ok', false, 'code', 'EMPTY'); end if;
  per := (select value from public.farm_config where key = 'carrot_gold');
  n := p.stock; earned := (n * per)::bigint;
  insert into public.wallets (user_id) values (me) on conflict do nothing;
  update public.wallets set gold = gold + earned, updated_at = now() where user_id = me;
  insert into public.gold_ledger (user_id, delta, reason) values (me, earned, 'farm_harvest');
  select * into lv from public.farm_levels where level = p.level;
  update public.farm_players set stock = 0, last_tick = coalesce(p.last_tick, now()) where user_id = me returning * into p;
  return jsonb_build_object('ok', true, 'carrots', n, 'earned', earned) || public.farm_build_state(p);
end; $$;
revoke all on function public.farm_harvest() from public, anon;
grant execute on function public.farm_harvest() to authenticated;

-- ---------- UPGRADE ----------
create or replace function public.farm_upgrade() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.farm_players; nxt public.farm_levels;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  p := public.farm_settle(me);
  select * into nxt from public.farm_levels where level = p.level + 1;
  if nxt.level is null then raise exception 'Kebun sudah level maksimal'; end if;
  perform public.wallet_debit(me, nxt.cost, 'farm_upgrade');          -- melempar 'WakuGold tidak cukup' kalau saldo kurang
  update public.farm_players
     set level = nxt.level,
         last_tick = case when stock < nxt.cap then coalesce(last_tick, now()) else null end
   where user_id = me returning * into p;
  return jsonb_build_object('ok', true) || public.farm_build_state(p);
end; $$;
revoke all on function public.farm_upgrade() from public, anon;
grant execute on function public.farm_upgrade() to authenticated;

-- ---------- BELI dekorasi (otomatis dipasang kalau slot kategorinya masih kosong) ----------
create or replace function public.farm_buy(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.farm_players; it public.farm_items;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  select * into it from public.farm_items where id = p_item and active;
  if not found then raise exception 'Item tidak tersedia'; end if;
  p := public.farm_settle(me);
  if exists (select 1 from public.farm_owned where user_id = me and item_id = it.id) then raise exception 'Item ini sudah kamu miliki'; end if;
  perform public.wallet_debit(me, it.price, 'farm_item');
  insert into public.farm_owned (user_id, item_id) values (me, it.id);
  if coalesce(p.equipped ->> it.cat, '') = '' then
    update public.farm_players set equipped = jsonb_set(equipped, array[it.cat], to_jsonb(it.id)) where user_id = me returning * into p;
  end if;
  return jsonb_build_object('ok', true) || public.farm_build_state(p);
end; $$;
revoke all on function public.farm_buy(text) from public, anon;
grant execute on function public.farm_buy(text) to authenticated;

-- ---------- PASANG / COPOT dekorasi (satu per kategori) ----------
create or replace function public.farm_equip(p_cat text, p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.farm_players;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if p_cat not in ('fence', 'lamp', 'tree', 'pet', 'person') then raise exception 'Kategori tidak valid'; end if;
  p := public.farm_settle(me);
  if p_item is null or p_item = '' then
    update public.farm_players set equipped = equipped - p_cat where user_id = me returning * into p;
  else
    if not exists (select 1 from public.farm_owned o join public.farm_items i on i.id = o.item_id where o.user_id = me and o.item_id = p_item and i.cat = p_cat) then
      raise exception 'Kamu belum memiliki item ini';
    end if;
    update public.farm_players set equipped = jsonb_set(equipped, array[p_cat], to_jsonb(p_item)) where user_id = me returning * into p;
  end if;
  return jsonb_build_object('ok', true) || public.farm_build_state(p);
end; $$;
revoke all on function public.farm_equip(text, text) from public, anon;
grant execute on function public.farm_equip(text, text) to authenticated;
