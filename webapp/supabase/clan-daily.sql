-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan SETELAH wakugames-clan.sql, clan-v2.sql, blokir.sql, keamanan-6-panel-developer.sql.
-- (Kalau kamu menjalankan keamanan-8-audit.sql, jalankan ulang file itu PALING AKHIR.)
--
-- FITUR: Daily Clan -> klaim WakuGold gratis tiap 24 jam oleh setiap anggota clan.
--
-- ATURAN KETAT (semua dicek di SERVER, bukan di aplikasi):
--  1. Hanya anggota clan yang masih aktif (clan tidak bubar) yang bisa klaim.
--  2. Waktu pakai jam SERVER (now()). Mengubah jam HP tidak berpengaruh.
--  3. Baru masuk clan  -> harus menunggu 24 jam sejak waktu masuk.
--  4. Setelah klaim    -> harus menunggu 24 jam lagi, begitu seterusnya.
--  5. Timer melekat ke USER, bukan ke clan: keluar lalu masuk clan lain / masuk lagi TIDAK mereset timer.
--     Waktu siap = yang TERLAMBAT antara (waktu masuk clan) dan (klaim terakhir), lalu + 24 jam.
--  6. Hadiah dihitung dari LEVEL CLAN saat klaim: level kecil = Gold sedikit, level besar = Gold banyak.
--  7. Klik ganda / kirim ulang / dua perangkat sekaligus: hanya 1 klaim yang berhasil (kunci per user + id permintaan).
--  8. Akun yang diblokir tidak bisa klaim.
--  9. Developer bisa matikan fitur, ubah jam tunggu, ubah tabel hadiah, dan reset timer satu clan (Panel Developer -> Clan).
--
-- Catatan: anggota yang SUDAH ada di clan sebelum SQL ini dijalankan langsung bisa klaim pertama kali
-- (waktu masuk mereka sudah lewat dari 24 jam). Setelah itu timer 24 jam berlaku untuk semua.

-- ============================================================ 1) KONFIGURASI & TABEL
insert into public.clan_config (key, value) values
  ('daily_enabled', 1),      -- 1 = aktif, 0 = dimatikan
  ('daily_hours', 24)        -- jam tunggu antar klaim (1 sampai 720)
on conflict (key) do nothing;

-- Tabel hadiah: "mulai dari level X, hadiahnya Y Gold" (berlaku sampai level berikutnya dalam tabel)
create table if not exists public.clan_daily_rewards (
  min_level int primary key check (min_level between 1 and 100000),
  gold      bigint not null check (gold between 0 and 10000000)
);
-- Isi awal HANYA kalau tabel masih kosong (tidak menimpa hasil edit developer saat SQL dijalankan ulang).
-- Level 1-5 = 50, level 6-11 = 100 (sesuai permintaan). Tingkat berikutnya: pola yang melebar +50 Gold, bisa diubah di Panel Developer.
insert into public.clan_daily_rewards (min_level, gold)
select v.l, v.g from (values (1, 50), (6, 100), (12, 150), (19, 200), (27, 250), (36, 300), (46, 350), (57, 400), (69, 450), (82, 500), (96, 550)) as v(l, g)
 where not exists (select 1 from public.clan_daily_rewards);

-- Klaim terakhir per USER (bukan per clan)
create table if not exists public.clan_daily_claims (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  last_claim_at timestamptz,
  total_claims  int not null default 0,
  total_gold    bigint not null default 0,
  force_ready   boolean not null default false      -- dipasang developer: klaim berikutnya boleh langsung (sekali pakai)
);

-- Riwayat klaim (audit)
create table if not exists public.clan_daily_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  clan_id    bigint,
  clan_level int not null,
  gold       bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists clan_daily_log_user on public.clan_daily_log (user_id, created_at desc);

do $$ declare t text; begin
  foreach t in array array['clan_daily_rewards', 'clan_daily_claims', 'clan_daily_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ============================================================ 2) FUNGSI INTERNAL
create or replace function public.clan_daily_reward_for(p_level int) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce((select gold from public.clan_daily_rewards where min_level <= greatest(p_level, 1) order by min_level desc limit 1), 0)
$$;

-- Hitung status daily seorang user (satu-satunya sumber kebenaran, dipakai status & klaim)
create or replace function public.clan_daily_calc(p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  en boolean := coalesce(public.clan_cfg('daily_enabled'), 1) >= 1;
  hrs int := least(greatest(coalesce(public.clan_cfg('daily_hours'), 24)::int, 1), 720);
  cid bigint; m public.clan_members; last_at timestamptz; frc boolean; tc int; lv int; reward bigint; ready timestamptz; rem int;
  nl int; ng bigint;
begin
  cid := public.clan_my_id(p_uid);
  if cid is null then return jsonb_build_object('enabled', en, 'in_clan', false, 'hours', hrs); end if;
  select * into m from public.clan_members where user_id = p_uid;
  select last_claim_at, force_ready, total_claims into last_at, frc, tc from public.clan_daily_claims where user_id = p_uid;
  lv := public.clan_level(public.clan_total_xp(cid));
  reward := public.clan_daily_reward_for(lv);
  ready := greatest(m.joined_at, coalesce(last_at, m.joined_at)) + make_interval(hours => hrs);
  if coalesce(frc, false) then ready := now(); end if;
  rem := greatest(0, ceil(extract(epoch from (ready - now()))))::int;
  select min_level, gold into nl, ng from public.clan_daily_rewards where min_level > lv and gold > reward order by min_level limit 1;
  return jsonb_build_object(
    'enabled', en, 'in_clan', true, 'clan_id', cid, 'level', lv, 'reward', reward, 'hours', hrs,
    'remaining', rem, 'can_claim', en and rem = 0 and reward > 0, 'total_claims', coalesce(tc, 0),
    'next_level', nl, 'next_reward', ng,
    'tiers', (select coalesce(jsonb_agg(jsonb_build_object('min_level', r.min_level, 'gold', r.gold) order by r.min_level), '[]'::jsonb) from public.clan_daily_rewards r));
end; $$;

revoke all on function public.clan_daily_reward_for(int), public.clan_daily_calc(uuid) from public, anon, authenticated;

-- ============================================================ 3) FUNGSI UNTUK APLIKASI
create or replace function public.clan_daily_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return public.clan_daily_calc(auth.uid());
end; $$;
revoke all on function public.clan_daily_status() from public, anon;
grant execute on function public.clan_daily_status() to authenticated;

create or replace function public.clan_daily_claim(p_req uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; s jsonb; reward bigint; lv int; cid bigint; g bigint;
begin
  me := public.clan_op_begin(p_req);                       -- kunci per user + anti kirim ulang
  if public.is_banned(me) then raise exception 'Akunmu sedang diblokir'; end if;
  s := public.clan_daily_calc(me);                         -- dihitung SETELAH kunci: klaim ganda pasti melihat hasil klaim pertama
  if not (s->>'enabled')::boolean then raise exception 'Daily Clan sedang dinonaktifkan'; end if;
  if not (s->>'in_clan')::boolean then raise exception 'Kamu belum punya clan'; end if;
  if (s->>'remaining')::int > 0 then raise exception 'Daily Clan belum siap, tunggu timernya selesai'; end if;
  reward := (s->>'reward')::bigint; lv := (s->>'level')::int; cid := (s->>'clan_id')::bigint;
  if reward <= 0 then raise exception 'Hadiah daily untuk level clan ini belum diatur'; end if;

  insert into public.clan_daily_claims (user_id, last_claim_at, total_claims, total_gold, force_ready)
  values (me, now(), 1, reward, false)
  on conflict (user_id) do update
    set last_claim_at = now(), total_claims = public.clan_daily_claims.total_claims + 1,
        total_gold = public.clan_daily_claims.total_gold + reward, force_ready = false;

  insert into public.wallets (user_id) values (me) on conflict do nothing;
  update public.wallets set gold = gold + reward, updated_at = now() where user_id = me and gold + reward <= 1000000000000 returning gold into g;
  if g is null then raise exception 'Saldo WakuGold terlalu besar'; end if;
  insert into public.gold_ledger (user_id, delta, reason) values (me, reward, 'clan_daily');
  insert into public.clan_daily_log (user_id, clan_id, clan_level, gold) values (me, cid, lv, reward);

  return jsonb_build_object('gold', reward, 'balance', g, 'status', public.clan_daily_calc(me));
end; $$;
revoke all on function public.clan_daily_claim(uuid) from public, anon;
grant execute on function public.clan_daily_claim(uuid) to authenticated;

-- ============================================================ 4) PANEL DEVELOPER
create or replace function public.dev_clan_daily_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  return jsonb_build_object(
    'enabled', coalesce(public.clan_cfg('daily_enabled'), 1) >= 1,
    'hours', least(greatest(coalesce(public.clan_cfg('daily_hours'), 24)::int, 1), 720),
    'tiers', (select coalesce(jsonb_agg(jsonb_build_object('min_level', r.min_level, 'gold', r.gold) order by r.min_level), '[]'::jsonb) from public.clan_daily_rewards r),
    'claims_today', (select count(*) from public.clan_daily_log where created_at > now() - interval '24 hours'),
    'gold_today', (select coalesce(sum(gold), 0) from public.clan_daily_log where created_at > now() - interval '24 hours'));
end; $$;
revoke all on function public.dev_clan_daily_get() from public, anon;
grant execute on function public.dev_clan_daily_get() to authenticated;

-- Simpan pengaturan: aktif/nonaktif, jam tunggu, dan seluruh tabel hadiah (menggantikan tabel lama secara atomik)
create or replace function public.dev_clan_daily_save(p_enabled boolean, p_hours int, p_tiers jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 720 then raise exception 'Jam tunggu harus 1 sampai 720'; end if;
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' then raise exception 'Tabel hadiah tidak valid'; end if;
  n := jsonb_array_length(p_tiers);
  if n < 1 or n > 40 then raise exception 'Tabel hadiah harus 1 sampai 40 baris'; end if;
  if exists (select 1 from jsonb_to_recordset(p_tiers) as t(min_level int, gold bigint)
              where t.min_level is null or t.gold is null or t.min_level < 1 or t.min_level > 100000 or t.gold < 0 or t.gold > 10000000) then
    raise exception 'Level 1-100000 dan Gold 0-10.000.000';
  end if;
  if (select count(distinct t.min_level) from jsonb_to_recordset(p_tiers) as t(min_level int, gold bigint)) <> n then
    raise exception 'Level awal tidak boleh kembar';
  end if;
  if not exists (select 1 from jsonb_to_recordset(p_tiers) as t(min_level int, gold bigint) where t.min_level = 1) then
    raise exception 'Harus ada baris yang mulai dari level 1';
  end if;
  delete from public.clan_daily_rewards where true;
  insert into public.clan_daily_rewards (min_level, gold) select t.min_level, t.gold from jsonb_to_recordset(p_tiers) as t(min_level int, gold bigint);
  insert into public.clan_config (key, value) values ('daily_enabled', case when p_enabled then 1 else 0 end), ('daily_hours', p_hours)
  on conflict (key) do update set value = excluded.value;
end; $$;
revoke all on function public.dev_clan_daily_save(boolean, int, jsonb) from public, anon;
grant execute on function public.dev_clan_daily_save(boolean, int, jsonb) to authenticated;

-- Reset timer semua anggota satu clan: mereka boleh klaim SEKALI langsung (untuk uji coba / kompensasi)
create or replace function public.dev_clan_daily_reset(p_clan bigint) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if not exists (select 1 from public.clans where id = p_clan and disbanded_at is null) then raise exception 'Clan tidak ditemukan'; end if;
  insert into public.clan_daily_claims (user_id, force_ready)
  select m.user_id, true from public.clan_members m where m.clan_id = p_clan
  on conflict (user_id) do update set force_ready = true;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function public.dev_clan_daily_reset(bigint) from public, anon;
grant execute on function public.dev_clan_daily_reset(bigint) to authenticated;
