-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan SETELAH premium-bonus-top.sql (dan file premium lain). Hanya mengganti premium_overview().
--
-- Isi: sisa waktu Premium dihitung di SERVER (jam server now(), bukan jam HP), jadi tidak bisa diakali dengan
-- mengubah tanggal/jam HP atau mengubah kode aplikasi. Aplikasi hanya MENAMPILKAN teks dari server.
--   me.seconds_left  = sisa detik (0 kalau sudah habis)
--   me.days_left     = sisa hari dibulatkan ke atas (0 kalau habis / < 1 hari)
--   me.left_text     = "Tinggal 15 hari lagi" | "Tinggal 5 jam lagi" | "Tinggal 20 menit lagi" | "Sudah berakhir"
create or replace function public.premium_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'server_now', now(),
    'benefits', coalesce((select benefits from public.premium_settings where id = 1), ''),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'days', p.days, 'price', p.price, 'bonus_gold', p.bonus_gold) order by p.sort, p.price)
                         from public.premium_plans p where p.active), '[]'::jsonb),
    'me', (select jsonb_build_object(
             'active', m.expires_at > now(),
             'started_at', m.started_at,
             'expires_at', m.expires_at,
             'plan_id', m.plan_id,
             'plan_name', (select name from public.premium_plans pp where pp.id = m.plan_id),
             'seconds_left', greatest(0, floor(extract(epoch from (m.expires_at - now()))))::bigint,
             'days_left', case when m.expires_at > now() and m.expires_at - now() >= interval '1 day'
                               then ceil(extract(epoch from (m.expires_at - now())) / 86400)::int else 0 end,
             'left_text', case
               when m.expires_at <= now() then 'Sudah berakhir'
               when m.expires_at - now() >= interval '1 day'
                 then 'Tinggal ' || ceil(extract(epoch from (m.expires_at - now())) / 86400)::int || ' hari lagi'
               when m.expires_at - now() >= interval '1 hour'
                 then 'Tinggal ' || ceil(extract(epoch from (m.expires_at - now())) / 3600)::int || ' jam lagi'
               else 'Tinggal ' || greatest(1, ceil(extract(epoch from (m.expires_at - now())) / 60)::int) || ' menit lagi'
             end)
             from public.premium_members m where m.user_id = auth.uid())
  ) where auth.uid() is not null;
$$;
revoke all on function public.premium_overview() from public, anon;
grant execute on function public.premium_overview() to authenticated;
