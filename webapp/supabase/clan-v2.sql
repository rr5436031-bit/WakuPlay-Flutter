-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan SETELAH wakugames-clan.sql dan dev-wakugold.sql.
-- Isi: (1) tier badge 6-15, (2) Spin Warna x5 (lebih murah), (3) fungsi Panel Developer untuk mengelola clan.

-- ============================================================ 1) TIER BADGE 6-10
alter table public.clans drop constraint if exists clans_tier_check;
alter table public.clans add constraint clans_tier_check check (tier between 1 and 15);

insert into public.clan_config (key, value) values
  ('tier_cost_6', 40000),     -- biaya naik ke tier 6..10 (XPGold), bisa diubah
  ('tier_cost_7', 75000),
  ('tier_cost_8', 130000),
  ('tier_cost_9', 220000),
  ('tier_cost_10', 400000),
  ('tier_cost_11', 700000),
  ('tier_cost_12', 1200000),
  ('tier_cost_13', 2000000),
  ('tier_cost_14', 3500000),
  ('tier_cost_15', 6000000),
  ('spin5_cost', 1350)        -- Spin x5 (lebih murah dari 5 x spin_cost)
on conflict (key) do nothing;

create or replace function public.clan_upgrade_tier(p_req uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; c public.clans; cost bigint;
begin
  me := public.clan_op_begin(p_req);
  c := public.clan_lock_as_leader(me);
  if c.tier >= 15 then raise exception 'Tier sudah maksimal'; end if;
  cost := public.clan_cfg('tier_cost_' || (c.tier + 1))::bigint;
  if c.xp_available < cost then raise exception 'XPGold belum cukup'; end if;
  update public.clans set xp_available = xp_available - cost, tier = tier + 1 where id = c.id returning * into c;
  insert into public.clan_xp_log (clan_id, delta, kind, note, by_user) values (c.id, -cost, 'tier', 'Naik ke tier ' || c.tier, me);
  return jsonb_build_object('tier', c.tier, 'xp_available', c.xp_available);
end; $$;
revoke all on function public.clan_upgrade_tier(uuid) from public, anon;
grant execute on function public.clan_upgrade_tier(uuid) to authenticated;

-- ============================================================ 2) SPIN WARNA x5
create or replace function public.clan_spin5(p_req uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; c public.clans; cost bigint := public.clan_cfg('spin5_cost')::bigint; one bigint := public.clan_cfg('spin_cost')::bigint;
        w_c numeric := public.clan_cfg('odds_common'); w_r numeric := public.clan_cfg('odds_rare'); w_l numeric := public.clan_cfg('odds_legend'); w_m numeric := public.clan_cfg('odds_mythic');
        roll numeric; rar text; col public.clan_colors; dup boolean; refund bigint; total_refund bigint := 0; res jsonb := '[]'::jsonb; i int;
begin
  me := public.clan_op_begin(p_req);
  c := public.clan_lock_as_leader(me);
  if c.xp_available < cost then raise exception 'XPGold belum cukup'; end if;
  for i in 1..5 loop
    roll := random() * (w_c + w_r + w_l + w_m);
    rar := case when roll < w_c then 'common' when roll < w_c + w_r then 'rare' when roll < w_c + w_r + w_l then 'legend' else 'mythic' end;
    select * into col from public.clan_colors where rarity = rar order by random() limit 1;
    if not found then raise exception 'Data warna belum tersedia'; end if;
    dup := exists (select 1 from public.clan_color_owned where clan_id = c.id and color_id = col.id);
    refund := 0;
    if dup then refund := floor(one * public.clan_cfg('spin_dup_refund_pct') / 100)::bigint;
    else insert into public.clan_color_owned (clan_id, color_id) values (c.id, col.id); end if;
    total_refund := total_refund + refund;
    res := res || jsonb_build_array(jsonb_build_object('color', public.clan_color_json(col.id), 'duplicate', dup, 'refund', refund));
  end loop;
  update public.clans set xp_available = xp_available - cost + total_refund where id = c.id returning * into c;
  insert into public.clan_xp_log (clan_id, delta, kind, note, by_user) values (c.id, -cost + total_refund, 'spin', 'Spin x5', me);
  return jsonb_build_object('results', res, 'refund', total_refund, 'xp_available', c.xp_available);
end; $$;
revoke all on function public.clan_spin5(uuid) from public, anon;
grant execute on function public.clan_spin5(uuid) to authenticated;

-- ============================================================ 3) PANEL DEVELOPER: KELOLA CLAN
-- Daftar semua clan (cari tag/nama)
create or replace function public.dev_clan_list(p_q text default null, p_limit int default 100)
returns table (id bigint, tag text, name text, tier int, members int, slots int, xp_available bigint, total_xp numeric, level int, leader_name text, leader_seq bigint, c1 text, c2 text, c3 text, rarity text)
language sql stable security definer set search_path = public as $$
  select c.id, c.tag, c.name, c.tier, (select count(*)::int from public.clan_members m where m.clan_id = c.id), c.slots, c.xp_available,
         public.clan_total_xp(c.id), public.clan_level(public.clan_total_xp(c.id)), public.wp_name(c.leader), p.seq, col.c1, col.c2, col.c3, col.rarity
    from public.clans c
    left join public.profiles p on p.user_id = c.leader
    left join public.clan_colors col on col.id = c.color_id
   where public.is_developer() and c.disbanded_at is null
     and (p_q is null or btrim(p_q) = '' or position(lower(btrim(p_q)) in lower(c.tag)) > 0 or position(lower(btrim(p_q)) in lower(c.name)) > 0)
   order by 8 desc, c.id
   limit least(greatest(coalesce(p_limit, 100), 1), 300);
$$;
revoke all on function public.dev_clan_list(text, int) from public, anon;
grant execute on function public.dev_clan_list(text, int) to authenticated;

-- Tambah / kurangi XPGold clan TANPA setor Gold. Hanya mengubah XPGold tersedia: Total XP Top Clans TIDAK berubah.
create or replace function public.dev_clan_xp_adjust(p_clan bigint, p_amount bigint, p_mode text) returns bigint
language plpgsql security definer set search_path = public as $$
declare c public.clans;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_mode not in ('add', 'sub') then raise exception 'Pilih tambah atau kurangi'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000000 then raise exception 'Jumlah harus 1 sampai 1.000.000.000'; end if;
  select * into c from public.clans where id = p_clan and disbanded_at is null for update;
  if not found then raise exception 'Clan tidak ditemukan'; end if;
  if p_mode = 'sub' and c.xp_available < p_amount then raise exception 'XPGold clan hanya %, tidak bisa dikurangi %', c.xp_available, p_amount; end if;
  if p_mode = 'add' and c.xp_available + p_amount > 1000000000000 then raise exception 'XPGold terlalu besar'; end if;
  update public.clans set xp_available = xp_available + case when p_mode = 'add' then p_amount else -p_amount end   -- bank_total (XP Top Clans) sengaja tidak disentuh
   where id = c.id returning * into c;
  insert into public.clan_xp_log (clan_id, delta, kind, note, by_user)
  values (c.id, case when p_mode = 'add' then p_amount else -p_amount end, 'dev', 'Diatur developer (tanpa XP Top Clans)', auth.uid());
  return c.xp_available;
end; $$;
revoke all on function public.dev_clan_xp_adjust(bigint, bigint, text) from public, anon;
grant execute on function public.dev_clan_xp_adjust(bigint, bigint, text) to authenticated;

-- Atur tier badge clan bebas (1 sampai 15, naik maupun turun), gratis
create or replace function public.dev_clan_set_tier(p_clan bigint, p_tier int) returns int
language plpgsql security definer set search_path = public as $$
declare c public.clans;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_tier is null or p_tier < 1 or p_tier > 15 then raise exception 'Tier 1 sampai 15'; end if;
  select * into c from public.clans where id = p_clan and disbanded_at is null for update;
  if not found then raise exception 'Clan tidak ditemukan'; end if;
  update public.clans set tier = p_tier where id = c.id;
  insert into public.clan_xp_log (clan_id, delta, kind, note, by_user) values (c.id, 0, 'dev', 'Tier diatur ke ' || p_tier || ' oleh developer', auth.uid());
  return p_tier;
end; $$;
revoke all on function public.dev_clan_set_tier(bigint, int) from public, anon;
grant execute on function public.dev_clan_set_tier(bigint, int) to authenticated;

-- ============================================================ PANEL DEVELOPER: TAMBAH / KURANGI XP CLAN (Top Clans)
-- Mengubah Total XP clan (yang dipakai Top Clans & level clan), TANPA mengubah XPGold clan dan tanpa setor Gold.
create or replace function public.dev_clan_total_xp_adjust(p_clan bigint, p_amount bigint, p_mode text) returns numeric
language plpgsql security definer set search_path = public as $$
declare c public.clans;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_mode not in ('add', 'sub') then raise exception 'Pilih tambah atau kurangi'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000000 then raise exception 'Jumlah harus 1 sampai 1.000.000.000'; end if;
  select * into c from public.clans where id = p_clan and disbanded_at is null for update;
  if not found then raise exception 'Clan tidak ditemukan'; end if;
  if p_mode = 'sub' and c.bank_total < p_amount then raise exception 'XP clan hanya %, tidak bisa dikurangi %', c.bank_total, p_amount; end if;
  if p_mode = 'add' and c.bank_total + p_amount > 1000000000000 then raise exception 'XP clan terlalu besar'; end if;
  update public.clans set bank_total = bank_total + case when p_mode = 'add' then p_amount else -p_amount end
   where id = c.id returning * into c;
  insert into public.clan_xp_log (clan_id, delta, kind, note, by_user)
  values (c.id, 0, 'dev', 'XP clan ' || case when p_mode = 'add' then '+' else '-' end || p_amount || ' oleh developer', auth.uid());
  return public.clan_total_xp(c.id);
end; $$;
revoke all on function public.dev_clan_total_xp_adjust(bigint, bigint, text) from public, anon;
grant execute on function public.dev_clan_total_xp_adjust(bigint, bigint, text) to authenticated;
