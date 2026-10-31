-- ============================================================================================
-- AVATAR BORDER (WakuGames > Avatar Border) - 50 border animasi, dibeli pakai WakuGold
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH wakugames-clan.sql (butuh tabel wallets, gold_ledger, fungsi wallet_debit) dan blokir.sql.
--
-- ATURAN (semua dijaga SERVER, aplikasi tidak bisa menipu):
--  * Harga diambil dari tabel avatar_borders (katalog). Harga / saldo yang dikirim aplikasi TIDAK dipakai.
--  * Beli = potong WakuGold + catat kepemilikan dalam SATU transaksi. Dikunci per pengguna (klik ganda aman).
--  * Border yang sudah dimiliki tidak bisa dibeli lagi (tidak ada potongan kedua).
--  * Pakai / lepas border hanya untuk border yang dimiliki. Melepas TIDAK menghapus koleksi.
--  * Border yang sedang dipakai tersimpan di server (avatar_border_equipped), tidak hilang saat logout / ganti HP.
--  * Seimbangkan harga lewat Table Editor (tabel avatar_borders, kolom price/active) atau dev_border_save().
-- ============================================================================================

create table if not exists public.avatar_borders (
  id         text primary key check (id ~ '^b[0-9]{2}$'),
  name       text   not null check (char_length(name) between 1 and 40),
  rarity     text   not null check (rarity in ('basic', 'standard', 'premium', 'epic', 'legendary', 'mythic')),
  price      bigint not null check (price between 1 and 100000000),
  sort       int    not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.avatar_border_owned (
  user_id    uuid not null references auth.users(id) on delete cascade,
  border_id  text not null references public.avatar_borders(id) on delete cascade,
  price_paid bigint not null,
  bought_at  timestamptz not null default now(),
  primary key (user_id, border_id)
);
create table if not exists public.avatar_border_equipped (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  border_id  text not null references public.avatar_borders(id) on delete cascade,
  updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['avatar_borders', 'avatar_border_owned', 'avatar_border_equipped'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Katalog awal (kalau id sudah ada, harga yang kamu ubah TIDAK ditimpa)
insert into public.avatar_borders (id, name, rarity, price, sort) values
  ('b01', 'Demon Horns', 'basic', 500, 1),
  ('b02', 'Moonflowers', 'basic', 600, 2),
  ('b03', 'Silver Lace', 'basic', 700, 3),
  ('b04', 'Infinite Swirl', 'basic', 800, 4),
  ('b05', 'Leaf Crown', 'basic', 900, 5),
  ('b06', 'Tiny Stars', 'basic', 1000, 6),
  ('b07', 'Frost Shards', 'basic', 1100, 7),
  ('b08', 'Cloud Ring', 'basic', 1200, 8),
  ('b09', 'Ember Sparks', 'basic', 1350, 9),
  ('b10', 'Sakura Petals', 'basic', 1500, 10),
  ('b11', 'Neon Circuit', 'standard', 2000, 11),
  ('b12', 'Crystal Crown', 'standard', 2300, 12),
  ('b13', 'Ocean Current', 'standard', 2600, 13),
  ('b14', 'Thunder Claws', 'standard', 2900, 14),
  ('b15', 'Butterfly Garden', 'standard', 3200, 15),
  ('b16', 'Lunar Eclipse', 'standard', 3500, 16),
  ('b17', 'Toxic Vines', 'standard', 3800, 17),
  ('b18', 'Mechanical Halo', 'standard', 4000, 18),
  ('b19', 'Aurora Veil', 'standard', 4200, 19),
  ('b20', 'Phantom Feathers', 'standard', 4500, 20),
  ('b21', 'Fallen Angel', 'premium', 5000, 21),
  ('b22', 'Celestial Wings', 'premium', 5500, 22),
  ('b23', 'Dragon Sovereign', 'premium', 6500, 23),
  ('b24', 'Galaxy Portal', 'premium', 7000, 24),
  ('b25', 'Royal Gold', 'premium', 7500, 25),
  ('b26', 'Abyss Chains', 'premium', 8000, 26),
  ('b27', 'Phoenix Rebirth', 'premium', 8500, 27),
  ('b28', 'Spirit Fox', 'premium', 9000, 28),
  ('b29', 'Crystal Butterfly', 'premium', 9500, 29),
  ('b30', 'Starfall Crown', 'premium', 10000, 30),
  ('b31', 'Void Reaper', 'epic', 12000, 31),
  ('b32', 'Cyber Overdrive', 'epic', 13000, 32),
  ('b33', 'Storm Dragon', 'epic', 14000, 33),
  ('b34', 'Deep Sea Abyss', 'epic', 15000, 34),
  ('b35', 'Divine Judgment', 'epic', 16500, 35),
  ('b36', 'Blood Moon', 'epic', 17500, 36),
  ('b37', 'Prism Shatter', 'epic', 18500, 37),
  ('b38', 'Time Fracture', 'epic', 20000, 38),
  ('b39', 'Eternal Seraph', 'legendary', 25000, 39),
  ('b40', 'Black Hole', 'legendary', 27500, 40),
  ('b41', 'World Tree', 'legendary', 30000, 41),
  ('b42', 'Cosmic Leviathan', 'legendary', 32500, 42),
  ('b43', 'Infinity Rings', 'legendary', 35000, 43),
  ('b44', 'Monarch of Shadows', 'legendary', 37500, 44),
  ('b45', 'Divine Mecha', 'legendary', 40000, 45),
  ('b46', 'Reality Breaker', 'mythic', 50000, 46),
  ('b47', 'Eternal Galaxy', 'mythic', 60000, 47),
  ('b48', 'Quantum Serpent', 'mythic', 70000, 48),
  ('b49', 'Astral Sovereign', 'mythic', 85000, 49),
  ('b50', 'Singularity King', 'mythic', 100000, 50)
on conflict (id) do nothing;

-- ---------- Toko: katalog + milikku + yang dipakai + saldo ----------
create or replace function public.border_shop() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  return jsonb_build_object(
    'gold', coalesce((select gold from public.wallets where user_id = me), 0),
    'equipped', (select border_id from public.avatar_border_equipped where user_id = me),
    'owned', coalesce((select jsonb_agg(border_id) from public.avatar_border_owned where user_id = me), '[]'::jsonb),
    'list', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'rarity', b.rarity, 'price', b.price, 'sort', b.sort) order by b.sort, b.id)
                        from public.avatar_borders b
                       where b.active or exists (select 1 from public.avatar_border_owned o where o.user_id = me and o.border_id = b.id)), '[]'::jsonb));
end; $$;
revoke all on function public.border_shop() from public, anon;
grant execute on function public.border_shop() to authenticated;

-- ---------- BELI: harga dari katalog, potong saldo + catat kepemilikan atomik ----------
create or replace function public.border_buy(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b public.avatar_borders; bal bigint;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if public.is_banned(me) then raise exception 'Akunmu sedang diblokir'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 31));          -- satu pembelian per pengguna dalam satu waktu
  select * into b from public.avatar_borders where id = p_id and active;
  if not found then raise exception 'Border tidak tersedia'; end if;
  if exists (select 1 from public.avatar_border_owned where user_id = me and border_id = b.id) then
    raise exception 'Kamu sudah memiliki border ini';
  end if;
  perform public.wallet_debit(me, b.price, 'avatar_border:' || b.id);      -- melempar 'WakuGold tidak cukup' kalau saldo kurang
  insert into public.avatar_border_owned (user_id, border_id, price_paid) values (me, b.id, b.price);
  select gold into bal from public.wallets where user_id = me;
  return jsonb_build_object('ok', true, 'border_id', b.id, 'spent', b.price, 'gold', bal);
end; $$;
revoke all on function public.border_buy(text) from public, anon;
grant execute on function public.border_buy(text) to authenticated;

-- ---------- PAKAI / LEPAS (p_id null = lepas) ----------
create or replace function public.border_equip(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if p_id is null then
    delete from public.avatar_border_equipped where user_id = me;           -- hanya melepas, koleksi tetap
    return jsonb_build_object('ok', true, 'equipped', null);
  end if;
  if not exists (select 1 from public.avatar_border_owned where user_id = me and border_id = p_id) then
    raise exception 'Kamu belum memiliki border ini';
  end if;
  insert into public.avatar_border_equipped (user_id, border_id) values (me, p_id)
  on conflict (user_id) do update set border_id = excluded.border_id, updated_at = now();
  return jsonb_build_object('ok', true, 'equipped', p_id);
end; $$;
revoke all on function public.border_equip(text) from public, anon;
grant execute on function public.border_equip(text) to authenticated;

-- ---------- Border yang dipakai beberapa pengguna sekaligus (untuk komentar, chat, profil, clan) ----------
create or replace function public.border_of(p_uids uuid[]) returns table (user_id uuid, border_id text)
language sql stable security definer set search_path = public as $$
  select e.user_id, e.border_id
    from public.avatar_border_equipped e
   where auth.uid() is not null and e.user_id = any (p_uids[1:100]);
$$;
revoke all on function public.border_of(uuid[]) from public, anon;
grant execute on function public.border_of(uuid[]) to authenticated;

-- ---------- Developer: atur harga / aktif-nonaktif ----------
create or replace function public.dev_border_save(p_id text, p_price bigint, p_active boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  if p_price is null or p_price not between 1 and 100000000 then raise exception 'Harga 1 sampai 100.000.000'; end if;
  update public.avatar_borders set price = p_price, active = coalesce(p_active, true) where id = p_id;
  if not found then raise exception 'Border tidak ditemukan'; end if;
end; $$;
revoke all on function public.dev_border_save(text, bigint, boolean) from public, anon;
grant execute on function public.dev_border_save(text, bigint, boolean) to authenticated;
