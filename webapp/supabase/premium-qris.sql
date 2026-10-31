-- ============================================================================================
-- LANJUTKAN QRIS YANG SAMA ("Bayar sekarang" memakai QRIS lama, bukan membuat baru)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH premium-sociabuzz.sql dan premium-fix.sql.
--
-- Perbaikan bug: premium_order_pay_info lama memakai auth.uid() padahal dipanggil lewat Edge Function (tanpa identitas
-- pengguna) -> hasilnya selalu kosong -> QRIS lama tidak pernah dipakai ulang. Diganti premium_order_pay_get (kepemilikan
-- sudah diperiksa Edge Function). Gambar QR yang tampil di halaman SociaBuzz juga disimpan, supaya QRIS yang SAMA bisa
-- ditampilkan lagi walau aplikasi tertutup / dimuat ulang.
-- ============================================================================================
alter table public.premium_orders add column if not exists pay_qr text;

create or replace function public.premium_order_pay_get(p_order text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('pay_url', o.pay_url, 'pay_qr', o.pay_qr, 'status', o.status)
    from public.premium_orders o where o.order_id = p_order and o.provider = 'sociabuzz';
$$;
revoke all on function public.premium_order_pay_get(text) from public, anon, authenticated;
grant execute on function public.premium_order_pay_get(text) to service_role;

create or replace function public.premium_order_set_qr(p_order text, p_user uuid, p_qr text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_qr is null or char_length(p_qr) > 400000 or p_qr !~ '^(data:image/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+|https://[^[:space:]]+)$' then return; end if;
  update public.premium_orders set pay_qr = p_qr
   where order_id = p_order and user_id = p_user and provider = 'sociabuzz' and status = 'pending';
end; $$;
revoke all on function public.premium_order_set_qr(text, uuid, text) from public, anon, authenticated;
grant execute on function public.premium_order_set_qr(text, uuid, text) to service_role;

-- pesanan yang dipakai ulang membawa pay_qr juga
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
