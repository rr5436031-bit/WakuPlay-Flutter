-- ============================================================================================
-- PERBAIKAN 2: "sudah bayar tapi tetap dibilang belum bayar"
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH premium-fix.sql.
--
--  1. Nominal dari SociaBuzz bisa tercatat lebih kecil dari harga (potongan biaya / format "5.000").
--     Sekarang diterima kalau >= 90% harga paket (biaya admin SociaBuzz). Di bawah itu tetap ditolak.
--  2. ID donasi (pay_ref) hanya dikunci SETELAH aktivasi sukses. Dulu kalau aktivasi ditolak, ID sudah terkunci
--     sehingga webhook ulang dianggap "sudah diproses" padahal Premium tidak pernah aktif.
-- ============================================================================================
create or replace function public.premium_activate_sb(p_order text, p_ref text, p_amount int, p_paid timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.premium_orders; nid text; r jsonb;
begin
  select * into o from public.premium_orders where order_id = p_order and provider = 'sociabuzz' for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'order_not_found'); end if;
  if o.status = 'failed' then return jsonb_build_object('ok', false, 'reason', 'order_failed'); end if;
  if p_amount < ceil(o.amount * 0.9) then return jsonb_build_object('ok', false, 'reason', 'amount_too_low'); end if;

  -- ID donasi yang sama tidak diproses dua kali
  if p_ref is not null and exists (select 1 from public.premium_orders where pay_ref = p_ref) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  -- Pesanan ini sudah aktif, tapi ada pembayaran BARU (ID donasi berbeda) = dibayar dua kali -> pembelian baru
  if o.activated_at is not null then
    if p_ref is null then return jsonb_build_object('ok', true, 'already', true); end if;
    nid := o.order_id || 'D' || upper(substr(md5(gen_random_uuid()::text), 1, 3));
    insert into public.premium_orders (order_id, user_id, plan_id, plan_name, days, amount, bonus_gold, provider, method, expires_at, pay_ref, total_payment)
    values (nid, o.user_id, o.plan_id, o.plan_name, o.days, o.amount, o.bonus_gold, 'sociabuzz', 'qris', now() + interval '60 minutes', p_ref, p_amount);
    r := public.premium_activate(nid, 'SB-' || p_ref, o.amount, false, p_paid);
    if not coalesce((r->>'ok')::boolean, false) then raise exception 'aktivasi ganda gagal: %', coalesce(r->>'reason', '?'); end if;
    return r || jsonb_build_object('duplicate_payment', true);
  end if;

  r := public.premium_activate(o.order_id, 'SB-' || coalesce(p_ref, o.order_id), o.amount, false, p_paid);
  if coalesce((r->>'ok')::boolean, false) then
    update public.premium_orders set pay_ref = coalesce(pay_ref, p_ref), total_payment = p_amount where order_id = p_order;
  end if;
  return r;
end; $$;
revoke all on function public.premium_activate_sb(text, text, int, timestamptz) from public, anon, authenticated;
grant execute on function public.premium_activate_sb(text, text, int, timestamptz) to service_role;
