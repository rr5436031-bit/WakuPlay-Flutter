-- ============================================================================================
-- GIVEAWAY PREMIUM DI CHAT GLOBAL (orang lain bisa klaim)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH gift-premium.sql.
--
-- ATURAN KETAT (semua dijaga SERVER):
--  PEMBUAT
--   1. Wajib punya Premium AKTIF. Total hari (hari per hadiah x jumlah hadiah) harus LEBIH KECIL dari sisa Premium.
--   2. Total hari LANGSUNG DIPOTONG dari Premium pembuat saat giveaway dibuat (ditahan, seperti escrow).
--   3. Hari per hadiah 1-30, jumlah hadiah 1-50. Tanpa batas jumlah giveaway (per hari / yang sedang berjalan). Hanya jeda 30 detik anti-klik-ganda.
--   4. Giveaway berlaku 24 jam. Hadiah yang tidak terklaim DIKEMBALIKAN ke pembuat saat giveaway berakhir
--      (dibereskan otomatis oleh server setiap ada yang membuka chat / mengklaim).
--  PENGKLAIM
--   5. Satu orang hanya bisa klaim SEKALI per giveaway. Pembuat tidak bisa klaim giveaway sendiri.
--   6. Klaim TANPA limit per hari. Akun diblokir ditolak. Premium setelah klaim tidak boleh > 365 hari.
--   7. Klaim memakai kunci baris: kuota tidak mungkin terlewati walau ribuan orang menekan bersamaan.
--  UMUM
--   8. Tidak ada hari baru tercipta (hari berpindah dari pembuat ke penerima) dan tidak ada bonus WakuGold.
--   9. Kartu giveaway di chat hanya bisa dibuat oleh fungsi server ini, dan semua perubahan tercatat permanen.
-- ============================================================================================

alter table public.global_messages drop constraint if exists global_messages_kind_chk;
alter table public.global_messages add constraint global_messages_kind_chk check (kind in ('text', 'gift', 'giveaway'));

create table if not exists public.giveaways (
  id            bigint generated always as identity primary key,
  creator       uuid not null references auth.users(id) on delete cascade,
  days          int  not null check (days between 1 and 30),
  slots         int  not null check (slots between 1 and 50),
  claimed       int  not null default 0,
  note          text,
  message_id    bigint,
  status        text not null default 'open' check (status in ('open', 'done', 'ended')),
  refunded_days int  not null default 0,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);
create index if not exists giveaways_open on public.giveaways (status, expires_at);
create index if not exists giveaways_creator on public.giveaways (creator, created_at desc);

create table if not exists public.giveaway_claims (
  giveaway_id bigint not null references public.giveaways(id) on delete cascade,
  user_id     uuid   not null references auth.users(id) on delete cascade,
  days        int    not null,
  created_at  timestamptz not null default now(),
  primary key (giveaway_id, user_id)
);
create index if not exists giveaway_claims_user on public.giveaway_claims (user_id, created_at desc);

alter table public.giveaways enable row level security;
alter table public.giveaway_claims enable row level security;
revoke all on public.giveaways, public.giveaway_claims from anon, authenticated;
grant select on public.giveaways to authenticated;                 -- hanya baca (untuk kartu realtime); tulis lewat fungsi server
drop policy if exists "giveaways read" on public.giveaways;
create policy "giveaways read" on public.giveaways for select to authenticated using (true);
do $$ begin alter publication supabase_realtime add table public.giveaways; exception when duplicate_object then null; end $$;
alter table public.giveaways replica identity full;

-- ---------- Pembereskan: giveaway kedaluwarsa -> status 'ended' + sisa hadiah dikembalikan ke pembuat ----------
create or replace function public.giveaway_settle_one(g public.giveaways) returns void
language plpgsql security definer set search_path = public as $$
declare back int := (g.slots - g.claimed) * g.days; c public.premium_members;
begin
  update public.giveaways set status = case when claimed >= slots then 'done' else 'ended' end, refunded_days = back where id = g.id;
  if back > 0 then
    select * into c from public.premium_members where user_id = g.creator for update;
    if found and c.expires_at > now() then
      update public.premium_members set expires_at = expires_at + make_interval(days => back), updated_at = now() where user_id = g.creator;
    else
      insert into public.premium_members (user_id, started_at, expires_at, plan_id, updated_at)
      values (g.creator, now(), now() + make_interval(days => back), 'giveaway', now())
      on conflict (user_id) do update set started_at = now(), expires_at = now() + make_interval(days => back), updated_at = now();
    end if;
  end if;
end; $$;
revoke all on function public.giveaway_settle_one(public.giveaways) from public, anon, authenticated;

create or replace function public.giveaway_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare g public.giveaways; n int := 0;
begin
  if auth.uid() is null then return 0; end if;
  for g in select * from public.giveaways where status = 'open' and expires_at <= now() order by expires_at limit 20 for update skip locked loop
    perform public.giveaway_settle_one(g); n := n + 1;
  end loop;
  return n;
end; $$;
revoke all on function public.giveaway_sweep() from public, anon;
grant execute on function public.giveaway_sweep() to authenticated;

-- ---------- Status kartu (untuk tampilan chat) ----------
create or replace function public.giveaway_states(p_ids bigint[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'days', g.days, 'slots', g.slots, 'claimed', g.claimed,
    'status', case when g.status = 'open' and g.expires_at <= now() then 'ended' else g.status end,
    'expires_at', g.expires_at, 'server_now', now(),
    'owner', g.creator = auth.uid(),
    'mine', exists (select 1 from public.giveaway_claims c where c.giveaway_id = g.id and c.user_id = auth.uid())
  )), '[]'::jsonb)
  from public.giveaways g where g.id = any (p_ids[1:100]);
$$;
revoke all on function public.giveaway_states(bigint[]) from public, anon;
grant execute on function public.giveaway_states(bigint[]) to authenticated;

-- ---------- BUAT GIVEAWAY ----------
create or replace function public.giveaway_create(p_days int, p_slots int, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); s public.premium_members; total int; left_d numeric; note text; gid bigint; mid bigint; s_new timestamptz;
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
  if left_d <= total then return jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH', 'left_days', round(left_d::numeric, 2), 'need', total); end if;

  if exists (select 1 from public.giveaways where creator = me and created_at > now() - interval '30 seconds') then return jsonb_build_object('ok', false, 'code', 'TOO_FAST'); end if;
  -- (batas jumlah giveaway per 24 jam / yang sedang berjalan sudah dihapus; jeda 30 detik anti-klik-ganda tetap ada)

  s_new := s.expires_at - make_interval(days => total);
  update public.premium_members set expires_at = s_new, updated_at = now() where user_id = me;
  insert into public.giveaways (creator, days, slots, note, expires_at) values (me, p_days, p_slots, nullif(note, ''), now() + interval '24 hours') returning id into gid;
  insert into public.global_messages (user_id, body, kind, meta)
  values (me, 'Giveaway Premium', 'giveaway', jsonb_build_object('gid', gid, 'days', p_days, 'slots', p_slots, 'note', nullif(note, '')))
  returning id into mid;
  update public.giveaways set message_id = mid where id = gid;
  return jsonb_build_object('ok', true, 'gid', gid, 'left_days', round((extract(epoch from s_new - now()) / 86400)::numeric, 2));
end; $$;
revoke all on function public.giveaway_create(int, int, text) from public, anon;
grant execute on function public.giveaway_create(int, int, text) to authenticated;

-- ---------- KLAIM ----------
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
