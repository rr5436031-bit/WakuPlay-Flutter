-- ============================================================================================
-- PERBAIKAN NOTIFIKASI ANIME BARU / EPISODE BARU (muncul di bilah notifikasi HP)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan PALING AKHIR, setelah notifikasi-supabase.sql dan anime-baru-notif.sql.
--
-- 1. Daftar jenis notifikasi dikunci lagi LENGKAP. Beberapa file lama (push.sql, lapor-request-tag.sql) menimpa daftar ini
--    tanpa 'new_anime' / 'reply' / 'clan_request'; kalau salah satunya dijalankan belakangan, notifikasi anime baru ditolak database.
-- 2. notif_poll: kalau ada lebih dari 15 notifikasi tertunda, penanda waktu hanya maju sampai notifikasi ke-15 yang dikirim,
--    sisanya muncul di pengecekan berikutnya (sebelumnya sisanya hilang).
-- ============================================================================================

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('friend_request', 'friend_accept', 'dm', 'episode', 'mention', 'reply', 'clan_request', 'new_anime'));

create or replace function public.notif_poll(p_device uuid, p_secret text, p_since timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.notif_devices; items jsonb; cur timestamptz; cnt int; lastc timestamptz;
begin
  if p_device is null or p_secret is null or char_length(p_secret) < 32 or char_length(p_secret) > 200 then return jsonb_build_object('ok', false); end if;
  select * into d from public.notif_devices where device_id = p_device;
  if not found or d.secret_hash <> encode(sha256(convert_to(p_secret, 'UTF8')), 'hex') then return jsonb_build_object('ok', false); end if;
  p_since := greatest(coalesce(p_since, now() - interval '1 hour'), now() - interval '3 days');
  update public.notif_devices set last_poll_at = now() where device_id = d.device_id and (last_poll_at is null or last_poll_at < now() - interval '1 minute');
  select max(created_at) into cur from public.notifications where user_id = d.user_id and created_at > p_since;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'type', x.type, 'title', x.title, 'body', x.body, 'data', x.data, 'created_at', x.created_at) order by x.created_at), '[]'::jsonb),
         count(*), max(x.created_at)
    into items, cnt, lastc
    from (select n.* from public.notifications n
           where n.user_id = d.user_id and n.read_at is null and n.created_at > p_since
             and coalesce((d.prefs ->> public.notif_pref_key(n.type))::boolean, true)
           order by n.created_at asc limit 15) x;
  return jsonb_build_object('ok', true, 'items', items, 'cursor', case when cnt >= 15 then lastc else coalesce(cur, p_since) end);
end; $$;
revoke all on function public.notif_poll(uuid, text, timestamptz) from public;
grant execute on function public.notif_poll(uuid, text, timestamptz) to anon, authenticated;

-- Cek cepat (opsional, jalankan terpisah):
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'notifications_type_check';     -- harus memuat 'new_anime'
-- select type, count(*), max(created_at) from public.notifications group by 1;                          -- notifikasi anime/episode yang sudah dibuat
-- select device_id, user_id, last_poll_at from public.notif_devices;                                    -- perangkat yang aktif polling

notify pgrst, 'reload schema';
