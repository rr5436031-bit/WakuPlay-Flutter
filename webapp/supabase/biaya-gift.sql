-- ============================================================================================
-- BIAYA GIFT (giveaway "hari x orang" dan gift langsung ke satu orang)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH gift-premium.sql dan giveaway-premium.sql. Tidak menghapus / mengubah struktur lama:
-- hanya menambah tabel gift_fee_tiers, kolom fee_hours (default 0), dan mengganti isi 3 fungsi (create or replace).
--
-- ATURAN (semua dijaga SERVER)
--  1. Pengirim dipotong: hari yang dikirim + BIAYA. Penerima tetap menerima hanya hari yang dikirim.
--     Contoh: gift 1 hari x 1 orang -> dipotong 1 hari 5 jam.
--  2. Biaya dihitung dari TOTAL hari (hari x jumlah orang), PROGRESIF: makin besar totalnya, makin tinggi persen
--     biaya pada bagian yang naik (seperti pajak bertingkat, tanpa lonjakan mendadak). Tarif bawaan di tabel gift_fee_tiers:
--        total   0 -  5 hari : 20%      total  5 - 15 hari : 25%
--        total  15 - 30 hari : 30%      total  di atas 30  : 35%     (diturunkan oleh gift-xp.sql)
--     Biaya dibulatkan ke atas per jam. Ubah tarif lewat Table Editor (tabel gift_fee_tiers) tanpa deploy ulang aplikasi.
--  3. Syarat lama tetap: sisa Premium pengirim harus LEBIH BESAR dari total potongan (hari + biaya).
--  4. Giveaway yang tidak terklaim sampai habis waktu: yang dikembalikan hanya HARI hadiah yang tidak terklaim.
--     Biaya adalah ongkos layanan dan tidak dikembalikan.
--  5. Top Giver / lencana tidak berubah: tetap menghitung hari yang benar-benar DITERIMA orang lain (biaya tidak dihitung).
--  6. Batas harian gift (10 gift / 60 hari) tetap menghitung hari yang dikirim saja, tanpa biaya.
-- ============================================================================================

-- ---------- 1) Tarif biaya (bisa diubah) ----------
create table if not exists public.gift_fee_tiers (
  from_days numeric primary key check (from_days >= 0),      -- tier berlaku untuk total hari mulai dari angka ini
  rate      numeric not null check (rate >= 0 and rate <= 5)  -- 0.5 = biaya 50% dari bagian hari di tier ini
);
insert into public.gift_fee_tiers (from_days, rate) values (0, 0.20), (5, 0.25), (15, 0.30), (30, 0.35)
on conflict (from_days) do nothing;
alter table public.gift_fee_tiers enable row level security;
revoke all on public.gift_fee_tiers from anon, authenticated;

-- ---------- 2) Kolom pencatat biaya (data lama = 0) ----------
alter table public.giveaways add column if not exists fee_hours int not null default 0;
alter table public.premium_gifts add column if not exists fee_hours int not null default 0;

-- ---------- 3) Hitung biaya (jam) dari total hari, progresif ----------
create or replace function public.gift_fee_hours(p_total numeric) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(ceil(sum(greatest(least(p_total, coalesce(t.hi, 1000000)) - t.lo, 0) * t.rate) * 24), 0)::int
    from (select from_days as lo, rate, lead(from_days) over (order by from_days) as hi from public.gift_fee_tiers) t;
$$;
revoke all on function public.gift_fee_hours(numeric) from public, anon;
grant execute on function public.gift_fee_hours(numeric) to authenticated;

-- ---------- 4) Info popup: sekarang + tarif biaya (aplikasi menghitung pratinjau; server tetap penentu) ----------
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
    'max_per_gift', 30, 'days_left_today', greatest(60 - d, 0), 'gifts_left_today', greatest(10 - c, 0),
    'fee_tiers', coalesce((select jsonb_agg(jsonb_build_object('from', t.from_days, 'rate', t.rate) order by t.from_days) from public.gift_fee_tiers t), '[]'::jsonb));
end; $$;
revoke all on function public.premium_gift_info() from public, anon;
grant execute on function public.premium_gift_info() to authenticated;

-- ---------- 5) KIRIM GIFT (dengan biaya) ----------
create or replace function public.premium_gift_send(p_to uuid, p_days int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  s public.premium_members; r public.premium_members;
  left_d numeric; used_d int; used_c int; fee_h int; cost_d numeric;
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
  fee_h := public.gift_fee_hours(p_days);                                -- biaya gift (jam), naik mengikuti jumlah hari
  cost_d := p_days + fee_h / 24.0;                                       -- total yang dipotong dari pengirim (hari)
  if left_d <= cost_d then return jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH', 'left_days', round(left_d::numeric, 2), 'need', round(cost_d, 2), 'fee_hours', fee_h); end if;

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
  s_new := s.expires_at - make_interval(days => p_days, hours => fee_h);   -- pengirim dipotong hari + biaya; penerima hanya dapat p_days

  -- 1) kurangi pengirim  2) tambah penerima  3) catat  4) kartu chat  (satu transaksi)
  update public.premium_members set expires_at = s_new, updated_at = now() where user_id = me;
  insert into public.premium_members (user_id, started_at, expires_at, plan_id, updated_at)
  values (p_to, now(), r_new, 'gift', now())
  on conflict (user_id) do update
     set expires_at = excluded.expires_at, updated_at = now(),
         started_at = case when public.premium_members.expires_at > now() then public.premium_members.started_at else now() end;
  insert into public.premium_gifts (from_user, to_user, days, fee_hours, from_old, from_new, to_old, to_new)
  values (me, p_to, p_days, fee_h, s.expires_at, s_new, r.expires_at, r_new);

  select left(btrim(regexp_replace(coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''),
                                            nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)), '[^[:alnum:] ]', '', 'g')), 20)
    into nm from auth.users u where u.id = p_to;
  insert into public.global_messages (user_id, body, kind, meta)
  values (me, 'Gift Premium', 'gift', jsonb_build_object('to_id', p_to, 'to_name', coalesce(nullif(nm, ''), 'User'), 'days', p_days))
  returning id into mid;

  return jsonb_build_object('ok', true, 'msg_id', mid, 'days', p_days, 'fee_hours', fee_h, 'left_days', round((extract(epoch from s_new - now()) / 86400)::numeric, 2));
end; $$;
revoke all on function public.premium_gift_send(uuid, int) from public, anon;
grant execute on function public.premium_gift_send(uuid, int) to authenticated;

-- ---------- 6) BUAT GIVEAWAY (dengan biaya) ----------
create or replace function public.giveaway_create(p_days int, p_slots int, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); s public.premium_members; total int; fee_h int; cost_d numeric; left_d numeric; note text; gid bigint; mid bigint; s_new timestamptz;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if p_days is null or p_days < 1 or p_days > 30 or p_slots is null or p_slots < 1 or p_slots > 50 then return jsonb_build_object('ok', false, 'code', 'BAD_INPUT'); end if;
  if p_slots < 5 then return jsonb_build_object('ok', false, 'code', 'MIN_SLOTS'); end if;               -- giveaway minimal 5 orang (1-4 orang pakai Gift Premium)
  if public.is_banned(me) then return jsonb_build_object('ok', false, 'code', 'BANNED'); end if;
  note := left(btrim(regexp_replace(coalesce(p_note, ''), E'[\\x01-\\x1f\\x7f]', ' ', 'g')), 100);

  perform public.giveaway_sweep();
  perform pg_advisory_xact_lock(hashtext('gift:' || me::text));      -- kunci yang sama dengan gift: tidak bisa tabrakan
  select * into s from public.premium_members where user_id = me for update;
  if not found or s.expires_at <= now() then return jsonb_build_object('ok', false, 'code', 'NO_PREMIUM'); end if;
  total := p_days * p_slots;
  left_d := extract(epoch from s.expires_at - now()) / 86400;
  fee_h := public.gift_fee_hours(total);                                 -- biaya gift (jam), naik mengikuti total hari
  cost_d := total + fee_h / 24.0;                                        -- total yang dipotong dari pembuat (hari)
  if left_d <= cost_d then return jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH', 'left_days', round(left_d::numeric, 2), 'need', round(cost_d, 2), 'fee_hours', fee_h); end if;

  if exists (select 1 from public.giveaways where creator = me and created_at > now() - interval '30 seconds') then return jsonb_build_object('ok', false, 'code', 'TOO_FAST'); end if;
  -- (batas jumlah giveaway per 24 jam / yang sedang berjalan sudah dihapus; jeda 30 detik anti-klik-ganda tetap ada)

  s_new := s.expires_at - make_interval(days => total, hours => fee_h);
  update public.premium_members set expires_at = s_new, updated_at = now() where user_id = me;
  insert into public.giveaways (creator, days, slots, fee_hours, note, expires_at) values (me, p_days, p_slots, fee_h, nullif(note, ''), now() + interval '24 hours') returning id into gid;
  insert into public.global_messages (user_id, body, kind, meta)
  values (me, 'Giveaway Premium', 'giveaway', jsonb_build_object('gid', gid, 'days', p_days, 'slots', p_slots, 'note', nullif(note, '')))
  returning id into mid;
  update public.giveaways set message_id = mid where id = gid;
  return jsonb_build_object('ok', true, 'gid', gid, 'fee_hours', fee_h, 'left_days', round((extract(epoch from s_new - now()) / 86400)::numeric, 2));
end; $$;
revoke all on function public.giveaway_create(int, int, text) from public, anon;
grant execute on function public.giveaway_create(int, int, text) to authenticated;
