-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan PALING AKHIR, setelah semua file clan lain (wakugames-clan, clan-v2, clan-xp-hanya-gold, clan-tier-terkunci,
-- clan-dev-xp-tier15, clan-daily, chat-clan). JANGAN jalankan ulang file clan lama setelah ini (akan menimpa aturan role).
--
-- ROLE CLAN (dari tertinggi): Leader > Vice Leader > Admiral > Officer > Member
--
--   Leader       : semua fitur. Satu-satunya yang bisa: bubarkan clan, pindahkan kepemimpinan, angkat Vice Leader.
--   Vice Leader  : semua fitur Leader (Shop, Gacha warna, mode gabung, terima/tolak, kick, atur role)
--                  KECUALI bubarkan clan, pindahkan kepemimpinan, dan mengangkat Vice Leader.
--   Admiral      : terima/tolak permintaan masuk, kick, dan mengangkat Member -> Officer.
--   Officer      : hanya terima/tolak permintaan masuk dan kick.
--   Member       : tidak punya akses kelola.
--
-- ATURAN KETAT (semua dijaga SERVER, APK yang dimodifikasi pun tidak bisa menembusnya):
--   1. Tidak ada yang bisa mengubah role dirinya sendiri.
--   2. Kick & ubah role hanya ke anggota yang pangkatnya LEBIH RENDAH dari pemanggil (setara / lebih tinggi ditolak).
--   3. Role Leader tidak bisa diubah lewat fitur role (hanya lewat Pindahkan Kepemimpinan oleh Leader).
--   4. Vice Leader hanya bisa diangkat oleh Leader. Admiral hanya bisa mengangkat Member menjadi Officer.
--   5. Kolom role di tabel hanya bisa berubah lewat fungsi resmi (trigger penjaga). Tabel juga terkunci dari client (RLS).
--   6. Setiap aksi dicek ulang di server saat dijalankan dengan clan terkunci (aman dari klik bersamaan / balapan).
--   7. Keluar / dikeluarkan lalu gabung lagi = kembali jadi Member. Maksimal 1 Leader per clan (indeks unik).
--   8. Semua ubah role / kick / pindah Leader dicatat di clan_role_log (audit).

-- ============================================================ 1) KOLOM ROLE: 5 NILAI
do $$ declare r record; begin
  for r in select conname from pg_constraint
            where conrelid = 'public.clan_members'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%'
  loop execute format('alter table public.clan_members drop constraint %I', r.conname); end loop;
end $$;
alter table public.clan_members add constraint clan_members_role_check
  check (role in ('leader', 'vice_leader', 'admiral', 'officer', 'member'));

create unique index if not exists clan_one_leader on public.clan_members (clan_id) where role = 'leader';

-- ============================================================ 2) PANGKAT & PENJAGA AKSES
create or replace function public.clan_rank(p_role text) returns int
language sql immutable as $$
  select case p_role when 'leader' then 5 when 'vice_leader' then 4 when 'admiral' then 3 when 'officer' then 2 else 1 end
$$;

-- Pemanggil harus anggota clan dengan pangkat >= p_min. Baris clan dikunci (anti balapan).
create or replace function public.clan_lock_rank(p_uid uuid, p_min int, p_msg text) returns public.clans
language plpgsql security definer set search_path = public as $$
declare c public.clans; cid bigint := public.clan_my_id(p_uid); r text;
begin
  if cid is null then raise exception 'Kamu belum punya clan'; end if;
  select * into c from public.clans where id = cid for update;
  select role into r from public.clan_members where user_id = p_uid and clan_id = cid;
  if r is null or public.clan_rank(r) < p_min then raise exception '%', p_msg; end if;
  return c;
end; $$;

-- "Fitur Leader": Leader ATAU Vice Leader. Semua fungsi lama (Shop slot/tier, spin & pilih warna, mode gabung)
-- memakai fungsi ini, jadi otomatis terbuka untuk Vice Leader tanpa menulis ulang satu per satu.
create or replace function public.clan_lock_as_leader(p_uid uuid) returns public.clans
language plpgsql security definer set search_path = public as $$
begin
  return public.clan_lock_rank(p_uid, 4, 'Hanya Leader atau Vice Leader yang bisa melakukan ini');
end; $$;

-- Khusus Leader asli (bubarkan clan, pindahkan kepemimpinan)
create or replace function public.clan_lock_as_owner(p_uid uuid) returns public.clans
language plpgsql security definer set search_path = public as $$
declare c public.clans;
begin
  c := public.clan_lock_rank(p_uid, 5, 'Hanya Leader yang bisa melakukan ini');
  if c.leader is distinct from p_uid then raise exception 'Hanya Leader yang bisa melakukan ini'; end if;
  return c;
end; $$;

revoke all on function public.clan_rank(text), public.clan_lock_rank(uuid, int, text),
  public.clan_lock_as_leader(uuid), public.clan_lock_as_owner(uuid) from public, anon, authenticated;

-- ============================================================ 3) PENJAGA KOLOM ROLE
create or replace function public.clan_members_role_guard() returns trigger
language plpgsql as $$
begin
  if (new.role is distinct from old.role or new.clan_id is distinct from old.clan_id or new.user_id is distinct from old.user_id)
     and auth.uid() is not null and coalesce(current_setting('wp.clan_role', true), '') <> '1' then
    raise exception 'Role hanya bisa diubah lewat fitur resmi clan';
  end if;
  return new;
end; $$;
drop trigger if exists clan_members_role_guard on public.clan_members;
create trigger clan_members_role_guard before update on public.clan_members
  for each row execute function public.clan_members_role_guard();
-- (Kamu sebagai pemilik database tetap bisa mengubah manual lewat SQL Editor: di sana auth.uid() kosong.)

-- ============================================================ 4) AUDIT
create table if not exists public.clan_role_log (
  id         bigint generated always as identity primary key,
  clan_id    bigint not null references public.clans(id),
  actor      uuid not null,
  target     uuid not null,
  action     text not null,          -- 'role' | 'kick' | 'transfer'
  old_role   text,
  new_role   text,
  created_at timestamptz not null default now()
);
create index if not exists clan_role_log_clan on public.clan_role_log (clan_id, created_at desc);
alter table public.clan_role_log enable row level security;
revoke all on public.clan_role_log from anon, authenticated;

-- ============================================================ 5) ATUR ROLE
create or replace function public.clan_set_role(p_user uuid, p_role text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.clans; mine text; theirs text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_user is null or p_role is null then raise exception 'Data tidak lengkap'; end if;
  if p_role not in ('vice_leader', 'admiral', 'officer', 'member') then raise exception 'Role tidak valid'; end if;
  if p_user = me then raise exception 'Tidak bisa mengubah role sendiri'; end if;

  c := public.clan_lock_rank(me, 3, 'Kamu tidak punya izin mengubah role');          -- Admiral ke atas
  select role into mine from public.clan_members where user_id = me and clan_id = c.id;
  select role into theirs from public.clan_members where user_id = p_user and clan_id = c.id for update;
  if theirs is null then raise exception 'Bukan anggota clan ini'; end if;
  if theirs = 'leader' then raise exception 'Role Leader tidak bisa diubah'; end if;
  if theirs = p_role then raise exception 'Role anggota ini sudah sama'; end if;
  if public.clan_rank(theirs) >= public.clan_rank(mine) then
    raise exception 'Kamu hanya bisa mengubah role anggota yang pangkatnya di bawahmu';
  end if;

  if mine = 'vice_leader' and p_role = 'vice_leader' then
    raise exception 'Hanya Leader yang bisa mengangkat Vice Leader';
  elsif mine = 'admiral' and not (theirs = 'member' and p_role = 'officer') then
    raise exception 'Admiral hanya bisa mengangkat Member menjadi Officer';
  end if;
  -- (Leader boleh memberi vice_leader / admiral / officer / member)

  perform set_config('wp.clan_role', '1', true);
  update public.clan_members set role = p_role where user_id = p_user and clan_id = c.id;
  perform set_config('wp.clan_role', '', true);
  insert into public.clan_role_log (clan_id, actor, target, action, old_role, new_role) values (c.id, me, p_user, 'role', theirs, p_role);
  return p_role;
end; $$;
revoke all on function public.clan_set_role(uuid, text) from public, anon;
grant execute on function public.clan_set_role(uuid, text) to authenticated;

-- ============================================================ 6) KICK (Officer ke atas, hanya ke pangkat di bawahnya)
create or replace function public.clan_kick(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.clans; mine text; theirs text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  c := public.clan_lock_rank(me, 2, 'Kamu tidak punya izin mengeluarkan anggota');   -- Officer ke atas
  if p_user is null or p_user = me then raise exception 'Tidak bisa mengeluarkan diri sendiri'; end if;
  select role into mine from public.clan_members where user_id = me and clan_id = c.id;
  select role into theirs from public.clan_members where user_id = p_user and clan_id = c.id for update;
  if theirs is null then raise exception 'Bukan anggota clan ini'; end if;
  if public.clan_rank(theirs) >= public.clan_rank(mine) then
    raise exception 'Kamu hanya bisa mengeluarkan anggota yang pangkatnya di bawahmu';
  end if;
  perform public.clan_remove_member(p_user);
  insert into public.clan_role_log (clan_id, actor, target, action, old_role, new_role) values (c.id, me, p_user, 'kick', theirs, null);
end; $$;
revoke all on function public.clan_kick(uuid) from public, anon;
grant execute on function public.clan_kick(uuid) to authenticated;

-- ============================================================ 7) TERIMA / TOLAK PERMINTAAN MASUK (Officer ke atas)
create or replace function public.clan_request_respond(p_id bigint, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.clans; r public.clan_requests;
begin
  if me is null then raise exception 'not authenticated'; end if;
  c := public.clan_lock_rank(me, 2, 'Kamu tidak punya izin memproses permintaan masuk');
  select * into r from public.clan_requests where id = p_id and clan_id = c.id for update;
  if not found then raise exception 'Permintaan tidak ditemukan'; end if;
  if p_accept then
    perform public.clan_add_member(c.id, r.user_id);      -- masuk selalu sebagai Member
  else
    delete from public.clan_requests where id = p_id;
  end if;
end; $$;
revoke all on function public.clan_request_respond(bigint, boolean) from public, anon;
grant execute on function public.clan_request_respond(bigint, boolean) to authenticated;

-- ============================================================ 8) KHUSUS LEADER: PINDAH KEPEMIMPINAN & BUBARKAN
create or replace function public.clan_transfer(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.clans; theirs text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  c := public.clan_lock_as_owner(me);
  if p_user is null or p_user = me then raise exception 'Pilih anggota lain'; end if;
  select role into theirs from public.clan_members where user_id = p_user and clan_id = c.id for update;
  if theirs is null then raise exception 'Bukan anggota clan ini'; end if;
  perform set_config('wp.clan_role', '1', true);
  update public.clan_members set role = 'member' where user_id = me and clan_id = c.id;      -- Leader lama jadi Member
  update public.clan_members set role = 'leader' where user_id = p_user and clan_id = c.id;
  perform set_config('wp.clan_role', '', true);
  update public.clans set leader = p_user where id = c.id;
  insert into public.clan_role_log (clan_id, actor, target, action, old_role, new_role) values (c.id, me, p_user, 'transfer', theirs, 'leader');
end; $$;
revoke all on function public.clan_transfer(uuid) from public, anon;
grant execute on function public.clan_transfer(uuid) to authenticated;

create or replace function public.clan_disband() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.clans;
begin
  if me is null then raise exception 'not authenticated'; end if;
  c := public.clan_lock_as_owner(me);                      -- Vice Leader TIDAK bisa membubarkan
  if (select count(*) from public.clan_members where clan_id = c.id) > 1 then raise exception 'Keluarkan semua anggota lain dulu'; end if;
  update public.clans set disbanded_at = now() where id = c.id;
  delete from public.clan_members where clan_id = c.id;
  delete from public.clan_requests where clan_id = c.id;
end; $$;
revoke all on function public.clan_disband() from public, anon;
grant execute on function public.clan_disband() to authenticated;

-- ============================================================ 9) BACA DATA (menyesuaikan role baru)
create or replace function public.clan_detail(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.clans; tx numeric; lv int; n int; mine text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into c from public.clans where id = p_id and disbanded_at is null;
  if not found then return null; end if;
  tx := public.clan_total_xp(c.id); lv := public.clan_level(tx);
  select count(*) into n from public.clan_members where clan_id = c.id;
  select role into mine from public.clan_members where clan_id = c.id and user_id = me;
  return jsonb_build_object(
    'id', c.id, 'tag', c.tag, 'name', c.name, 'tier', c.tier, 'color', public.clan_color_json(c.color_id),
    'slots', c.slots, 'members', n, 'xp_available', c.xp_available, 'total_xp', tx,
    'level', lv, 'lvl_start', 50 * lv * (lv - 1), 'lvl_next', 50 * (lv + 1) * lv, 'join_mode', c.join_mode, 'leader', c.leader,
    'my_role', mine,
    'my_clan', public.clan_my_id(me),
    'my_request', exists (select 1 from public.clan_requests where clan_id = c.id and user_id = me),
    'pending', case when mine is not null and public.clan_rank(mine) >= 2 then (select count(*) from public.clan_requests where clan_id = c.id) else 0 end);
end; $$;
revoke all on function public.clan_detail(bigint) from public, anon;
grant execute on function public.clan_detail(bigint) to authenticated;

create or replace function public.clan_requests_list(p_clan bigint)
returns table (id bigint, user_id uuid, name text, avatar text, seq bigint, xp numeric, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.user_id, public.wp_name(r.user_id), u.raw_user_meta_data->>'avatar_url', p.seq, coalesce(x.xp, 0), r.created_at
    from public.clan_requests r
    join auth.users u on u.id = r.user_id
    left join public.profiles p on p.user_id = r.user_id
    left join public.user_xp x on x.user_id = r.user_id
   where r.clan_id = p_clan
     and exists (select 1 from public.clan_members m                       -- hanya Officer ke atas yang melihat
                  where m.user_id = auth.uid() and m.clan_id = p_clan and public.clan_rank(m.role) >= 2)
   order by r.created_at asc limit 100;
$$;
revoke all on function public.clan_requests_list(bigint) from public, anon;
grant execute on function public.clan_requests_list(bigint) to authenticated;

create or replace function public.clan_members_list(p_clan bigint, p_q text default null)
returns table (user_id uuid, name text, avatar text, seq bigint, role text, xp numeric, contrib numeric, donated_gold bigint, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, public.wp_name(m.user_id), u.raw_user_meta_data->>'avatar_url', p.seq, m.role,
         coalesce(x.xp, 0), m.donated_xp::numeric, m.donated_gold, m.joined_at
    from public.clan_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    left join public.user_xp x on x.user_id = m.user_id
   where auth.uid() is not null and m.clan_id = p_clan
     and (p_q is null or btrim(p_q) = ''
          or position(lower(btrim(p_q)) in lower(public.wp_name(m.user_id))) > 0
          or p.seq::text = regexp_replace(btrim(p_q), '^#', ''))
   order by public.clan_rank(m.role) desc, 7 desc, m.joined_at asc
   limit 200;
$$;
revoke all on function public.clan_members_list(bigint, text) from public, anon;
grant execute on function public.clan_members_list(bigint, text) to authenticated;

-- ============================================================ 10) CHAT CLAN: Vice Leader ikut bisa hapus pesan
create or replace function public.clan_chat_leader(p_clan bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clan_members m join public.clans c on c.id = m.clan_id
                  where m.user_id = auth.uid() and m.clan_id = p_clan and m.role in ('leader', 'vice_leader') and c.disbanded_at is null);
$$;
revoke all on function public.clan_chat_leader(bigint) from public, anon;
grant execute on function public.clan_chat_leader(bigint) to authenticated;
