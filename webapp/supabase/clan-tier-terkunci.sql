-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan SETELAH clan-dev-xp-tier15.sql.
--
-- TUJUAN: harga & kenaikan tier clan TIDAK bisa diubah dari APK / client, sekalipun APK dibongkar.
-- Dasarnya: harga dibaca & dipotong 100% di server (fungsi security definer). APK hanya MENAMPILKAN harga.
-- File ini menambah 4 lapis penjagaan:
--   1) semua tabel clan dikunci ulang (RLS aktif + hak akses anon/authenticated dicabut)
--   2) harga tier (tier_cost_*) dikunci: tidak bisa di-UPDATE / DELETE oleh siapa pun lewat jalur biasa
--   3) kolom clans.tier hanya bisa berubah lewat 2 fungsi resmi: naik tier (+1, bayar XPGold) & set tier developer
--   4) jumlah XP / XPGold clan tidak bisa diubah langsung dari client (cek audit di bagian paling bawah)

-- ============================================================ 1) KUNCI ULANG TABEL
do $$ declare t text; begin
  foreach t in array array['clan_config','wallets','gold_ledger','clan_colors','clans','clan_members','clan_requests','clan_donations','clan_xp_log','clan_color_owned','clan_ops'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ============================================================ 2) HARGA TIER DIKUNCI
create or replace function public.clan_config_guard() returns trigger
language plpgsql as $$
begin
  if (tg_op = 'DELETE' and old.key like 'tier\_cost\_%' escape '\')
     or (tg_op = 'UPDATE' and (old.key like 'tier\_cost\_%' escape '\') and (new.key is distinct from old.key or new.value is distinct from old.value)) then
    raise exception 'Harga tier dikunci';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end; $$;
drop trigger if exists clan_config_guard on public.clan_config;
create trigger clan_config_guard before update or delete on public.clan_config
  for each row execute function public.clan_config_guard();
-- Mau MENGUBAH harga sendiri (hanya kamu sebagai pemilik database):
--   alter table public.clan_config disable trigger clan_config_guard;
--   update public.clan_config set value = 800000 where key = 'tier_cost_11';
--   alter table public.clan_config enable trigger clan_config_guard;

-- ============================================================ 3) KOLOM TIER HANYA LEWAT FUNGSI RESMI
create or replace function public.clans_tier_guard() returns trigger
language plpgsql as $$
declare mode text := current_setting('wp.tier_change', true);
begin
  if new.tier is distinct from old.tier then
    if mode = '2' then null;                                         -- set tier oleh developer (fungsi dev_clan_set_tier)
    elsif mode = '1' and new.tier = old.tier + 1 then null;          -- naik tier +1 dengan bayar (fungsi clan_upgrade_tier)
    else raise exception 'Tier hanya bisa diubah lewat Upgrade Tier'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists clans_tier_guard on public.clans;
create trigger clans_tier_guard before update on public.clans
  for each row execute function public.clans_tier_guard();

-- Naik tier: harga dibaca di server, XPGold dipotong di server, tier hanya +1
create or replace function public.clan_upgrade_tier(p_req uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; c public.clans; cost bigint;
begin
  me := public.clan_op_begin(p_req);
  c := public.clan_lock_as_leader(me);
  if c.tier >= 15 then raise exception 'Tier sudah maksimal'; end if;
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

-- Set tier bebas: hanya developer
create or replace function public.dev_clan_set_tier(p_clan bigint, p_tier int) returns int
language plpgsql security definer set search_path = public as $$
declare c public.clans;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_tier is null or p_tier < 1 or p_tier > 15 then raise exception 'Tier 1 sampai 15'; end if;
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

-- ============================================================ 4) AUDIT (opsional, jalankan terpisah)
-- Hasil harus KOSONG. Kalau ada baris, berarti ada tabel clan yang masih terbuka untuk client:
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and grantee in ('anon', 'authenticated')
--      and table_name in ('clan_config','wallets','gold_ledger','clan_colors','clans','clan_members','clan_requests','clan_donations','clan_xp_log','clan_color_owned','clan_ops');
-- Tes cepat harga tidak bisa diubah (harus error "Harga tier dikunci"):
--   update public.clan_config set value = 1 where key = 'tier_cost_11';
