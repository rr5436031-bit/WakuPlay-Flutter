-- ============================================================================================
-- WAKUPLAY PREMIUM + PEMBAYARAN PAKASIR (API v2)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Syarat: schema.sql (is_developer) dan teman-chat.sql (wp_name) sudah pernah dijalankan.
--
-- Prinsip keamanan:
--   * Semua tabel Premium DIKUNCI dari APK (RLS aktif tanpa policy + hak akses anon/authenticated dicabut).
--     Pengguna hanya bisa membaca data MILIKNYA lewat fungsi (RPC) di bawah. Tidak ada jalur untuk menulis.
--   * Memberi Premium hanya lewat premium_activate() yang HANYA bisa dipanggil service_role (Edge Function
--     di server, setelah pembayaran terverifikasi ke Pakasir). Pengguna / developer biasa tidak bisa memanggilnya.
--   * Harga, durasi, dan nominal selalu diambil dari tabel paket di server, tidak pernah dari APK.
--   * Waktu masa aktif memakai now() milik server database (disimpan timestamptz / UTC).
-- ============================================================================================

-- ---------- 1) PAKET (diatur Developer lewat Panel Developer > Premium) ----------
create table if not exists public.premium_plans (
  id         text primary key check (id ~ '^[a-z0-9_-]{2,30}$'),
  name       text not null check (char_length(name) between 1 and 40),
  days       int  not null check (days between 1 and 3650),      -- durasi (hari)
  price      int  not null check (price between 500 and 10000000), -- Rupiah; batas QRIS Pakasir 500 - 10.000.000
  active     boolean not null default true,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

-- Teks manfaat Premium (1 baris = 1 poin). Diubah Developer lewat Panel Developer.
create table if not exists public.premium_settings (
  id         int primary key default 1 check (id = 1),
  benefits   text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.premium_settings (id, benefits) values (1,
  E'Badge PREMIUM biru di profil dan komentar anime\nMendukung pengembangan dan server WakuPlay')
on conflict (id) do nothing;

-- ---------- 2) STATUS PREMIUM TIAP AKUN (permanen di database, ikut akun di perangkat mana pun) ----------
create table if not exists public.premium_members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  expires_at timestamptz not null,
  plan_id    text,
  updated_at timestamptz not null default now()
);

-- ---------- 3) PESANAN / RIWAYAT TRANSAKSI ----------
create table if not exists public.premium_orders (
  id              bigint generated always as identity primary key,
  order_id        text not null unique,                 -- ID pesanan kita (dikirim ke Pakasir sebagai order_id)
  user_id         uuid not null references auth.users(id) on delete cascade,
  plan_id         text not null,
  plan_name       text not null,                        -- snapshot saat dibeli
  days            int  not null,                        -- snapshot
  amount          int  not null check (amount > 0),     -- snapshot harga (nominal yang dikirim ke Pakasir)
  method          text not null default 'qris',
  status          text not null default 'pending' check (status in ('pending', 'completed', 'canceled', 'expired', 'failed')),
  txn_id          text unique,                          -- ID transaksi Pakasir
  fee             int,
  total_payment   int,
  qr_string       text,
  expires_at      timestamptz,                          -- kedaluwarsa QR
  is_sandbox      boolean,
  last_checked_at timestamptz,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,                          -- waktu pembayaran (dari Pakasir)
  activated_at    timestamptz                           -- waktu Premium diaktifkan; terisi SEKALI = anti aktivasi ganda
);
create index if not exists premium_orders_user_idx on public.premium_orders (user_id, created_at desc);

alter table public.premium_plans    enable row level security;
alter table public.premium_settings enable row level security;
alter table public.premium_members  enable row level security;
alter table public.premium_orders   enable row level security;
revoke all on public.premium_plans, public.premium_settings, public.premium_members, public.premium_orders from anon, authenticated;

-- ============================================================ UNTUK PENGGUNA (hanya membaca data sendiri)
create or replace function public.premium_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'server_now', now(),
    'benefits', coalesce((select benefits from public.premium_settings where id = 1), ''),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'days', p.days, 'price', p.price) order by p.sort, p.price)
                         from public.premium_plans p where p.active), '[]'::jsonb),
    'me', (select jsonb_build_object('active', m.expires_at > now(), 'started_at', m.started_at, 'expires_at', m.expires_at,
                                     'plan_id', m.plan_id, 'plan_name', (select name from public.premium_plans pp where pp.id = m.plan_id))
             from public.premium_members m where m.user_id = auth.uid())
  ) where auth.uid() is not null;
$$;
revoke all on function public.premium_overview() from public, anon;
grant execute on function public.premium_overview() to authenticated;

-- Riwayat transaksi milik sendiri (tanpa kode QR). Pesanan menunggu yang QR-nya lewat waktu ditampilkan sebagai 'expired'.
create or replace function public.premium_orders_me(p_limit int default 20)
returns table (order_id text, plan_name text, days int, amount int, fee int, total_payment int, status text, is_sandbox boolean, created_at timestamptz, completed_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.order_id, o.plan_name, o.days, o.amount, o.fee, o.total_payment,
         case when o.status = 'pending' and (o.txn_id is null or o.expires_at <= now()) then 'expired' else o.status end,
         o.is_sandbox, o.created_at, o.completed_at, o.expires_at
    from public.premium_orders o
   where o.user_id = auth.uid()
   order by o.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke all on function public.premium_orders_me(int) from public, anon;
grant execute on function public.premium_orders_me(int) to authenticated;

-- Badge: dari daftar user id, kembalikan yang Premium-nya AKTIF (otomatis hilang saat masa aktif habis)
create or replace function public.premium_of(p_ids uuid[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.user_id from public.premium_members m
   where auth.uid() is not null and m.user_id = any (p_ids[1:200]) and m.expires_at > now();
$$;
revoke all on function public.premium_of(uuid[]) from public, anon;
grant execute on function public.premium_of(uuid[]) to authenticated;

-- ============================================================ HANYA UNTUK BACKEND (service_role / Edge Function)
create or replace function public.premium_order_json(o public.premium_orders) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'order_id', o.order_id, 'user_id', o.user_id, 'plan_id', o.plan_id, 'plan_name', o.plan_name, 'days', o.days,
    'amount', o.amount, 'method', o.method, 'status', o.status, 'txn_id', o.txn_id, 'fee', o.fee,
    'total_payment', o.total_payment, 'qr_string', o.qr_string, 'expires_at', o.expires_at, 'is_sandbox', o.is_sandbox,
    'created_at', o.created_at, 'completed_at', o.completed_at, 'activated', o.activated_at is not null);
$$;

-- Buat pesanan baru (atau pakai ulang pesanan menunggu yang sama). Harga diambil dari tabel paket.
create or replace function public.premium_create_order(p_user uuid, p_plan text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pl public.premium_plans; o public.premium_orders; oid text;
begin
  select * into pl from public.premium_plans where id = p_plan and active;
  if not found then raise exception 'Paket tidak tersedia'; end if;
  if pl.price < 500 or pl.price > 10000000 then raise exception 'Harga paket tidak valid untuk QRIS'; end if;

  perform pg_advisory_xact_lock(hashtext('premium:' || p_user::text));   -- tap berulang tidak membuat pesanan ganda

  -- bereskan pesanan lama yang tidak mungkin dibayar lagi
  update public.premium_orders set status = 'expired'
   where user_id = p_user and status = 'pending' and txn_id is not null and expires_at <= now();
  update public.premium_orders set status = 'failed'
   where user_id = p_user and status = 'pending' and txn_id is null and created_at < now() - interval '5 minutes';

  -- masih ada pesanan menunggu untuk paket & harga yang sama -> pakai lagi (kode QR sama)
  select * into o from public.premium_orders
   where user_id = p_user and plan_id = pl.id and amount = pl.price and status = 'pending'
     and txn_id is not null and expires_at > now() + interval '60 seconds'
   order by created_at desc limit 1;
  if found then return public.premium_order_json(o) || jsonb_build_object('reused', true); end if;

  if (select count(*) from public.premium_orders where user_id = p_user and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Terlalu banyak pesanan. Coba lagi nanti.';
  end if;

  oid := 'WP' || to_char(now() at time zone 'utc', 'YYMMDD') || upper(substr(md5(gen_random_uuid()::text), 1, 10));
  insert into public.premium_orders (order_id, user_id, plan_id, plan_name, days, amount)
  values (oid, p_user, pl.id, pl.name, pl.days, pl.price)
  returning * into o;
  return public.premium_order_json(o) || jsonb_build_object('reused', false);
end; $$;

-- Simpan hasil pembuatan transaksi dari Pakasir ke pesanan
create or replace function public.premium_order_attach(p_order text, p_txn text, p_fee int, p_total int, p_qr text, p_expires timestamptz, p_sandbox boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.premium_orders;
begin
  select * into o from public.premium_orders where order_id = p_order for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.txn_id is not null and o.txn_id <> p_txn then raise exception 'ID transaksi tidak cocok'; end if;
  update public.premium_orders
     set txn_id = p_txn, fee = p_fee, total_payment = p_total, qr_string = p_qr, expires_at = p_expires, is_sandbox = p_sandbox
   where order_id = p_order returning * into o;
  return public.premium_order_json(o);
end; $$;

create or replace function public.premium_order_get(p_order text) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.premium_order_json(o) from public.premium_orders o where o.order_id = p_order;
$$;

-- Batasi pengecekan ke Pakasir: maksimal 1x tiap 4 detik per pesanan (sesuai batas Pakasir)
create or replace function public.premium_order_touch(p_order text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.premium_orders set last_checked_at = now()
   where order_id = p_order and status = 'pending' and (last_checked_at is null or last_checked_at < now() - interval '4 seconds');
  return found;
end; $$;

-- Tandai pesanan gagal / dibatalkan / kedaluwarsa (hanya dari status menunggu)
create or replace function public.premium_order_status(p_order text, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('canceled', 'expired', 'failed') then raise exception 'Status tidak valid'; end if;
  update public.premium_orders set status = p_status where order_id = p_order and status = 'pending';
end; $$;

-- AKTIFKAN PREMIUM. Idempotent: pesanan yang sama hanya bisa mengaktifkan SEKALI.
-- Dipanggil Edge Function SETELAH pembayaran terverifikasi ke Pakasir. Semua pengecekan di sini = lapis kedua.
create or replace function public.premium_activate(p_order text, p_txn text, p_amount int, p_sandbox boolean, p_completed timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.premium_orders; m public.premium_members;
begin
  select * into o from public.premium_orders where order_id = p_order for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'order_not_found'); end if;
  if o.activated_at is not null then return jsonb_build_object('ok', true, 'already', true); end if;
  if o.txn_id is not null and o.txn_id <> p_txn then return jsonb_build_object('ok', false, 'reason', 'txn_mismatch'); end if;
  if o.amount <> p_amount then return jsonb_build_object('ok', false, 'reason', 'amount_mismatch'); end if;
  if o.is_sandbox is not null and o.is_sandbox <> coalesce(p_sandbox, false) then return jsonb_build_object('ok', false, 'reason', 'sandbox_mismatch'); end if;

  update public.premium_orders
     set status = 'completed', txn_id = coalesce(txn_id, p_txn), is_sandbox = coalesce(is_sandbox, p_sandbox),
         completed_at = coalesce(p_completed, now()), activated_at = now()
   where order_id = p_order;

  -- Masih aktif -> durasi baru ditambahkan SETELAH tanggal berakhir saat ini. Sudah habis -> mulai dari sekarang.
  insert into public.premium_members as pm (user_id, started_at, expires_at, plan_id, updated_at)
  values (o.user_id, now(), now() + make_interval(days => o.days), o.plan_id, now())
  on conflict (user_id) do update
     set started_at = case when pm.expires_at > now() then pm.started_at else now() end,
         expires_at = greatest(pm.expires_at, now()) + make_interval(days => o.days),
         plan_id    = o.plan_id,
         updated_at = now()
  returning * into m;
  return jsonb_build_object('ok', true, 'already', false, 'expires_at', m.expires_at);
end; $$;

do $$ declare f text; begin
  foreach f in array array[
    'premium_order_json(public.premium_orders)', 'premium_create_order(uuid,text)',
    'premium_order_attach(text,text,int,int,text,timestamptz,boolean)', 'premium_order_get(text)',
    'premium_order_touch(text)', 'premium_order_status(text,text)', 'premium_activate(text,text,int,boolean,timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ============================================================ PANEL DEVELOPER (hanya developer)
create or replace function public.dev_premium_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  return jsonb_build_object(
    'benefits', coalesce((select benefits from public.premium_settings where id = 1), ''),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'days', p.days, 'price', p.price, 'active', p.active, 'sort', p.sort) order by p.sort, p.price) from public.premium_plans p), '[]'::jsonb),
    'stats', jsonb_build_object(
      'active_members', (select count(*) from public.premium_members where expires_at > now()),
      'pending', (select count(*) from public.premium_orders where status = 'pending' and expires_at > now()),
      'completed', (select count(*) from public.premium_orders where status = 'completed' and coalesce(is_sandbox, false) = false),
      'revenue', coalesce((select sum(amount) from public.premium_orders where status = 'completed' and coalesce(is_sandbox, false) = false), 0)),
    'recent', coalesce((select jsonb_agg(r) from (
        select o.order_id, public.wp_name(o.user_id) as name, o.plan_name, o.amount, o.status, o.is_sandbox, o.created_at, o.completed_at
          from public.premium_orders o order by o.created_at desc limit 20) r), '[]'::jsonb));
end; $$;
revoke all on function public.dev_premium_overview() from public, anon;
grant execute on function public.dev_premium_overview() to authenticated;

create or replace function public.dev_premium_plan_save(p_id text, p_name text, p_days int, p_price int, p_active boolean, p_sort int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_id is null or p_id !~ '^[a-z0-9_-]{2,30}$' then raise exception 'ID paket: huruf kecil/angka/-/_ (2-30 karakter)'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then raise exception 'Nama paket 1-40 karakter'; end if;
  if p_days is null or p_days not between 1 and 3650 then raise exception 'Durasi 1 sampai 3650 hari'; end if;
  if p_price is null or p_price not between 500 and 10000000 then raise exception 'Harga 500 sampai 10.000.000 (batas QRIS Pakasir)'; end if;
  insert into public.premium_plans (id, name, days, price, active, sort)
  values (p_id, btrim(p_name), p_days, p_price, coalesce(p_active, true), coalesce(p_sort, 0))
  on conflict (id) do update set name = excluded.name, days = excluded.days, price = excluded.price, active = excluded.active, sort = excluded.sort;
end; $$;
revoke all on function public.dev_premium_plan_save(text, text, int, int, boolean, int) from public, anon;
grant execute on function public.dev_premium_plan_save(text, text, int, int, boolean, int) to authenticated;

create or replace function public.dev_premium_plan_delete(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  delete from public.premium_plans where id = p_id;     -- riwayat pesanan tetap aman (menyimpan snapshot nama/harga)
end; $$;
revoke all on function public.dev_premium_plan_delete(text) from public, anon;
grant execute on function public.dev_premium_plan_delete(text) to authenticated;

create or replace function public.dev_premium_benefits_set(p_text text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  update public.premium_settings set benefits = left(coalesce(p_text, ''), 1500), updated_at = now() where id = 1;
end; $$;
revoke all on function public.dev_premium_benefits_set(text) from public, anon;
grant execute on function public.dev_premium_benefits_set(text) to authenticated;

-- ============================================================ CONTOH PAKET (TIDAK AKTIF OTOMATIS)
-- Harga & durasi TIDAK diisi otomatis. Atur lewat Panel Developer > Premium, atau contoh SQL ini (ganti angkanya):
--   select public.dev_premium_plan_save('bulanan', 'Premium 1 Bulan', 30, 15000, true, 1);
-- (dev_premium_plan_save butuh akun developer yang login; dari SQL Editor pakai insert langsung:)
--   insert into public.premium_plans (id, name, days, price, sort) values ('bulanan', 'Premium 1 Bulan', 30, 15000, 1)
--   on conflict (id) do update set name = excluded.name, days = excluded.days, price = excluded.price;
