-- ============================================================================================
-- PREMIUM: PEMBAYARAN LEWAT SOCIABUZZ (menggantikan Pakasir)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH premium.sql dan premium-bonus-top.sql.
--
-- Cara kerja:
--   1. Aplikasi minta pesanan -> server membuat pesanan 'pending' dengan kode unik (WP...).
--   2. Aplikasi membuka halaman SociaBuzz di WebView, nama/email/pesan diisi otomatis.
--      Kode pesanan WP... ikut tertulis di kolom Pesan.
--   3. SociaBuzz mengirim webhook ke Edge Function premium-webhook setelah pembayaran sukses.
--      Server mencocokkan kode WP... + nominal, lalu memanggil premium_activate_sb().
--   4. Premium + bonus WakuGold cair dalam satu transaksi (memakai premium_activate() yang sudah ada).
-- ============================================================================================

alter table public.premium_orders add column if not exists provider text not null default 'pakasir';
alter table public.premium_orders add column if not exists pay_url  text;     -- alamat halaman bayar SociaBuzz (untuk "Bayar sekarang")
alter table public.premium_orders add column if not exists pay_ref  text;     -- ID donasi dari SociaBuzz (anti diproses dua kali)
create unique index if not exists premium_orders_pay_ref_uq on public.premium_orders (pay_ref) where pay_ref is not null;

-- Log mentah webhook (untuk melacak kalau ada pembayaran yang tidak cocok). Terkunci dari APK.
create table if not exists public.premium_webhook_log (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  result     text,
  order_id   text,
  payload    jsonb
);
alter table public.premium_webhook_log enable row level security;
revoke all on public.premium_webhook_log from anon, authenticated;

-- ---------- Buat pesanan SociaBuzz (atau pakai ulang pesanan menunggu yang sama) ----------
create or replace function public.premium_create_order_sb(p_user uuid, p_plan text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pl public.premium_plans; o public.premium_orders; oid text;
begin
  select * into pl from public.premium_plans where id = p_plan and active;
  if not found then raise exception 'Paket tidak tersedia'; end if;
  if pl.price < 1000 or pl.price > 10000000 then raise exception 'Harga paket tidak valid'; end if;

  perform pg_advisory_xact_lock(hashtext('premium:' || p_user::text));

  -- pesanan menunggu yang sudah lewat 3 menit (masa berlaku QRIS SociaBuzz) ditandai kedaluwarsa
  update public.premium_orders set status = 'expired'
   where user_id = p_user and status = 'pending' and provider = 'sociabuzz' and expires_at <= now();

  -- pakai ulang kalau paket, harga, dan bonus masih sama (dan QRIS-nya masih punya sisa waktu > 20 detik)
  select * into o from public.premium_orders
   where user_id = p_user and provider = 'sociabuzz' and plan_id = pl.id and amount = pl.price and bonus_gold = pl.bonus_gold
     and status = 'pending' and expires_at > now() + interval '20 seconds'
   order by created_at desc limit 1;
  if found then return public.premium_order_json(o) || jsonb_build_object('reused', true, 'pay_url', o.pay_url); end if;

  if (select count(*) from public.premium_orders where user_id = p_user and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Terlalu banyak pesanan. Coba lagi nanti.';
  end if;

  oid := 'WP' || to_char(now() at time zone 'utc', 'YYMMDD') || upper(substr(md5(gen_random_uuid()::text), 1, 10));
  insert into public.premium_orders (order_id, user_id, plan_id, plan_name, days, amount, bonus_gold, provider, method, expires_at)
  values (oid, p_user, pl.id, pl.name, pl.days, pl.price, pl.bonus_gold, 'sociabuzz', 'qris', now() + interval '3 minutes')
  returning * into o;
  return public.premium_order_json(o) || jsonb_build_object('reused', false, 'pay_url', null);
end; $$;

-- Simpan alamat halaman bayar yang ditangkap WebView (hanya domain sociabuzz.com)
create or replace function public.premium_order_set_url(p_order text, p_user uuid, p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_url is null or p_url !~* '^https://([a-z0-9-]+\.)*sociabuzz\.com(/|$)' or char_length(p_url) > 600 then return; end if;
  update public.premium_orders set pay_url = p_url
   where order_id = p_order and user_id = p_user and provider = 'sociabuzz' and status = 'pending';
end; $$;

-- Batalkan pesanan menunggu milik sendiri
create or replace function public.premium_order_cancel_sb(p_order text, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.premium_orders set status = 'canceled'
   where order_id = p_order and user_id = p_user and provider = 'sociabuzz' and status = 'pending' and activated_at is null;
end; $$;

-- Bantu webhook: cari pesanan menunggu berdasarkan email + nominal (cadangan kalau kode WP tidak terbaca)
create or replace function public.premium_find_pending_sb(p_email text, p_amount int) returns text
language plpgsql security definer set search_path = public as $$
declare ids text[];
begin
  select array_agg(o.order_id) into ids
    from public.premium_orders o join auth.users u on u.id = o.user_id
   where o.provider = 'sociabuzz' and o.status in ('pending', 'expired') and o.activated_at is null
     and o.created_at > now() - interval '3 hours'
     and lower(u.email) = lower(p_email) and o.amount <= p_amount;
  if ids is not null and array_length(ids, 1) = 1 then return ids[1]; end if;
  return null;   -- 0 atau lebih dari 1 kandidat -> tidak ditebak
end; $$;

-- AKTIFKAN dari webhook SociaBuzz. Nominal dibayar harus >= harga pesanan. Premium + bonus lewat premium_activate().
create or replace function public.premium_activate_sb(p_order text, p_ref text, p_amount int, p_paid timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.premium_orders; r jsonb;
begin
  select * into o from public.premium_orders where order_id = p_order and provider = 'sociabuzz' for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'order_not_found'); end if;
  if o.activated_at is not null then return jsonb_build_object('ok', true, 'already', true); end if;
  if o.status = 'failed' then return jsonb_build_object('ok', false, 'reason', 'order_failed'); end if;
  if p_amount < o.amount then return jsonb_build_object('ok', false, 'reason', 'amount_too_low'); end if;
  if p_ref is not null and exists (select 1 from public.premium_orders where pay_ref = p_ref and order_id <> p_order) then
    return jsonb_build_object('ok', false, 'reason', 'ref_used');
  end if;
  update public.premium_orders set pay_ref = coalesce(pay_ref, p_ref), total_payment = p_amount where order_id = p_order;
  r := public.premium_activate(o.order_id, 'SB-' || coalesce(p_ref, o.order_id), o.amount, false, p_paid);
  return r;
end; $$;

-- ---------- Riwayat transaksi: tambahkan bisa_bayar + tidak lagi menganggap txn_id kosong = kedaluwarsa ----------
drop function if exists public.premium_orders_me(int);
create or replace function public.premium_orders_me(p_limit int default 20)
returns table (order_id text, plan_name text, days int, amount int, bonus_gold int, fee int, total_payment int, status text, is_sandbox boolean, created_at timestamptz, completed_at timestamptz, expires_at timestamptz, can_pay boolean)
language sql stable security definer set search_path = public as $$
  select o.order_id, o.plan_name, o.days, o.amount, o.bonus_gold, o.fee, o.total_payment,
         case when o.status = 'pending' and o.expires_at + interval '2 minutes' <= now() then 'expired'   -- ada tenggang 2 menit untuk webhook yang telat
              when o.status = 'pending' and o.provider = 'pakasir' and o.txn_id is null then 'expired'
              else o.status end,
         o.is_sandbox, o.created_at, o.completed_at, o.expires_at,
         (o.status = 'pending' and o.provider = 'sociabuzz' and o.expires_at > now())
    from public.premium_orders o
   where o.user_id = auth.uid()
   order by o.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke all on function public.premium_orders_me(int) from public, anon;
grant execute on function public.premium_orders_me(int) to authenticated;

-- Info pesanan untuk "Bayar sekarang" (milik sendiri saja)
create or replace function public.premium_order_pay_info(p_order text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('order_id', o.order_id, 'plan_name', o.plan_name, 'amount', o.amount, 'days', o.days,
                            'status', case when o.status = 'pending' and o.expires_at + interval '2 minutes' <= now() then 'expired'   -- ada tenggang 2 menit untuk webhook yang telat else o.status end,
                            'activated', o.activated_at is not null, 'pay_url', o.pay_url, 'expires_at', o.expires_at, 'server_now', now())
    from public.premium_orders o
   where o.order_id = p_order and o.user_id = auth.uid();
$$;
revoke all on function public.premium_order_pay_info(text) from public, anon;
grant execute on function public.premium_order_pay_info(text) to authenticated;

do $$ declare f text; begin
  foreach f in array array[
    'premium_create_order_sb(uuid,text)', 'premium_order_set_url(text,uuid,text)', 'premium_order_cancel_sb(text,uuid)',
    'premium_find_pending_sb(text,int)', 'premium_activate_sb(text,text,int,timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
