-- ===== Giveaway Premium: MINIMAL 5 ORANG =====
-- Jalankan SEKALI di Supabase > SQL Editor (aman diulang). Tidak mengubah data lama.
-- Aturan baru: giveaway hanya bisa untuk 5 sampai 50 orang. Untuk 1, 2, 3, 4 orang gunakan Gift Premium.
-- Dijaga di 2 lapis server (bukan hanya tampilan aplikasi):
--   1. giveaway_create menolak jumlah hadiah < 5 dengan kode MIN_SLOTS, SEBELUM Premium pembuat dipotong.
--   2. trigger pada tabel giveaways menolak INSERT langsung dengan slots < 5.
-- Aman untuk giveaway lama: trigger hanya berlaku saat INSERT, jadi giveaway lama yang masih berjalan (misal 3 orang)
-- tetap bisa diklaim dan tetap dikembalikan sisanya saat berakhir tanpa error.
-- Aturan lain tidak berubah: hari per hadiah 1-30, maks 50 orang, jeda 30 detik, biaya gift, 24 jam, 1 klaim per orang, tidak bisa klaim sendiri.

create or replace function public.giveaways_min_slots() returns trigger
language plpgsql as $$
begin
  if new.slots is null or new.slots < 5 then raise exception 'Giveaway minimal 5 orang' using errcode = '23514'; end if;
  return new;
end; $$;
drop trigger if exists giveaways_min_slots_trg on public.giveaways;
create trigger giveaways_min_slots_trg before insert on public.giveaways for each row execute function public.giveaways_min_slots();

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
