-- ============================================================================================
-- PERBAIKAN PEMBAYARAN SOCIABUZZ: jangan sampai ada uang masuk tapi Premium tidak aktif / terbayar dua kali hangus
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH premium-sociabuzz.sql.
--
--  1. Cadangan pencocokan: kalau kode pesanan WP... tidak terbaca di pesan donasi, webhook mencari lewat UID pembeli
--     (UID ikut tertulis di kolom Pesan) dan memilih pesanan menunggu terbaru miliknya yang harganya <= nominal.
--  2. PEMBAYARAN GANDA AMAN: kalau pesanan yang SAMA dibayar lagi (mis. QRIS dibayar dua kali karena riwayat belum berubah),
--     pembayaran kedua dihitung sebagai pembelian baru (hari Premium ditambah lagi) -- bukan hangus.
-- ============================================================================================

create or replace function public.premium_find_pending_by_uid(p_uid uuid, p_amount int) returns text
language sql stable security definer set search_path = public as $$
  select o.order_id from public.premium_orders o
   where o.user_id = p_uid and o.provider = 'sociabuzz' and o.status in ('pending', 'expired') and o.activated_at is null
     and o.created_at > now() - interval '6 hours' and o.amount <= p_amount
   order by (o.amount = p_amount) desc, o.created_at desc
   limit 1;
$$;
revoke all on function public.premium_find_pending_by_uid(uuid, int) from public, anon, authenticated;
grant execute on function public.premium_find_pending_by_uid(uuid, int) to service_role;

create or replace function public.premium_activate_sb(p_order text, p_ref text, p_amount int, p_paid timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.premium_orders; n public.premium_orders; nid text;
begin
  select * into o from public.premium_orders where order_id = p_order and provider = 'sociabuzz' for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'order_not_found'); end if;
  if o.status = 'failed' then return jsonb_build_object('ok', false, 'reason', 'order_failed'); end if;
  if p_amount < o.amount then return jsonb_build_object('ok', false, 'reason', 'amount_too_low'); end if;

  -- ID donasi yang sama tidak diproses dua kali
  if p_ref is not null and exists (select 1 from public.premium_orders where pay_ref = p_ref) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  -- Pesanan ini sudah aktif, tapi ada pembayaran BARU (ID donasi berbeda) = dibayar dua kali -> jadikan pembelian baru
  if o.activated_at is not null then
    if p_ref is null then return jsonb_build_object('ok', true, 'already', true); end if;
    nid := o.order_id || 'D' || upper(substr(md5(gen_random_uuid()::text), 1, 3));
    insert into public.premium_orders (order_id, user_id, plan_id, plan_name, days, amount, bonus_gold, provider, method, expires_at, pay_ref, total_payment)
    values (nid, o.user_id, o.plan_id, o.plan_name, o.days, o.amount, o.bonus_gold, 'sociabuzz', 'qris', now() + interval '60 minutes', p_ref, p_amount);
    return public.premium_activate(nid, 'SB-' || p_ref, o.amount, false, p_paid) || jsonb_build_object('duplicate_payment', true);
  end if;

  update public.premium_orders set pay_ref = coalesce(pay_ref, p_ref), total_payment = p_amount where order_id = p_order;
  return public.premium_activate(o.order_id, 'SB-' || coalesce(p_ref, o.order_id), o.amount, false, p_paid);
end; $$;
revoke all on function public.premium_activate_sb(text, text, int, timestamptz) from public, anon, authenticated;
grant execute on function public.premium_activate_sb(text, text, int, timestamptz) to service_role;
