-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan SETELAH clan-xp-hanya-gold.sql dan clan-v2.sql.
-- Isi: (1) tier clan jadi 15 (tier 11-15 + harga), (2) Panel Developer bisa tambah/kurangi XP clan (Top Clans).

-- ============================================================ TIER BADGE 11-15
alter table public.clans drop constraint if exists clans_tier_check;
alter table public.clans add constraint clans_tier_check check (tier between 1 and 15);

insert into public.clan_config (key, value) values
  ('tier_cost_11', 700000),    -- biaya naik ke tier 11..15 (XPGold), bisa diubah
  ('tier_cost_12', 1200000),
  ('tier_cost_13', 2000000),
  ('tier_cost_14', 3500000),
  ('tier_cost_15', 6000000)
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
