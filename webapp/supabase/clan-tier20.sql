-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan PALING AKHIR, setelah clan-dev-xp-tier15.sql, clan-tier-terkunci.sql, dan clan-role.sql.
--
-- Isi: tier badge clan naik dari 15 jadi 20 (tier 16 Laurel, 17 Aurora, 18 Mecha, 19 Thorn, 20 Zenith).
-- ATURAN KETAT (tetap sama seperti tier 1-15, tidak ada jalur lain):
--   1) clans.tier hanya boleh 1..20 (CHECK di database, bukan cuma di aplikasi)
--   2) naik tier tetap SATU tingkat per bayar (trigger clans_tier_guard dari clan-tier-terkunci.sql tidak diubah)
--   3) harga dibaca & dipotong di server; tier_cost_16..20 ikut terkunci oleh trigger clan_config_guard (tidak bisa di-UPDATE / DELETE)
--   4) set tier bebas hanya untuk developer, dibatasi 1..20

-- ============================================================ 1) BATAS TIER 20
alter table public.clans drop constraint if exists clans_tier_check;
alter table public.clans add constraint clans_tier_check check (tier between 1 and 20);

-- ============================================================ 2) HARGA TIER 16-20 (XPGold). Insert saja: kalau sudah ada, tidak ditimpa
insert into public.clan_config (key, value) values
  ('tier_cost_16', 9000000),
  ('tier_cost_17', 13000000),
  ('tier_cost_18', 19000000),
  ('tier_cost_19', 28000000),
  ('tier_cost_20', 40000000)
on conflict (key) do nothing;

-- ============================================================ 3) NAIK TIER (maks 20)
create or replace function public.clan_upgrade_tier(p_req uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; c public.clans; cost bigint;
begin
  me := public.clan_op_begin(p_req);
  c := public.clan_lock_as_leader(me);
  if c.tier >= 20 then raise exception 'Tier sudah maksimal'; end if;
  cost := public.clan_cfg('tier_cost_' || (c.tier + 1))::bigint;
  if cost is null or cost < 1 then raise exception 'Harga tier belum diatur'; end if;
  if c.xp_available < cost then raise exception 'XPGold belum cukup'; end if;
  perform set_config('wp.tier_change', '1', true);
  update public.clans set xp_available = xp_available - cost, tier = tier + 1 where id = c.id returning * into c;
  perform set_config('wp.tier_change', '', true);
  insert into public.clan_xp_log (clan_id, delta, kind, note, by_user) values (c.id, -cost, 'tier', 'Naik ke tier ' || c.tier, me);
  return jsonb_build_object('tier', c.tier, 'xp_available', c.xp_available);
end; $$;
revoke all on function public.clan_upgrade_tier(uuid) from public, anon;
grant execute on function public.clan_upgrade_tier(uuid) to authenticated;

-- ============================================================ 4) SET TIER BEBAS (developer, 1..20)
create or replace function public.dev_clan_set_tier(p_clan bigint, p_tier int) returns int
language plpgsql security definer set search_path = public as $$
declare c public.clans;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_tier is null or p_tier < 1 or p_tier > 20 then raise exception 'Tier 1 sampai 20'; end if;
  select * into c from public.clans where id = p_clan and disbanded_at is null for update;
  if not found then raise exception 'Clan tidak ditemukan'; end if;
  perform set_config('wp.tier_change', '2', true);
  update public.clans set tier = p_tier where id = c.id;
  perform set_config('wp.tier_change', '', true);
  insert into public.clan_xp_log (clan_id, delta, kind, note, by_user) values (c.id, 0, 'dev', 'Tier diatur ke ' || p_tier || ' oleh developer', auth.uid());
  return p_tier;
end; $$;
revoke all on function public.dev_clan_set_tier(bigint, int) from public, anon;
grant execute on function public.dev_clan_set_tier(bigint, int) to authenticated;

-- ============================================================ CEK (opsional, jalankan terpisah)
-- Harus menampilkan 19 baris harga (tier_cost_2 .. tier_cost_20):
--   select key, value from public.clan_config where key like 'tier\_cost\_%' escape '\' order by length(key), key;
-- Harus ERROR "Harga tier dikunci":
--   update public.clan_config set value = 1 where key = 'tier_cost_20';
