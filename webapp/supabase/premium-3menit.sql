-- ============================================================================================
-- MASA BERLAKU PESANAN PREMIUM = 3 MENIT (sama dengan masa berlaku QRIS SociaBuzz)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH premium-qris.sql.
--  * Pesanan baru berlaku 3 menit (dulu 60 menit). Pesanan lama yang masih 'pending' tetap berlaku sesuai waktunya.
--  * Pesanan dipakai ulang hanya kalau sisa waktunya masih lebih dari 20 detik.
--  * Ada tenggang 2 menit di riwayat & pengecekan status: bayar di detik-detik terakhir lalu webhook telat tidak langsung dianggap gagal.
--  * Pembayaran yang masuk SETELAH kedaluwarsa tetap diaktifkan oleh webhook (uangnya sudah diterima).
-- ============================================================================================

create or replace function public.premium_create_order_sb(p_user uuid, p_plan text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pl public.premium_plans; o public.premium_orders; oid text;
begin
  select * into pl from public.premium_plans where id = p_plan and active;
  if not found then raise exception 'Paket tidak tersedia'; end if;
  if pl.price < 1000 or pl.price > 10000000 then raise exception 'Harga paket tidak valid'; end if;
  perform pg_advisory_xact_lock(hashtext('premium:' || p_user::text));
  update public.premium_orders set status = 'expired'
   where user_id = p_user and status = 'pending' and provider = 'sociabuzz' and expires_at <= now();
  select * into o from public.premium_orders
   where user_id = p_user and provider = 'sociabuzz' and plan_id = pl.id and amount = pl.price and bonus_gold = pl.bonus_gold
     and status = 'pending' and expires_at > now() + interval '20 seconds'
   order by created_at desc limit 1;
  if found then return public.premium_order_json(o) || jsonb_build_object('reused', true, 'pay_url', o.pay_url, 'pay_qr', o.pay_qr); end if;
  if (select count(*) from public.premium_orders where user_id = p_user and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Terlalu banyak pesanan. Coba lagi nanti.';
  end if;
  oid := 'WP' || to_char(now() at time zone 'utc', 'YYMMDD') || upper(substr(md5(gen_random_uuid()::text), 1, 10));
  insert into public.premium_orders (order_id, user_id, plan_id, plan_name, days, amount, bonus_gold, provider, method, expires_at)
  values (oid, p_user, pl.id, pl.name, pl.days, pl.price, pl.bonus_gold, 'sociabuzz', 'qris', now() + interval '3 minutes')
  returning * into o;
  return public.premium_order_json(o) || jsonb_build_object('reused', false, 'pay_url', null, 'pay_qr', null);
end; $$;
revoke all on function public.premium_create_order_sb(uuid, text) from public, anon, authenticated;
grant execute on function public.premium_create_order_sb(uuid, text) to service_role;

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
