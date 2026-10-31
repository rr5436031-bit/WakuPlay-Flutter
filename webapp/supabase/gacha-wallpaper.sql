-- ============================================================================================
-- GACHA WALLPAPER (WakuGames) - spin pakai WakuGold, hasil jadi koleksi, bisa dipasang sebagai banner profil
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH wakugames-clan.sql, perks-premium.sql, dan keamanan-7-akses-panel.sql.
--
-- ATURAN (semua dijaga SERVER):
--  * Summon 1x = 100 WakuGold, 10x = 1.000 WakuGold (ubah di tabel gacha_config).
--  * Hasil diundi di server memakai bobot peluang tiap wallpaper (persen asli = bobot / total bobot semua wallpaper aktif).
--  * Dapat wallpaper yang sudah dimiliki -> 50% harga per tarikan dikembalikan sebagai WakuGold (ubah dupe_refund_pct).
--  * Saldo dipotong dan hasil dicatat dalam SATU transaksi; klik ganda aman (dikunci per pengguna).
--  * Hanya DEVELOPER yang bisa menambah / mengubah / menghapus wallpaper dan mengunggah gambarnya.
--  * Wallpaper hasil gacha bisa dijadikan banner profil (tetap khusus Premium/staf seperti aturan banner).
-- ============================================================================================

create table if not exists public.gacha_config (key text primary key, value numeric not null);
insert into public.gacha_config (key, value) values ('cost_1', 100), ('cost_10', 1000), ('dupe_refund_pct', 50) on conflict (key) do nothing;

create table if not exists public.gacha_wallpapers (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 1 and 40),
  rarity     text not null check (rarity in ('common', 'rare', 'epic', 'legendary', 'mythic')),
  weight     numeric not null check (weight > 0 and weight <= 1000000),
  image_url  text not null check (char_length(image_url) <= 500),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.gacha_inventory (
  user_id      uuid   not null references auth.users(id) on delete cascade,
  wallpaper_id bigint not null references public.gacha_wallpapers(id) on delete cascade,
  count        int    not null default 1,
  first_at     timestamptz not null default now(),
  primary key (user_id, wallpaper_id)
);
create table if not exists public.gacha_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  pulls      int not null, cost bigint not null, refund bigint not null default 0,
  result     jsonb not null, created_at timestamptz not null default now()
);
create index if not exists gacha_log_user on public.gacha_log (user_id, created_at desc);

do $$ declare t text; begin
  foreach t in array array['gacha_config', 'gacha_wallpapers', 'gacha_inventory', 'gacha_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------- Info halaman gacha: harga, persentase per rarity & per wallpaper, jumlah koleksi ----------
create or replace function public.gacha_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); tot numeric; r jsonb; w jsonb; n int;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  select coalesce(sum(weight), 0), count(*) into tot, n from public.gacha_wallpapers where active;
  select coalesce(jsonb_agg(jsonb_build_object('rarity', x.rarity, 'pct', round((x.s / nullif(tot, 0) * 100)::numeric, 2))
           order by array_position(array['mythic', 'legendary', 'epic', 'rare', 'common'], x.rarity)), '[]'::jsonb)
    into r from (select rarity, sum(weight) s from public.gacha_wallpapers where active group by rarity) x;
  -- gambar hanya dikirim untuk wallpaper yang sudah dimiliki (yang belum dimiliki tetap kejutan)
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'rarity', g.rarity,
           'pct', round((g.weight / nullif(tot, 0) * 100)::numeric, 3), 'owned', i.user_id is not null)
           order by array_position(array['mythic', 'legendary', 'epic', 'rare', 'common'], g.rarity), g.weight, g.id), '[]'::jsonb)
    into w from public.gacha_wallpapers g left join public.gacha_inventory i on i.wallpaper_id = g.id and i.user_id = me where g.active;
  return jsonb_build_object(
    'cost1', (select value from public.gacha_config where key = 'cost_1'),
    'cost10', (select value from public.gacha_config where key = 'cost_10'),
    'refund_pct', (select value from public.gacha_config where key = 'dupe_refund_pct'),
    'total', n, 'rarity', r, 'list', w,
    'owned', (select count(*) from public.gacha_inventory where user_id = me));
end; $$;
revoke all on function public.gacha_info() from public, anon;
grant execute on function public.gacha_info() to authenticated;

-- ---------- Koleksi milikku ----------
create or replace function public.gacha_inventory_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'rarity', g.rarity, 'image_url', g.image_url, 'count', i.count)
           order by array_position(array['mythic', 'legendary', 'epic', 'rare', 'common'], g.rarity), i.first_at desc), '[]'::jsonb)
    from public.gacha_inventory i join public.gacha_wallpapers g on g.id = i.wallpaper_id where i.user_id = auth.uid();
$$;
revoke all on function public.gacha_inventory_me() from public, anon;
grant execute on function public.gacha_inventory_me() to authenticated;

-- ---------- SUMMON (1x atau 10x) ----------
create or replace function public.gacha_summon(p_count int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); cost bigint; per bigint; refund_pct numeric; tot numeric; n int;
  i int; r numeric; pid bigint; pick public.gacha_wallpapers; had boolean; refund bigint := 0; res jsonb := '[]'::jsonb; bal bigint;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if p_count not in (1, 10) then raise exception 'Jumlah summon tidak valid'; end if;
  if public.is_banned(me) then raise exception 'Akunmu sedang diblokir'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 11));          -- satu summon per pengguna dalam satu waktu

  select coalesce(sum(weight), 0), count(*) into tot, n from public.gacha_wallpapers where active;
  if n = 0 then raise exception 'Belum ada wallpaper di gacha'; end if;
  cost := (select value from public.gacha_config where key = case p_count when 1 then 'cost_1' else 'cost_10' end)::bigint;
  per := cost / p_count;
  refund_pct := (select value from public.gacha_config where key = 'dupe_refund_pct');

  perform public.wallet_debit(me, cost, 'gacha_wallpaper');                -- melempar 'WakuGold tidak cukup' kalau saldo kurang

  for i in 1..p_count loop
    r := random() * tot;
    select g.id into pid from (
      select w.id, sum(w.weight) over (order by w.id) as cum from public.gacha_wallpapers w where w.active
    ) g where g.cum > r order by g.cum limit 1;
    if pid is null then select id into pid from public.gacha_wallpapers where active order by id desc limit 1; end if;
    select * into pick from public.gacha_wallpapers where id = pid;

    select exists (select 1 from public.gacha_inventory where user_id = me and wallpaper_id = pick.id) into had;
    if had then
      update public.gacha_inventory set count = count + 1 where user_id = me and wallpaper_id = pick.id;
      refund := refund + floor(per * refund_pct / 100)::bigint;
    else
      insert into public.gacha_inventory (user_id, wallpaper_id) values (me, pick.id);
    end if;
    res := res || jsonb_build_array(jsonb_build_object('id', pick.id, 'name', pick.name, 'rarity', pick.rarity, 'image_url', pick.image_url, 'dupe', had));
  end loop;

  if refund > 0 then
    update public.wallets set gold = gold + refund, updated_at = now() where user_id = me;
    insert into public.gold_ledger (user_id, delta, reason) values (me, refund, 'gacha_refund');
  end if;
  insert into public.gacha_log (user_id, pulls, cost, refund, result) values (me, p_count, cost, refund, res);
  select gold into bal from public.wallets where user_id = me;
  return jsonb_build_object('ok', true, 'results', res, 'spent', cost, 'refund', refund, 'gold', bal);
end; $$;
revoke all on function public.gacha_summon(int) from public, anon;
grant execute on function public.gacha_summon(int) to authenticated;

-- ---------- PANEL DEVELOPER: kelola wallpaper ----------
create or replace function public.gacha_dev_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tot numeric;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  select coalesce(sum(weight), 0) into tot from public.gacha_wallpapers where active;
  return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'rarity', g.rarity, 'weight', g.weight, 'image_url', g.image_url,
           'active', g.active, 'pct', case when g.active then round((g.weight / nullif(tot, 0) * 100)::numeric, 3) else 0 end,
           'owners', (select count(*) from public.gacha_inventory i where i.wallpaper_id = g.id)) order by g.id desc) from public.gacha_wallpapers g), '[]'::jsonb);
end; $$;
revoke all on function public.gacha_dev_list() from public, anon;
grant execute on function public.gacha_dev_list() to authenticated;

create or replace function public.gacha_dev_save(p_id bigint, p_name text, p_rarity text, p_weight numeric, p_url text, p_active boolean default true) returns bigint
language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(p_name, '')); u text := btrim(coalesce(p_url, '')); rid bigint;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  if char_length(nm) < 1 or char_length(nm) > 40 then raise exception 'Nama wajib diisi (maks 40 huruf)'; end if;
  if p_rarity not in ('common', 'rare', 'epic', 'legendary', 'mythic') then raise exception 'Rarity tidak valid'; end if;
  if p_weight is null or p_weight <= 0 or p_weight > 1000000 then raise exception 'Peluang harus lebih dari 0'; end if;
  if u !~* '^https://[^[:space:]]+$' or char_length(u) > 500 then raise exception 'Link gambar harus https dan maks 500 karakter'; end if;
  if u !~* '\.(gif|jpe?g|png|webp)([?#].*)?$' and u !~* '/storage/v1/object/public/gacha/' then raise exception 'Link harus berupa gambar .gif / .jpg / .png / .webp'; end if;
  if p_id is null then
    insert into public.gacha_wallpapers (name, rarity, weight, image_url, active) values (nm, p_rarity, p_weight, u, coalesce(p_active, true)) returning id into rid;
  else
    update public.gacha_wallpapers set name = nm, rarity = p_rarity, weight = p_weight, image_url = u, active = coalesce(p_active, true) where id = p_id returning id into rid;
    if rid is null then raise exception 'Wallpaper tidak ditemukan'; end if;
  end if;
  return rid;
end; $$;
revoke all on function public.gacha_dev_save(bigint, text, text, numeric, text, boolean) from public, anon;
grant execute on function public.gacha_dev_save(bigint, text, text, numeric, text, boolean) to authenticated;

create or replace function public.gacha_dev_delete(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  delete from public.gacha_wallpapers where id = p_id;      -- koleksi pemain yang memilikinya ikut terhapus
end; $$;
revoke all on function public.gacha_dev_delete(bigint) from public, anon;
grant execute on function public.gacha_dev_delete(bigint) to authenticated;

-- ---------- Penyimpanan gambar (foto / GIF hasil impor developer) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gacha', 'gacha', true, 10485760, array['image/gif', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 10485760, allowed_mime_types = array['image/gif', 'image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "gacha read" on storage.objects;
create policy "gacha read" on storage.objects for select using (bucket_id = 'gacha');
drop policy if exists "gacha dev insert" on storage.objects;
create policy "gacha dev insert" on storage.objects for insert to authenticated with check (bucket_id = 'gacha' and public.is_developer());
drop policy if exists "gacha dev delete" on storage.objects;
create policy "gacha dev delete" on storage.objects for delete to authenticated using (bucket_id = 'gacha' and public.is_developer());

-- ---------- Banner profil: boleh pakai link .gif manual ATAU wallpaper milik sendiri dari gacha ----------
create or replace function public.set_my_banner(p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := nullif(btrim(coalesce(p_url, '')), ''); own boolean := false;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v is not null and not public.wp_perk_ok(auth.uid(), 'banner') then raise exception 'Banner profil khusus Premium'; end if;
  if v is not null then
    select exists (select 1 from public.gacha_inventory i join public.gacha_wallpapers g on g.id = i.wallpaper_id
                    where i.user_id = auth.uid() and g.image_url = v) into own;
    if not own and (char_length(v) > 500 or v !~* '^https?://[^[:space:]]+$' or v !~* '\.gif($|[?#])') then
      raise exception 'Link banner harus berupa URL .gif, atau pilih wallpaper dari koleksi gacha';
    end if;
  end if;
  insert into public.profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.profiles set banner_url = v where user_id = auth.uid();
end; $$;
revoke all on function public.set_my_banner(text) from public, anon;
grant execute on function public.set_my_banner(text) to authenticated;
