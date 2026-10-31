-- ===== Giveaway Premium TANPA LIMIT =====
-- Jalankan SEKALI di Supabase > SQL Editor (aman diulang). Tidak mengubah tabel / data, hanya mengganti 2 fungsi.
-- Dihapus : maks 3 giveaway per 24 jam, maks 2 giveaway berjalan, maks 5 klaim per 24 jam.
-- Tetap   : jeda 30 detik antar pembuatan giveaway (anti klik ganda), hari Premium pembuat harus cukup, hari per hadiah 1-30, jumlah hadiah 1-50,
--           satu orang hanya bisa klaim satu kali per giveaway, tidak bisa klaim giveaway sendiri, Premium penerima maks 365 hari, akun diblokir ditolak.
-- Catatan : biaya-gift.sql dan giveaway-premium.sql di folder ini sudah diperbarui, jadi menjalankan ulang keduanya tidak mengembalikan limit.

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

create or replace function public.giveaway_claim(p_gid bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.giveaways; r public.premium_members; base timestamptz; r_new timestamptz;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if public.is_banned(me) then return jsonb_build_object('ok', false, 'code', 'BANNED'); end if;

  select * into g from public.giveaways where id = p_gid for update;           -- kunci giveaway: kuota aman dari klaim serempak
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if g.status = 'open' and g.expires_at <= now() then perform public.giveaway_settle_one(g); return jsonb_build_object('ok', false, 'code', 'EXPIRED'); end if;
  if g.status = 'ended' then return jsonb_build_object('ok', false, 'code', 'EXPIRED'); end if;
  if g.creator = me then return jsonb_build_object('ok', false, 'code', 'SELF'); end if;
  if exists (select 1 from public.giveaway_claims where giveaway_id = g.id and user_id = me) then return jsonb_build_object('ok', false, 'code', 'ALREADY'); end if;
  if g.claimed >= g.slots then return jsonb_build_object('ok', false, 'code', 'FULL'); end if;
  -- (batas klaim per 24 jam sudah dihapus: klaim tanpa limit)

  select * into r from public.premium_members where user_id = me for update;
  base := case when found and r.expires_at > now() then r.expires_at else now() end;
  r_new := base + make_interval(days => g.days);
  if r_new > now() + interval '365 days' then return jsonb_build_object('ok', false, 'code', 'TARGET_FULL'); end if;

  insert into public.giveaway_claims (giveaway_id, user_id, days) values (g.id, me, g.days);
  update public.giveaways set claimed = claimed + 1, status = case when claimed + 1 >= slots then 'done' else status end where id = g.id;
  insert into public.premium_members (user_id, started_at, expires_at, plan_id, updated_at) values (me, now(), r_new, 'giveaway', now())
  on conflict (user_id) do update set expires_at = excluded.expires_at, updated_at = now(),
     started_at = case when public.premium_members.expires_at > now() then public.premium_members.started_at else now() end;
  return jsonb_build_object('ok', true, 'days', g.days, 'claimed', g.claimed + 1, 'slots', g.slots);
end; $$;
revoke all on function public.giveaway_claim(bigint) from public, anon;
grant execute on function public.giveaway_claim(bigint) to authenticated;
