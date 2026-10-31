-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan SETELAH schema.sql, level-xp.sql, profil-publik.sql, teman-chat.sql (butuh wp_name, user_xp, profiles).
-- Fitur: WakuGold (dompet), Clan WakuGames, Setor Gold -> XPGold, Shop Clan (slot, tier badge, gacha warna), badge clan.
-- SEMUA tabel terkunci (tidak bisa diakses langsung dari aplikasi). Semua perubahan lewat fungsi server di bawah.

-- ============================================================ 1) KONFIGURASI (mudah diubah developer)
create table if not exists public.clan_config (key text primary key, value numeric not null);
insert into public.clan_config (key, value) values
  ('create_cost', 3500),          -- biaya buat clan (WakuGold)
  ('base_slots', 30),             -- kapasitas awal
  ('slot_step', 5),               -- tambahan per upgrade
  ('slot_cost', 1000),            -- biaya upgrade slot (XPGold)
  ('max_slots', 100),             -- kapasitas maksimal
  ('donate_gold_per_xp', 1),      -- TARIF SETOR: berapa WakuGold untuk 1 XPGold (1 = 1:1)
  ('donate_min', 10),             -- minimal sekali setor (WakuGold)
  ('tier_cost_2', 1500),          -- biaya naik ke tier 2 (XPGold)
  ('tier_cost_3', 4000),
  ('tier_cost_4', 9000),
  ('tier_cost_5', 20000),
  ('spin_cost', 300),             -- biaya 1x spin warna (XPGold)
  ('spin_dup_refund_pct', 20),    -- warna kembar: XPGold kembali (%)
  ('odds_common', 60),           -- peluang spin (bobot, total tidak harus 100)
  ('odds_rare', 28),
  ('odds_legend', 10),
  ('odds_mythic', 2)
on conflict (key) do nothing;

-- ============================================================ 2) TABEL
create table if not exists public.wallets (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  gold       bigint not null default 0 check (gold >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.gold_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta bigint not null, reason text not null, created_at timestamptz not null default now()
);
create index if not exists gold_ledger_user on public.gold_ledger (user_id, created_at desc);

create table if not exists public.clan_colors (
  id serial primary key, name text not null unique,
  rarity text not null check (rarity in ('common', 'rare', 'legend', 'mythic')),
  c1 text not null, c2 text not null, c3 text
);

create table if not exists public.clans (
  id           bigint generated always as identity primary key,
  tag          text not null,
  name         text not null,
  leader       uuid not null,
  slots        int not null default 30,
  tier         int not null default 1 check (tier between 1 and 5),
  color_id     int references public.clan_colors(id),
  join_mode    text not null default 'open' check (join_mode in ('open', 'request')),
  xp_available bigint not null default 0 check (xp_available >= 0),   -- XPGold (bisa dibelanjakan)
  bank_total   bigint not null default 0,                               -- total XPGold yang pernah disetor (tidak pernah berkurang)
  legacy_xp    numeric not null default 0,                              -- XP dari anggota yang sudah keluar
  created_at   timestamptz not null default now(),
  disbanded_at timestamptz
);
create unique index if not exists clans_tag_active on public.clans (upper(tag)) where disbanded_at is null;
create unique index if not exists clans_name_active on public.clans (lower(name)) where disbanded_at is null;

create table if not exists public.clan_members (
  clan_id     bigint not null references public.clans(id),
  user_id     uuid primary key references auth.users(id) on delete cascade,   -- 1 user = 1 clan
  role        text not null default 'member' check (role in ('leader', 'member')),
  xp_base     numeric not null default 0,
  donated_gold bigint not null default 0,
  donated_xp  bigint not null default 0,
  joined_at   timestamptz not null default now()
);
create index if not exists clan_members_clan on public.clan_members (clan_id);

create table if not exists public.clan_requests (
  id bigint generated always as identity primary key,
  clan_id bigint not null references public.clans(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists clan_requests_pair on public.clan_requests (clan_id, user_id);

create table if not exists public.clan_donations (
  id bigint generated always as identity primary key,
  clan_id bigint not null references public.clans(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  gold bigint not null, xp bigint not null, created_at timestamptz not null default now()
);
create index if not exists clan_donations_clan on public.clan_donations (clan_id, created_at desc);

create table if not exists public.clan_xp_log (          -- riwayat XPGold & upgrade
  id bigint generated always as identity primary key,
  clan_id bigint not null references public.clans(id),
  delta bigint not null, kind text not null, note text, by_user uuid, created_at timestamptz not null default now()
);
create index if not exists clan_xp_log_clan on public.clan_xp_log (clan_id, created_at desc);

create table if not exists public.clan_color_owned (
  clan_id bigint not null references public.clans(id), color_id int not null references public.clan_colors(id),
  obtained_at timestamptz not null default now(), primary key (clan_id, color_id)
);
create table if not exists public.clan_ops (             -- kunci anti klik ganda / permintaan ulang
  request_id uuid primary key, user_id uuid not null, created_at timestamptz not null default now()
);

-- kunci semua tabel
do $$ declare t text; begin
  foreach t in array array['clan_config','wallets','gold_ledger','clan_colors','clans','clan_members','clan_requests','clan_donations','clan_xp_log','clan_color_owned','clan_ops'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ============================================================ 3) DATA WARNA (gacha)
insert into public.clan_colors (name, rarity, c1, c2, c3) values
  ('Putih Salju',   'common', '#f4f6fa', '#d9dee8', null),
  ('Abu Kabut',     'common', '#9aa3b2', '#7d8696', null),
  ('Biru Langit',   'common', '#4aa3ff', '#2f7fd6', null),
  ('Hijau Daun',    'common', '#4ccf7a', '#2fa85c', null),
  ('Merah Bata',    'common', '#e0584f', '#b8423a', null),
  ('Oranye Senja',  'common', '#f19a3e', '#d17a22', null),
  ('Kuning Jagung', 'common', '#f0d043', '#c9a91f', null),
  ('Ungu Lavender', 'common', '#a98bff', '#8465e0', null),
  ('Biru Samudra',  'rare', '#1f6bff', '#37d7ff', null),
  ('Hijau Zamrud',  'rare', '#12b76a', '#7ff0b0', null),
  ('Merah Delima',  'rare', '#e11d48', '#ff7a8a', null),
  ('Ungu Aurora',   'rare', '#7c3aed', '#c084fc', null),
  ('Oranye Magma',  'rare', '#f97316', '#fbbf24', null),
  ('Teal Lagoon',   'rare', '#0d9488', '#5eead4', null),
  ('Emas Kerajaan', 'legend', '#f5b50a', '#fff1a8', null),
  ('Pink Sakura',   'legend', '#ff5fa2', '#ffd1e6', null),
  ('Cyan Nebula',   'legend', '#00d4ff', '#7b61ff', null),
  ('Api Merah',     'legend', '#ff3d00', '#ffb300', null),
  ('Giok Naga',     'legend', '#00c78c', '#d4ff5a', null),
  ('Galaksi',       'mythic', '#7b2ff7', '#00e5ff', '#ff5fd2'),
  ('Solar Flare',   'mythic', '#ff6a00', '#ffd000', '#fff2a0'),
  ('Aurora Kosmik', 'mythic', '#00ffa3', '#7b61ff', '#ff5fd2'),
  ('Void Horizon',  'mythic', '#1a0b3a', '#8a5cff', '#00e5ff'),
  ('Prisma',        'mythic', '#ff4d6d', '#ffd60a', '#4dd6ff')
on conflict (name) do nothing;

-- ============================================================ 4) FUNGSI INTERNAL (tidak bisa dipanggil dari aplikasi)
create or replace function public.clan_cfg(p_key text) returns numeric
language sql stable security definer set search_path = public as $$ select value from public.clan_config where key = p_key $$;

create or replace function public.clan_level(p_xp numeric) returns int
language sql immutable as $$ select greatest(1, floor((1 + sqrt(1 + greatest(p_xp, 0) / 12.5)) / 2))::int $$;

create or replace function public.clan_total_xp(p_clan bigint) returns numeric
language sql stable security definer set search_path = public as $$
  -- XP clan HANYA dari setoran WakuGold (bank_total). XP nonton anggota TIDAK ikut dihitung.
  select c.bank_total::numeric from public.clans c where c.id = p_clan;
$$;

create or replace function public.clan_color_json(p_id int) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when p_id is null then null else (select jsonb_build_object('id', id, 'name', name, 'rarity', rarity, 'c1', c1, 'c2', c2, 'c3', c3) from public.clan_colors where id = p_id) end
$$;

-- mulai operasi: kunci per user + kunci anti-ulang (request_id harus unik)
create or replace function public.clan_op_begin(p_req uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_req is null then raise exception 'Permintaan tidak valid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 7));
  insert into public.clan_ops (request_id, user_id) values (p_req, me) on conflict do nothing;
  if not found then raise exception 'Permintaan sudah diproses'; end if;
  delete from public.clan_ops where created_at < now() - interval '2 days';
  return me;
end; $$;

create or replace function public.wallet_debit(p_uid uuid, p_amount bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_amount <= 0 then raise exception 'Jumlah tidak valid'; end if;
  insert into public.wallets (user_id) values (p_uid) on conflict do nothing;
  update public.wallets set gold = gold - p_amount, updated_at = now() where user_id = p_uid and gold >= p_amount;
  if not found then raise exception 'WakuGold tidak cukup'; end if;
  insert into public.gold_ledger (user_id, delta, reason) values (p_uid, -p_amount, p_reason);
end; $$;

create or replace function public.clan_my_id(p_uid uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select m.clan_id from public.clan_members m join public.clans c on c.id = m.clan_id where m.user_id = p_uid and c.disbanded_at is null
$$;

-- pastikan caller adalah Leader clan-nya; mengunci baris clan
create or replace function public.clan_lock_as_leader(p_uid uuid) returns public.clans
language plpgsql security definer set search_path = public as $$
declare c public.clans; cid bigint := public.clan_my_id(p_uid);
begin
  if cid is null then raise exception 'Kamu belum punya clan'; end if;
  select * into c from public.clans where id = cid for update;
  if c.leader is distinct from p_uid then raise exception 'Hanya Leader yang bisa melakukan ini'; end if;
  return c;
end; $$;

create or replace function public.clan_add_member(p_clan bigint, p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.clans; n int;
begin
  select * into c from public.clans where id = p_clan and disbanded_at is null for update;
  if not found then raise exception 'Clan tidak ditemukan'; end if;
  if exists (select 1 from public.clan_members m join public.clans k on k.id = m.clan_id where m.user_id = p_uid and k.disbanded_at is null) then raise exception 'Sudah tergabung di clan lain'; end if;
  select count(*) into n from public.clan_members where clan_id = p_clan;
  if n >= c.slots then raise exception 'Clan sudah penuh'; end if;
  delete from public.clan_members where user_id = p_uid;      -- sisa data clan yang sudah bubar
  insert into public.clan_members (clan_id, user_id, role, xp_base)
  values (p_clan, p_uid, 'member', coalesce((select xp from public.user_xp where user_id = p_uid), 0));
  delete from public.clan_requests where user_id = p_uid;
end; $$;

create or replace function public.clan_remove_member(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m public.clan_members; x numeric;
begin
  select * into m from public.clan_members where user_id = p_uid for update;
  if not found then return; end if;
  select coalesce(xp, 0) into x from public.user_xp where user_id = p_uid;
  -- XP clan hanya dari setoran Gold (bank_total), jadi tidak ada XP nonton yang perlu disimpan saat anggota keluar
  delete from public.clan_members where user_id = p_uid;
end; $$;

revoke all on function public.clan_cfg(text), public.clan_level(numeric), public.clan_total_xp(bigint), public.clan_color_json(int),
  public.clan_op_begin(uuid), public.wallet_debit(uuid, bigint, text), public.clan_my_id(uuid), public.clan_lock_as_leader(uuid),
  public.clan_add_member(bigint, uuid), public.clan_remove_member(uuid) from public, anon, authenticated;

-- ============================================================ 5) DOMPET (WakuGold)
create or replace function public.wp_gold() returns bigint
language plpgsql security definer set search_path = public as $$
declare g bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.wallets (user_id) values (auth.uid()) on conflict do nothing;
  select gold into g from public.wallets where user_id = auth.uid();
  return g;
end; $$;
revoke all on function public.wp_gold() from public, anon;
grant execute on function public.wp_gold() to authenticated;

-- Beri WakuGold (untuk developer / pengujian). Dari SQL Editor:  select public.gold_grant(3, 10000);   -- 3 = ID user (#3)
create or replace function public.gold_grant(p_seq bigint, p_amount bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare u uuid; g bigint;
begin
  if auth.uid() is not null and not exists (select 1 from public.profiles where user_id = auth.uid() and role = 'developer') then raise exception 'Hanya developer'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 then raise exception 'Jumlah tidak valid'; end if;
  select user_id into u from public.profiles where seq = p_seq;
  if u is null then raise exception 'User tidak ditemukan'; end if;
  insert into public.wallets (user_id) values (u) on conflict do nothing;
  update public.wallets set gold = gold + p_amount, updated_at = now() where user_id = u returning gold into g;
  insert into public.gold_ledger (user_id, delta, reason) values (u, p_amount, 'grant');
  return g;
end; $$;
revoke all on function public.gold_grant(bigint, bigint) from public, anon;
grant execute on function public.gold_grant(bigint, bigint) to authenticated;

-- ============================================================ 6) BACA DATA
create or replace function public.clan_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); cid bigint; g bigint;
begin
  if me is null then raise exception 'not authenticated'; end if;
  cid := public.clan_my_id(me);
  select gold into g from public.wallets where user_id = me;
  return jsonb_build_object(
    'gold', coalesce(g, 0), 'clan_id', cid,
    'role', (select role from public.clan_members where user_id = me),
    'clan', (select jsonb_build_object('id', c.id, 'tag', c.tag, 'name', c.name) from public.clans c where c.id = cid),
    'config', (select jsonb_object_agg(key, value) from public.clan_config));
end; $$;
revoke all on function public.clan_overview() from public, anon;
grant execute on function public.clan_overview() to authenticated;

create or replace function public.clan_top(p_q text default null, p_limit int default 50)
returns table (rk bigint, id bigint, tag text, name text, tier int, c1 text, c2 text, c3 text, rarity text, level int, members int, slots int, total_xp numeric, join_mode text)
language sql stable security definer set search_path = public as $$
  with t as (
    select c.*, public.clan_total_xp(c.id) tx, (select count(*)::int from public.clan_members m where m.clan_id = c.id) mc
      from public.clans c where c.disbanded_at is null),
  r as (select t.*, row_number() over (order by tx desc, created_at asc, id asc) pos from t)
  select r.pos, r.id, r.tag, r.name, r.tier, col.c1, col.c2, col.c3, col.rarity, public.clan_level(r.tx), r.mc, r.slots, r.tx, r.join_mode
    from r left join public.clan_colors col on col.id = r.color_id
   where auth.uid() is not null
     and (p_q is null or btrim(p_q) = '' or position(lower(btrim(p_q)) in lower(r.tag)) > 0 or position(lower(btrim(p_q)) in lower(r.name)) > 0)
   order by r.pos limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;
revoke all on function public.clan_top(text, int) from public, anon;
grant execute on function public.clan_top(text, int) to authenticated;

create or replace function public.clan_detail(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.clans; tx numeric; lv int; n int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into c from public.clans where id = p_id and disbanded_at is null;
  if not found then return null; end if;
  tx := public.clan_total_xp(c.id); lv := public.clan_level(tx);
  select count(*) into n from public.clan_members where clan_id = c.id;
  return jsonb_build_object(
    'id', c.id, 'tag', c.tag, 'name', c.name, 'tier', c.tier, 'color', public.clan_color_json(c.color_id),
    'slots', c.slots, 'members', n, 'xp_available', c.xp_available, 'total_xp', tx,
    'level', lv, 'lvl_start', 50 * lv * (lv - 1), 'lvl_next', 50 * (lv + 1) * lv, 'join_mode', c.join_mode, 'leader', c.leader,
    'my_role', (select role from public.clan_members where clan_id = c.id and user_id = me),
    'my_clan', public.clan_my_id(me),
    'my_request', exists (select 1 from public.clan_requests where clan_id = c.id and user_id = me),
    'pending', case when c.leader = me then (select count(*) from public.clan_requests where clan_id = c.id) else 0 end);
end; $$;
revoke all on function public.clan_detail(bigint) from public, anon;
grant execute on function public.clan_detail(bigint) to authenticated;

create or replace function public.clan_members_list(p_clan bigint, p_q text default null)
returns table (user_id uuid, name text, avatar text, seq bigint, role text, xp numeric, contrib numeric, donated_gold bigint, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, public.wp_name(m.user_id), u.raw_user_meta_data->>'avatar_url', p.seq, m.role,
         coalesce(x.xp, 0), m.donated_xp::numeric, m.donated_gold, m.joined_at
    from public.clan_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    left join public.user_xp x on x.user_id = m.user_id
   where auth.uid() is not null and m.clan_id = p_clan
     and (p_q is null or btrim(p_q) = ''
          or position(lower(btrim(p_q)) in lower(public.wp_name(m.user_id))) > 0
          or p.seq::text = regexp_replace(btrim(p_q), '^#', ''))
   order by (m.role = 'leader') desc, 7 desc, m.joined_at asc
   limit 200;
$$;
revoke all on function public.clan_members_list(bigint, text) from public, anon;
grant execute on function public.clan_members_list(bigint, text) to authenticated;

create or replace function public.clan_donations_list(p_clan bigint, p_limit int default 50)
returns table (id bigint, user_id uuid, name text, avatar text, gold bigint, xp bigint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.user_id, public.wp_name(d.user_id), u.raw_user_meta_data->>'avatar_url', d.gold, d.xp, d.created_at
    from public.clan_donations d join auth.users u on u.id = d.user_id
   where auth.uid() is not null and d.clan_id = p_clan order by d.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;
revoke all on function public.clan_donations_list(bigint, int) from public, anon;
grant execute on function public.clan_donations_list(bigint, int) to authenticated;

create or replace function public.clan_requests_list(p_clan bigint)
returns table (id bigint, user_id uuid, name text, avatar text, seq bigint, xp numeric, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.user_id, public.wp_name(r.user_id), u.raw_user_meta_data->>'avatar_url', p.seq, coalesce(x.xp, 0), r.created_at
    from public.clan_requests r
    join public.clans c on c.id = r.clan_id and c.leader = auth.uid()     -- hanya Leader yang melihat
    join auth.users u on u.id = r.user_id
    left join public.profiles p on p.user_id = r.user_id
    left join public.user_xp x on x.user_id = r.user_id
   where r.clan_id = p_clan order by r.created_at asc limit 100;
$$;
revoke all on function public.clan_requests_list(bigint) from public, anon;
grant execute on function public.clan_requests_list(bigint) to authenticated;

create or replace function public.clan_log_list(p_clan bigint, p_limit int default 30)
returns table (id bigint, delta bigint, kind text, note text, name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.delta, l.kind, l.note, case when l.by_user is null then null else public.wp_name(l.by_user) end, l.created_at
    from public.clan_xp_log l
   where l.clan_id = p_clan and public.clan_my_id(auth.uid()) = p_clan     -- hanya anggota clan itu
   order by l.created_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;
revoke all on function public.clan_log_list(bigint, int) from public, anon;
grant execute on function public.clan_log_list(bigint, int) to authenticated;

create or replace function public.clan_colors_list(p_clan bigint)
returns table (id int, name text, rarity text, c1 text, c2 text, c3 text, owned boolean, selected boolean)
language sql stable security definer set search_path = public as $$
  select k.id, k.name, k.rarity, k.c1, k.c2, k.c3,
         exists (select 1 from public.clan_color_owned o where o.clan_id = p_clan and o.color_id = k.id),
         coalesce((select c.color_id = k.id from public.clans c where c.id = p_clan), false)
    from public.clan_colors k where auth.uid() is not null
   order by case k.rarity when 'mythic' then 4 when 'legend' then 3 when 'rare' then 2 else 1 end desc, k.id;
$$;
revoke all on function public.clan_colors_list(bigint) from public, anon;
grant execute on function public.clan_colors_list(bigint) to authenticated;

-- Badge clan untuk daftar user (komentar, chat, profil). Data selalu dari server.
create or replace function public.clan_badges(p_uids uuid[])
returns table (user_id uuid, clan_id bigint, tag text, tier int, c1 text, c2 text, c3 text, rarity text)
language sql stable security definer set search_path = public as $$
  select m.user_id, c.id, c.tag, c.tier, col.c1, col.c2, col.c3, col.rarity
    from public.clan_members m
    join public.clans c on c.id = m.clan_id and c.disbanded_at is null
    left join public.clan_colors col on col.id = c.color_id
   where auth.uid() is not null and m.user_id = any (p_uids[1:100]);
$$;
revoke all on function public.clan_badges(uuid[]) from public, anon;
grant execute on function public.clan_badges(uuid[]) to authenticated;

-- ============================================================ 7) AKSI (semua divalidasi di server)
create or replace function public.clan_create(p_tag text, p_name text, p_req uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare me uuid; v_tag text := upper(btrim(coalesce(p_tag, ''))); v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')); cid bigint;
begin
  me := public.clan_op_begin(p_req);
  if v_tag !~ '^[A-Z0-9]{2,6}$' then raise exception 'Tag 2-6 huruf/angka (tanpa spasi)'; end if;
  if v_name !~ '^[[:alnum:] _.-]{3,20}$' then raise exception 'Nama 3-20 karakter (huruf, angka, spasi, - _ .)'; end if;
  if public.clan_my_id(me) is not null then raise exception 'Kamu sudah punya clan'; end if;
  if exists (select 1 from public.clans where upper(tag) = v_tag and disbanded_at is null) then raise exception 'Tag sudah dipakai clan lain'; end if;
  if exists (select 1 from public.clans where lower(name) = lower(v_name) and disbanded_at is null) then raise exception 'Nama clan sudah dipakai'; end if;
  perform public.wallet_debit(me, public.clan_cfg('create_cost')::bigint, 'clan_create');
  delete from public.clan_members where user_id = me;
  insert into public.clans (tag, name, leader, slots) values (v_tag, v_name, me, public.clan_cfg('base_slots')::int) returning id into cid;
  insert into public.clan_members (clan_id, user_id, role, xp_base) values (cid, me, 'leader', coalesce((select xp from public.user_xp where user_id = me), 0));
  delete from public.clan_requests where user_id = me;
  return cid;
exception when unique_violation then raise exception 'Tag atau nama sudah dipakai';
end; $$;
revoke all on function public.clan_create(text, text, uuid) from public, anon;
grant execute on function public.clan_create(text, text, uuid) to authenticated;

create or replace function public.clan_join(p_clan bigint, p_req uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid; c public.clans;
begin
  me := public.clan_op_begin(p_req);
  if public.clan_my_id(me) is not null then raise exception 'Kamu sudah tergabung di sebuah clan'; end if;
  select * into c from public.clans where id = p_clan and disbanded_at is null;
  if not found then raise exception 'Clan tidak ditemukan'; end if;
  if c.join_mode = 'open' then
    perform public.clan_add_member(p_clan, me);
    return 'joined';
  end if;
  if (select count(*) from public.clan_requests where user_id = me) >= 5 then raise exception 'Terlalu banyak permintaan yang belum dijawab'; end if;
  insert into public.clan_requests (clan_id, user_id) values (p_clan, me) on conflict do nothing;
  return 'requested';
end; $$;
revoke all on function public.clan_join(bigint, uuid) from public, anon;
grant execute on function public.clan_join(bigint, uuid) to authenticated;

create or replace function public.clan_request_cancel(p_clan bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.clan_requests where clan_id = p_clan and user_id = auth.uid();
end; $$;
revoke all on function public.clan_request_cancel(bigint) from public, anon;
grant execute on function public.clan_request_cancel(bigint) to authenticated;

create or replace function public.clan_request_respond(p_id bigint, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.clans; r public.clan_requests;
begin
  if me is null then raise exception 'not authenticated'; end if;
  c := public.clan_lock_as_leader(me);
  select * into r from public.clan_requests where id = p_id and clan_id = c.id for update;
  if not found then raise exception 'Permintaan tidak ditemukan'; end if;
  if p_accept then
    perform public.clan_add_member(c.id, r.user_id);
  else
    delete from public.clan_requests where id = p_id;
  end if;
end; $$;
revoke all on function public.clan_request_respond(bigint, boolean) from public, anon;
grant execute on function public.clan_request_respond(bigint, boolean) to authenticated;

create or replace function public.clan_set_join_mode(p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.clans;
begin
  if p_mode not in ('open', 'request') then raise exception 'Mode tidak valid'; end if;
  c := public.clan_lock_as_leader(auth.uid());
  update public.clans set join_mode = p_mode where id = c.id;
end; $$;
revoke all on function public.clan_set_join_mode(text) from public, anon;
grant execute on function public.clan_set_join_mode(text) to authenticated;

create or replace function public.clan_leave() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.clan_members;
begin
  if me is null then raise exception 'not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 7));
  select * into m from public.clan_members where user_id = me;
  if not found then raise exception 'Kamu tidak punya clan'; end if;
  if m.role = 'leader' then raise exception 'Leader tidak bisa keluar. Pindahkan kepemimpinan atau bubarkan clan'; end if;
  perform public.clan_remove_member(me);
end; $$;
revoke all on function public.clan_leave() from public, anon;
grant execute on function public.clan_leave() to authenticated;

create or replace function public.clan_kick(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.clans;
begin
  if me is null then raise exception 'not authenticated'; end if;
  c := public.clan_lock_as_leader(me);
  if p_user = me then raise exception 'Tidak bisa mengeluarkan diri sendiri'; end if;
  if not exists (select 1 from public.clan_members where clan_id = c.id and user_id = p_user) then raise exception 'Bukan anggota clan ini'; end if;
  perform public.clan_remove_member(p_user);
end; $$;
revoke all on function public.clan_kick(uuid) from public, anon;
grant execute on function public.clan_kick(uuid) to authenticated;

create or replace function public.clan_transfer(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.clans;
begin
  if me is null then raise exception 'not authenticated'; end if;
  c := public.clan_lock_as_leader(me);
  if p_user = me then raise exception 'Pilih anggota lain'; end if;
  if not exists (select 1 from public.clan_members where clan_id = c.id and user_id = p_user) then raise exception 'Bukan anggota clan ini'; end if;
  update public.clan_members set role = 'member' where user_id = me;
  update public.clan_members set role = 'leader' where user_id = p_user;
  update public.clans set leader = p_user where id = c.id;
end; $$;
revoke all on function public.clan_transfer(uuid) from public, anon;
grant execute on function public.clan_transfer(uuid) to authenticated;

create or replace function public.clan_disband() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.clans;
begin
  if me is null then raise exception 'not authenticated'; end if;
  c := public.clan_lock_as_leader(me);
  if (select count(*) from public.clan_members where clan_id = c.id) > 1 then raise exception 'Keluarkan semua anggota lain dulu'; end if;
  update public.clans set disbanded_at = now() where id = c.id;       -- diarsipkan: riwayat donasi & XP tetap tersimpan
  delete from public.clan_members where clan_id = c.id;
  delete from public.clan_requests where clan_id = c.id;
end; $$;
revoke all on function public.clan_disband() from public, anon;
grant execute on function public.clan_disband() to authenticated;

-- Setor WakuGold -> XPGold (tarif dari clan_config.donate_gold_per_xp)
create or replace function public.clan_donate(p_gold bigint, p_req uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; cid bigint; rate numeric := public.clan_cfg('donate_gold_per_xp'); xp bigint; c public.clans;
begin
  me := public.clan_op_begin(p_req);
  cid := public.clan_my_id(me);
  if cid is null then raise exception 'Kamu belum punya clan'; end if;
  if p_gold is null or p_gold < public.clan_cfg('donate_min') then raise exception 'Minimal setor % WakuGold', public.clan_cfg('donate_min')::bigint; end if;
  if p_gold > 100000000 then raise exception 'Jumlah terlalu besar'; end if;
  xp := floor(p_gold / rate)::bigint;
  if xp < 1 then raise exception 'Jumlah terlalu kecil'; end if;
  select * into c from public.clans where id = cid for update;
  perform public.wallet_debit(me, p_gold, 'clan_donate');
  update public.clans set xp_available = xp_available + xp, bank_total = bank_total + xp where id = cid returning * into c;
  update public.clan_members set donated_gold = donated_gold + p_gold, donated_xp = donated_xp + xp where user_id = me;
  insert into public.clan_donations (clan_id, user_id, gold, xp) values (cid, me, p_gold, xp);
  insert into public.clan_xp_log (clan_id, delta, kind, note, by_user) values (cid, xp, 'donasi', p_gold || ' WakuGold', me);
  return jsonb_build_object('xp', xp, 'xp_available', c.xp_available, 'gold', (select gold from public.wallets where user_id = me));
end; $$;
revoke all on function public.clan_donate(bigint, uuid) from public, anon;
grant execute on function public.clan_donate(bigint, uuid) to authenticated;

create or replace function public.clan_buy_slots(p_req uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; c public.clans; cost bigint := public.clan_cfg('slot_cost')::bigint; step int := public.clan_cfg('slot_step')::int;
begin
  me := public.clan_op_begin(p_req);
  c := public.clan_lock_as_leader(me);
  if c.slots + step > public.clan_cfg('max_slots') then raise exception 'Kapasitas sudah maksimal'; end if;
  if c.xp_available < cost then raise exception 'XPGold belum cukup'; end if;
  update public.clans set xp_available = xp_available - cost, slots = slots + step where id = c.id returning * into c;
  insert into public.clan_xp_log (clan_id, delta, kind, note, by_user) values (c.id, -cost, 'slot', '+' || step || ' slot (jadi ' || c.slots || ')', me);
  return jsonb_build_object('slots', c.slots, 'xp_available', c.xp_available);
end; $$;
revoke all on function public.clan_buy_slots(uuid) from public, anon;
grant execute on function public.clan_buy_slots(uuid) to authenticated;

create or replace function public.clan_upgrade_tier(p_req uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; c public.clans; cost bigint;
begin
  me := public.clan_op_begin(p_req);
  c := public.clan_lock_as_leader(me);
  if c.tier >= 5 then raise exception 'Tier sudah maksimal'; end if;
  cost := public.clan_cfg('tier_cost_' || (c.tier + 1))::bigint;
  if c.xp_available < cost then raise exception 'XPGold belum cukup'; end if;
  update public.clans set xp_available = xp_available - cost, tier = tier + 1 where id = c.id returning * into c;
  insert into public.clan_xp_log (clan_id, delta, kind, note, by_user) values (c.id, -cost, 'tier', 'Naik ke tier ' || c.tier, me);
  return jsonb_build_object('tier', c.tier, 'xp_available', c.xp_available);
end; $$;
revoke all on function public.clan_upgrade_tier(uuid) from public, anon;
grant execute on function public.clan_upgrade_tier(uuid) to authenticated;

-- Spin warna: peluang dari clan_config (odds_*). Hasil diundi di server.
create or replace function public.clan_spin(p_req uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; c public.clans; cost bigint := public.clan_cfg('spin_cost')::bigint;
        w_c numeric := public.clan_cfg('odds_common'); w_r numeric := public.clan_cfg('odds_rare'); w_l numeric := public.clan_cfg('odds_legend'); w_m numeric := public.clan_cfg('odds_mythic');
        roll numeric; rar text; col public.clan_colors; dup boolean; refund bigint := 0;
begin
  me := public.clan_op_begin(p_req);
  c := public.clan_lock_as_leader(me);
  if c.xp_available < cost then raise exception 'XPGold belum cukup'; end if;
  roll := random() * (w_c + w_r + w_l + w_m);
  rar := case when roll < w_c then 'common' when roll < w_c + w_r then 'rare' when roll < w_c + w_r + w_l then 'legend' else 'mythic' end;
  select * into col from public.clan_colors where rarity = rar order by random() limit 1;
  if not found then raise exception 'Data warna belum tersedia'; end if;
  dup := exists (select 1 from public.clan_color_owned where clan_id = c.id and color_id = col.id);
  if dup then refund := floor(cost * public.clan_cfg('spin_dup_refund_pct') / 100)::bigint;
  else insert into public.clan_color_owned (clan_id, color_id) values (c.id, col.id); end if;
  update public.clans set xp_available = xp_available - cost + refund where id = c.id returning * into c;
  insert into public.clan_xp_log (clan_id, delta, kind, note, by_user) values (c.id, -cost + refund, 'spin', col.name || ' (' || col.rarity || ')' || case when dup then ' - kembar' else '' end, me);
  return jsonb_build_object('color', public.clan_color_json(col.id), 'duplicate', dup, 'refund', refund, 'xp_available', c.xp_available);
end; $$;
revoke all on function public.clan_spin(uuid) from public, anon;
grant execute on function public.clan_spin(uuid) to authenticated;

create or replace function public.clan_set_color(p_color int) returns void
language plpgsql security definer set search_path = public as $$
declare c public.clans;
begin
  c := public.clan_lock_as_leader(auth.uid());
  if p_color is not null and not exists (select 1 from public.clan_color_owned where clan_id = c.id and color_id = p_color) then raise exception 'Warna belum dimiliki clan'; end if;
  update public.clans set color_id = p_color where id = c.id;
end; $$;
revoke all on function public.clan_set_color(int) from public, anon;
grant execute on function public.clan_set_color(int) to authenticated;
