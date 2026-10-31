-- ============================================================================================
-- GIFT PREMIUM DI CHAT GLOBAL
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH premium.sql, chat-global.sql, keamanan.sql, blokir.sql.
--
-- ATURAN KETAT (semua dijaga SERVER, aplikasi hanya menampilkan):
--  1. Pengirim wajib punya Premium AKTIF. Tanpa Premium -> ditolak (NO_PREMIUM).
--  2. Hari yang dikirim harus LEBIH KECIL dari sisa Premium pengirim -> kalau kurang ditolak (NOT_ENOUGH).
--  3. Hari Premium pengirim DIKURANGI sebesar yang dikirim, penerima DITAMBAH jumlah yang sama
--     (total hari di sistem tetap; tidak ada hari "baru" yang tercipta, tidak ada bonus WakuGold).
--  4. Satu gift 1-30 hari. Maks 10 gift & 60 hari per 24 jam per pengirim. Jeda 20 detik antar gift.
--  5. Tidak bisa ke diri sendiri, ke akun yang diblokir, atau ke penerima yang masa Premiumnya jadi > 365 hari.
--  6. Pengurangan + penambahan + catatan + kartu chat terjadi dalam SATU transaksi (semua berhasil atau tidak sama sekali).
--  7. Kartu gift di chat HANYA bisa dibuat oleh fungsi ini; kiriman biasa dari aplikasi dipaksa jadi pesan teks.
--  8. Setiap gift tercatat permanen di tabel premium_gifts (terkunci dari aplikasi).
-- ============================================================================================

-- ---------- Jenis pesan chat: teks biasa / kartu gift ----------
alter table public.global_messages add column if not exists kind text not null default 'text';
alter table public.global_messages add column if not exists meta jsonb;
do $$ begin
  alter table public.global_messages add constraint global_messages_kind_chk check (kind in ('text', 'gift'));
exception when duplicate_object then null; end $$;

-- Pengguna hanya boleh mengirim pesan 'text' tanpa meta. Kartu gift hanya lewat fungsi server di bawah.
drop policy if exists "gchat insert own" on public.global_messages;
create policy "gchat insert own" on public.global_messages for insert to authenticated
  with check ((select auth.uid()) = user_id and kind = 'text' and meta is null);

-- ---------- Catatan gift ----------
create table if not exists public.premium_gifts (
  id            bigint generated always as identity primary key,
  from_user     uuid not null references auth.users(id) on delete cascade,
  to_user       uuid not null references auth.users(id) on delete cascade,
  days          int  not null check (days between 1 and 30),
  from_old      timestamptz not null,
  from_new      timestamptz not null,
  to_old        timestamptz,
  to_new        timestamptz not null,
  created_at    timestamptz not null default now()
);
create index if not exists premium_gifts_from on public.premium_gifts (from_user, created_at desc);
alter table public.premium_gifts enable row level security;
revoke all on public.premium_gifts from anon, authenticated;

-- ---------- Info untuk popup (sisa Premium + batas harian) ----------
create or replace function public.premium_gift_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); s public.premium_members; d int; c int;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  select * into s from public.premium_members where user_id = me;
  select coalesce(sum(days), 0), count(*) into d, c from public.premium_gifts where from_user = me and created_at > now() - interval '24 hours';
  return jsonb_build_object(
    'active', coalesce(s.expires_at > now(), false),
    'left_days', case when s.expires_at > now() then round((extract(epoch from s.expires_at - now()) / 86400)::numeric, 2) else 0 end,
    'max_per_gift', 30, 'days_left_today', greatest(60 - d, 0), 'gifts_left_today', greatest(10 - c, 0));
end; $$;
revoke all on function public.premium_gift_info() from public, anon;
grant execute on function public.premium_gift_info() to authenticated;

-- ---------- KIRIM GIFT ----------
create or replace function public.premium_gift_send(p_to uuid, p_days int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  s public.premium_members; r public.premium_members;
  left_d numeric; used_d int; used_c int;
  base timestamptz; r_new timestamptz; s_new timestamptz; nm text; mid bigint;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if p_to is null or p_to = me then return jsonb_build_object('ok', false, 'code', 'SELF'); end if;
  if p_days is null or p_days < 1 or p_days > 30 then return jsonb_build_object('ok', false, 'code', 'BAD_DAYS'); end if;
  if public.is_banned(me) then return jsonb_build_object('ok', false, 'code', 'BANNED'); end if;
  if not exists (select 1 from auth.users where id = p_to) or public.is_banned(p_to) then
    return jsonb_build_object('ok', false, 'code', 'NO_TARGET');
  end if;

  -- kunci: satu gift per pengirim dalam satu waktu + kunci baris Premium kedua pihak (urut id, mencegah saling tunggu)
  perform pg_advisory_xact_lock(hashtext('gift:' || me::text));
  perform 1 from public.premium_members where user_id in (me, p_to) order by user_id for update;

  select * into s from public.premium_members where user_id = me;
  if not found or s.expires_at <= now() then return jsonb_build_object('ok', false, 'code', 'NO_PREMIUM'); end if;
  left_d := extract(epoch from s.expires_at - now()) / 86400;
  if left_d <= p_days then return jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH', 'left_days', round(left_d::numeric, 2)); end if;

  if exists (select 1 from public.premium_gifts where from_user = me and created_at > now() - interval '20 seconds') then
    return jsonb_build_object('ok', false, 'code', 'TOO_FAST');
  end if;
  select coalesce(sum(days), 0), count(*) into used_d, used_c from public.premium_gifts where from_user = me and created_at > now() - interval '24 hours';
  if used_c >= 10 then return jsonb_build_object('ok', false, 'code', 'LIMIT_COUNT'); end if;
  if used_d + p_days > 60 then return jsonb_build_object('ok', false, 'code', 'LIMIT_DAYS', 'days_left_today', greatest(60 - used_d, 0)); end if;

  select * into r from public.premium_members where user_id = p_to;
  base := case when found and r.expires_at > now() then r.expires_at else now() end;
  r_new := base + make_interval(days => p_days);
  if r_new > now() + interval '365 days' then return jsonb_build_object('ok', false, 'code', 'TARGET_FULL'); end if;
  s_new := s.expires_at - make_interval(days => p_days);

  -- 1) kurangi pengirim  2) tambah penerima  3) catat  4) kartu chat  (satu transaksi)
  update public.premium_members set expires_at = s_new, updated_at = now() where user_id = me;
  insert into public.premium_members (user_id, started_at, expires_at, plan_id, updated_at)
  values (p_to, now(), r_new, 'gift', now())
  on conflict (user_id) do update
     set expires_at = excluded.expires_at, updated_at = now(),
         started_at = case when public.premium_members.expires_at > now() then public.premium_members.started_at else now() end;
  insert into public.premium_gifts (from_user, to_user, days, from_old, from_new, to_old, to_new)
  values (me, p_to, p_days, s.expires_at, s_new, r.expires_at, r_new);

  select left(btrim(regexp_replace(coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''),
                                            nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)), '[^[:alnum:] ]', '', 'g')), 20)
    into nm from auth.users u where u.id = p_to;
  insert into public.global_messages (user_id, body, kind, meta)
  values (me, 'Gift Premium', 'gift', jsonb_build_object('to_id', p_to, 'to_name', coalesce(nullif(nm, ''), 'User'), 'days', p_days))
  returning id into mid;

  return jsonb_build_object('ok', true, 'msg_id', mid, 'days', p_days, 'left_days', round((extract(epoch from s_new - now()) / 86400)::numeric, 2));
end; $$;
revoke all on function public.premium_gift_send(uuid, int) from public, anon;
grant execute on function public.premium_gift_send(uuid, int) to authenticated;
