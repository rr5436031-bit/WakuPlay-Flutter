-- ============================================================================================
-- PET / PELIHARAAN (WakuGames) - katalog pet, kepemilikan pemain, gacha pet pakai WakuGold
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH wakugames-clan.sql, perks-premium.sql, keamanan-7-akses-panel.sql dan gacha-wallpaper.sql.
--
-- PEMISAHAN DATA
--  * pets           = KATALOG (nama, rarity, bobot peluang, link gambar GitHub folder Pet/). Hanya developer yang bisa mengubah.
--  * pet_inventory  = pet yang DIMILIKI pemain (satu baris per pemain per jenis pet, kolom count = jumlah).
--  * Gambar sendiri ada di GitHub (repo yang sama dengan Border / Wallpaper / Emblem), database hanya menyimpan link-nya.
--
-- ATURAN GACHA (semua dijaga SERVER, aplikasi tidak mengirim harga)
--  * Gacha 1x = 500 WakuGold, 10x = 5.000 WakuGold (ubah di tabel pet_config).
--  * Hasil diundi di server memakai bobot peluang tiap pet aktif (persen asli = bobot / total bobot).
--  * Dapat pet yang sama lagi: jumlahnya (count) bertambah. Tidak ada pengembalian WakuGold.
--  * Saldo dipotong dan hasil dicatat dalam SATU transaksi; klik ganda aman (dikunci per pengguna).
--  * Hanya DEVELOPER yang bisa menambah / mengubah / menghapus pet.
-- ============================================================================================

create table if not exists public.pet_config (key text primary key, value numeric not null);
insert into public.pet_config (key, value) values ('cost_1', 500), ('cost_10', 5000) on conflict (key) do nothing;

create table if not exists public.pets (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 1 and 40),
  rarity     text not null check (rarity in ('common', 'rare', 'epic', 'legendary', 'mythic')),
  weight     numeric not null check (weight > 0 and weight <= 1000000),
  image_url  text not null check (char_length(image_url) <= 500),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.pet_inventory (
  user_id  uuid   not null references auth.users(id) on delete cascade,
  pet_id   bigint not null references public.pets(id) on delete cascade,
  count    int    not null default 1,
  first_at timestamptz not null default now(),
  primary key (user_id, pet_id)
);
create table if not exists public.pet_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  pulls      int not null, cost bigint not null,
  result     jsonb not null, created_at timestamptz not null default now()
);
create index if not exists pet_log_user on public.pet_log (user_id, created_at desc);

do $$ declare t text; begin
  foreach t in array array['pet_config', 'pets', 'pet_inventory', 'pet_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------- Info halaman Pet: harga, peluang per rarity & per pet, jumlah koleksi ----------
-- Gambar dan nama pet yang BELUM dimiliki tidak dikirim (tetap kejutan).
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

-- ---------- Pet milikku (dipakai halaman habitat) ----------
create or replace function public.pet_inventory_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'rarity', g.rarity, 'image_url', g.image_url, 'count', i.count)
           order by array_position(array['mythic', 'legendary', 'epic', 'rare', 'common'], g.rarity), i.first_at desc), '[]'::jsonb)
    from public.pet_inventory i join public.pets g on g.id = i.pet_id where i.user_id = auth.uid();
$$;
revoke all on function public.pet_inventory_me() from public, anon;
grant execute on function public.pet_inventory_me() to authenticated;

-- ---------- GACHA (1x atau 10x) ----------
create or replace function public.pet_summon(p_count int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); cost bigint; tot numeric; n int; i int; r numeric; pid bigint; pick public.pets; had boolean;
  res jsonb := '[]'::jsonb; bal bigint;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if p_count is null or p_count not in (1, 10) then raise exception 'Jumlah gacha tidak valid'; end if;
  if public.is_banned(me) then raise exception 'Akunmu sedang diblokir'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 13));          -- satu gacha per pengguna dalam satu waktu

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
    res := res || jsonb_build_array(jsonb_build_object('id', pick.id, 'name', pick.name, 'rarity', pick.rarity, 'image_url', pick.image_url, 'dupe', had));
  end loop;

  insert into public.pet_log (user_id, pulls, cost, result) values (me, p_count, cost, res);
  select gold into bal from public.wallets where user_id = me;
  return jsonb_build_object('ok', true, 'results', res, 'spent', cost, 'gold', bal);
end; $$;
revoke all on function public.pet_summon(int) from public, anon;
grant execute on function public.pet_summon(int) to authenticated;

-- ---------- PANEL DEVELOPER: kelola pet ----------
create or replace function public.pet_dev_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tot numeric;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  select coalesce(sum(weight), 0) into tot from public.pets where active;
  return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'rarity', g.rarity, 'weight', g.weight, 'image_url', g.image_url,
           'active', g.active, 'pct', case when g.active then round((g.weight / nullif(tot, 0) * 100)::numeric, 3) else 0 end,
           'owners', (select count(*) from public.pet_inventory i where i.pet_id = g.id)) order by g.id desc) from public.pets g), '[]'::jsonb);
end; $$;
revoke all on function public.pet_dev_list() from public, anon;
grant execute on function public.pet_dev_list() to authenticated;

create or replace function public.pet_dev_save(p_id bigint, p_name text, p_rarity text, p_weight numeric, p_url text, p_active boolean default true) returns bigint
language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(p_name, '')); u text := btrim(coalesce(p_url, '')); rid bigint;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  if char_length(nm) < 1 or char_length(nm) > 40 then raise exception 'Nama wajib diisi (maks 40 huruf)'; end if;
  if p_rarity is null or p_rarity not in ('common', 'rare', 'epic', 'legendary', 'mythic') then raise exception 'Rarity tidak valid'; end if;
  if p_weight is null or p_weight <= 0 or p_weight > 1000000 then raise exception 'Peluang harus lebih dari 0'; end if;
  if u !~* '^https://[^[:space:]]+$' or char_length(u) > 500 then raise exception 'Link gambar harus https dan maks 500 karakter'; end if;
  if u !~* '\.(gif|png|webp)([?#].*)?$' then raise exception 'Link harus berupa gambar transparan .png / .webp / .gif'; end if;
  if p_id is null then
    insert into public.pets (name, rarity, weight, image_url, active) values (nm, p_rarity, p_weight, u, coalesce(p_active, true)) returning id into rid;
  else
    update public.pets set name = nm, rarity = p_rarity, weight = p_weight, image_url = u, active = coalesce(p_active, true) where id = p_id returning id into rid;
    if rid is null then raise exception 'Pet tidak ditemukan'; end if;
  end if;
  return rid;
end; $$;
revoke all on function public.pet_dev_save(bigint, text, text, numeric, text, boolean) from public, anon;
grant execute on function public.pet_dev_save(bigint, text, text, numeric, text, boolean) to authenticated;

create or replace function public.pet_dev_delete(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  delete from public.pets where id = p_id;      -- koleksi pemain yang memilikinya ikut terhapus
end; $$;
revoke all on function public.pet_dev_delete(bigint) from public, anon;
grant execute on function public.pet_dev_delete(bigint) to authenticated;
