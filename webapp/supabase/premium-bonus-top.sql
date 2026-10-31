-- ============================================================================================
-- PREMIUM: BONUS WAKUGOLD (diatur Developer) + PERINGKAT BULANAN UNTUK BADGE "TOP LB"
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH premium.sql.
--
-- ATURAN KETAT BONUS WAKUGOLD
--   1. Besar bonus per paket hanya bisa diubah Developer (Panel Developer > Premium). Dicek is_developer() di server.
--   2. Bonus di-"snapshot" ke pesanan saat pesanan dibuat. Mengubah bonus paket TIDAK mengubah pesanan yang sudah dibuat.
--   3. Bonus hanya cair di dalam premium_activate() (service_role, setelah pembayaran terverifikasi ke Pakasir), dalam
--      SATU transaksi database yang sama dengan aktivasi Premium: Premium aktif <=> bonus cair, tidak bisa salah satu.
--   4. Satu pesanan hanya bisa mencairkan bonus SEKALI: (a) penjaga activated_at, (b) indeks UNIK di gold_ledger
--      untuk alasan 'premium_bonus:<order_id>'. Webhook diulang / dikirim dobel tidak menambah WakuGold lagi.
--   5. Setiap bonus tercatat di gold_ledger ('premium_bonus:<order_id>') untuk audit.
--   6. Pengguna / APK tidak punya jalur apa pun untuk memberi bonus. Tabel dompet & ledger dikunci dari APK.
--   7. Batas: bonus 0 sampai 100.000.000 per pesanan, total saldo maksimal 1.000.000.000.000.
-- ============================================================================================

-- ---------- 1) Kolom bonus ----------
alter table public.premium_plans  add column if not exists bonus_gold int not null default 0;
alter table public.premium_orders add column if not exists bonus_gold int not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'premium_plans_bonus_check') then
    alter table public.premium_plans add constraint premium_plans_bonus_check check (bonus_gold between 0 and 100000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'premium_orders_bonus_check') then
    alter table public.premium_orders add constraint premium_orders_bonus_check check (bonus_gold between 0 and 100000000);
  end if;
end $$;

-- Kunci kedua anti-bonus-ganda: alasan 'premium_bonus:<order>' tidak boleh muncul dua kali di ledger
create unique index if not exists gold_ledger_premium_bonus_uq on public.gold_ledger (reason) where reason like 'premium_bonus:%';

-- ---------- 2) JSON pesanan memuat bonus ----------
create or replace function public.premium_order_json(o public.premium_orders) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'order_id', o.order_id, 'user_id', o.user_id, 'plan_id', o.plan_id, 'plan_name', o.plan_name, 'days', o.days,
    'amount', o.amount, 'bonus_gold', o.bonus_gold, 'method', o.method, 'status', o.status, 'txn_id', o.txn_id, 'fee', o.fee,
    'total_payment', o.total_payment, 'qr_string', o.qr_string, 'expires_at', o.expires_at, 'is_sandbox', o.is_sandbox,
    'created_at', o.created_at, 'completed_at', o.completed_at, 'activated', o.activated_at is not null);
$$;

-- ---------- 3) Buat pesanan: bonus ikut di-snapshot ----------
create or replace function public.premium_create_order(p_user uuid, p_plan text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pl public.premium_plans; o public.premium_orders; oid text;
begin
  select * into pl from public.premium_plans where id = p_plan and active;
  if not found then raise exception 'Paket tidak tersedia'; end if;
  if pl.price < 500 or pl.price > 10000000 then raise exception 'Harga paket tidak valid untuk QRIS'; end if;

  perform pg_advisory_xact_lock(hashtext('premium:' || p_user::text));

  update public.premium_orders set status = 'expired'
   where user_id = p_user and status = 'pending' and txn_id is not null and expires_at <= now();
  update public.premium_orders set status = 'failed'
   where user_id = p_user and status = 'pending' and txn_id is null and created_at < now() - interval '5 minutes';

  -- pakai ulang pesanan menunggu HANYA kalau harga DAN bonus paket masih sama dengan sekarang
  select * into o from public.premium_orders
   where user_id = p_user and plan_id = pl.id and amount = pl.price and bonus_gold = pl.bonus_gold and status = 'pending'
     and txn_id is not null and expires_at > now() + interval '60 seconds'
   order by created_at desc limit 1;
  if found then return public.premium_order_json(o) || jsonb_build_object('reused', true); end if;

  if (select count(*) from public.premium_orders where user_id = p_user and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Terlalu banyak pesanan. Coba lagi nanti.';
  end if;

  oid := 'WP' || to_char(now() at time zone 'utc', 'YYMMDD') || upper(substr(md5(gen_random_uuid()::text), 1, 10));
  insert into public.premium_orders (order_id, user_id, plan_id, plan_name, days, amount, bonus_gold)
  values (oid, p_user, pl.id, pl.name, pl.days, pl.price, pl.bonus_gold)
  returning * into o;
  return public.premium_order_json(o) || jsonb_build_object('reused', false);
end; $$;

-- ---------- 4) Aktivasi: Premium + bonus WakuGold dalam satu transaksi ----------
create or replace function public.premium_activate(p_order text, p_txn text, p_amount int, p_sandbox boolean, p_completed timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.premium_orders; m public.premium_members; g bigint;
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

  insert into public.premium_members as pm (user_id, started_at, expires_at, plan_id, updated_at)
  values (o.user_id, now(), now() + make_interval(days => o.days), o.plan_id, now())
  on conflict (user_id) do update
     set started_at = case when pm.expires_at > now() then pm.started_at else now() end,
         expires_at = greatest(pm.expires_at, now()) + make_interval(days => o.days),
         plan_id    = o.plan_id,
         updated_at = now()
  returning * into m;

  -- BONUS WAKUGOLD (nilai snapshot pesanan). Satu transaksi dengan aktivasi di atas.
  if o.bonus_gold > 0 then
    insert into public.wallets (user_id) values (o.user_id) on conflict do nothing;
    select gold into g from public.wallets where user_id = o.user_id for update;
    if g + o.bonus_gold > 1000000000000 then
      raise exception 'Saldo WakuGold terlalu besar';     -- membatalkan SELURUH aktivasi (tidak ada Premium tanpa bonus)
    end if;
    update public.wallets set gold = gold + o.bonus_gold, updated_at = now() where user_id = o.user_id;
    insert into public.gold_ledger (user_id, delta, reason)
    values (o.user_id, o.bonus_gold, 'premium_bonus:' || o.order_id);   -- indeks unik: tidak bisa tercatat dua kali
  end if;
  return jsonb_build_object('ok', true, 'already', false, 'expires_at', m.expires_at, 'bonus_gold', o.bonus_gold);
end; $$;

-- ---------- 5) Data untuk aplikasi ----------
create or replace function public.premium_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'server_now', now(),
    'benefits', coalesce((select benefits from public.premium_settings where id = 1), ''),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'days', p.days, 'price', p.price, 'bonus_gold', p.bonus_gold) order by p.sort, p.price)
                         from public.premium_plans p where p.active), '[]'::jsonb),
    'me', (select jsonb_build_object('active', m.expires_at > now(), 'started_at', m.started_at, 'expires_at', m.expires_at,
                                     'plan_id', m.plan_id, 'plan_name', (select name from public.premium_plans pp where pp.id = m.plan_id))
             from public.premium_members m where m.user_id = auth.uid())
  ) where auth.uid() is not null;
$$;
revoke all on function public.premium_overview() from public, anon;
grant execute on function public.premium_overview() to authenticated;

drop function if exists public.premium_orders_me(int);
create or replace function public.premium_orders_me(p_limit int default 20)
returns table (order_id text, plan_name text, days int, amount int, bonus_gold int, fee int, total_payment int, status text, is_sandbox boolean, created_at timestamptz, completed_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.order_id, o.plan_name, o.days, o.amount, o.bonus_gold, o.fee, o.total_payment,
         case when o.status = 'pending' and (o.txn_id is null or o.expires_at <= now()) then 'expired' else o.status end,
         o.is_sandbox, o.created_at, o.completed_at, o.expires_at
    from public.premium_orders o
   where o.user_id = auth.uid()
   order by o.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke all on function public.premium_orders_me(int) from public, anon;
grant execute on function public.premium_orders_me(int) to authenticated;

-- ---------- 6) Panel Developer: bonus per paket ----------
create or replace function public.dev_premium_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  return jsonb_build_object(
    'benefits', coalesce((select benefits from public.premium_settings where id = 1), ''),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'days', p.days, 'price', p.price, 'bonus_gold', p.bonus_gold, 'active', p.active, 'sort', p.sort) order by p.sort, p.price) from public.premium_plans p), '[]'::jsonb),
    'stats', jsonb_build_object(
      'active_members', (select count(*) from public.premium_members where expires_at > now()),
      'pending', (select count(*) from public.premium_orders where status = 'pending' and expires_at > now()),
      'completed', (select count(*) from public.premium_orders where status = 'completed' and coalesce(is_sandbox, false) = false),
      'revenue', coalesce((select sum(amount) from public.premium_orders where status = 'completed' and coalesce(is_sandbox, false) = false), 0)),
    'recent', coalesce((select jsonb_agg(r) from (
        select o.order_id, public.wp_name(o.user_id) as name, o.plan_name, o.amount, o.bonus_gold, o.status, o.is_sandbox, o.created_at, o.completed_at
          from public.premium_orders o order by o.created_at desc limit 20) r), '[]'::jsonb));
end; $$;
revoke all on function public.dev_premium_overview() from public, anon;
grant execute on function public.dev_premium_overview() to authenticated;

drop function if exists public.dev_premium_plan_save(text, text, int, int, boolean, int);
create or replace function public.dev_premium_plan_save(p_id text, p_name text, p_days int, p_price int, p_bonus int, p_active boolean, p_sort int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_id is null or p_id !~ '^[a-z0-9_-]{2,30}$' then raise exception 'ID paket: huruf kecil/angka/-/_ (2-30 karakter)'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then raise exception 'Nama paket 1-40 karakter'; end if;
  if p_days is null or p_days not between 1 and 3650 then raise exception 'Durasi 1 sampai 3650 hari'; end if;
  if p_price is null or p_price not between 500 and 10000000 then raise exception 'Harga 500 sampai 10.000.000 (batas QRIS Pakasir)'; end if;
  if p_bonus is null or p_bonus not between 0 and 100000000 then raise exception 'Bonus WakuGold 0 sampai 100.000.000'; end if;
  insert into public.premium_plans (id, name, days, price, bonus_gold, active, sort)
  values (p_id, btrim(p_name), p_days, p_price, p_bonus, coalesce(p_active, true), coalesce(p_sort, 0))
  on conflict (id) do update set name = excluded.name, days = excluded.days, price = excluded.price, bonus_gold = excluded.bonus_gold, active = excluded.active, sort = excluded.sort;
end; $$;
revoke all on function public.dev_premium_plan_save(text, text, int, int, int, boolean, int) from public, anon;
grant execute on function public.dev_premium_plan_save(text, text, int, int, int, boolean, int) to authenticated;

-- ---------- 7) Badge "TOP LB": peringkat XP BULANAN (bulan berjalan, zona WIB) ----------
-- Mengembalikan peringkat 1..10 kalau pengguna masuk 10 besar bulan ini, selain itu NULL.
-- Sumber sama dengan Leaderboard > Bulanan (tabel xp_daily).
create or replace function public.monthly_top_of(p_user uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare from_day date := date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date; mine numeric; r int;
begin
  if auth.uid() is null or p_user is null then return null; end if;
  select coalesce(sum(gained), 0) into mine from public.xp_daily where user_id = p_user and day >= from_day;
  if mine <= 0 then return null; end if;
  select count(*)::int + 1 into r from (select sum(gained) s from public.xp_daily where day >= from_day group by user_id having sum(gained) > mine) t;
  return case when r <= 10 then r end;
end; $$;
revoke all on function public.monthly_top_of(uuid) from public, anon;
grant execute on function public.monthly_top_of(uuid) to authenticated;
