-- Pengaturan Clan: mode gabung 3 pilihan (Tertutup / Terbuka / Request) + Banner (background) Clan dari link .gif. Aman diulang.
-- Jalankan SETELAH wakugames-clan.sql dan clan-role.sql.
--
-- ATURAN (semua dijaga SERVER; APK yang dimodifikasi tetap ditolak):
--  Mode gabung
--   1. 'closed'  = Privat/Tertutup: tidak ada yang bisa masuk ATAU mengirim permintaan. Saat diubah ke closed, permintaan yang masih
--                  menunggu dihapus supaya tidak ada yang "nyangkut".
--      'open'    = Terbuka: langsung masuk tanpa request.
--      'request' = masuk lewat permintaan yang disetujui Officer ke atas.
--   2. Yang boleh mengubah mode: hanya Leader & Vice Leader (clan_lock_as_leader). Nilai selain 3 itu ditolak.
--   3. clan_join menolak clan 'closed' dan clan yang penuh, juga user yang sudah punya clan.
--   4. Menerima permintaan lama pada clan 'closed' ditolak (jaga-jaga data lama).
--  Banner clan
--   5. Yang boleh mengubah / menghapus banner: hanya Leader & Vice Leader clan itu. Admiral/Officer/Member ditolak.
--   6. Link wajib https://domain/.../nama.gif (boleh ?query), tanpa IP, port, user:pass@, spasi; maks 500 huruf.
--   7. Jeda 10 detik antar perubahan banner (anti spam). Kosong = hapus banner.
--   8. Tabel clans terkunci dari aplikasi (RLS + revoke); kolom banner hanya berubah lewat clan_set_banner().
--   9. Banner tampil ke semua orang yang login lewat clan_detail & clan_top, dan hanya bila link masih lolos aturan di atas.

alter table public.clans add column if not exists banner_url text;
alter table public.clans add column if not exists banner_by uuid;
alter table public.clans add column if not exists banner_at timestamptz;

-- Izinkan nilai 'closed' di join_mode (hapus aturan lama apa pun namanya, pasang yang baru)
do $$ declare r record; begin
  for r in select conname from pg_constraint
            where conrelid = 'public.clans'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%join_mode%' loop
    execute format('alter table public.clans drop constraint %I', r.conname);
  end loop;
  alter table public.clans add constraint clans_join_mode_check check (join_mode in ('open', 'request', 'closed'));
  alter table public.clans drop constraint if exists clans_banner_url_check;
  alter table public.clans add constraint clans_banner_url_check check (banner_url is null or (char_length(banner_url) <= 500
    and banner_url ~* '^https://([a-z0-9-]+\.)+[a-z]{2,}/[^[:space:]?#@]*\.gif(\?[^[:space:]#]*)?$'));
end $$;
revoke all on public.clans from anon, authenticated;

-- ---------- Mode gabung ----------
create or replace function public.clan_set_join_mode(p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.clans;
begin
  if p_mode is null or p_mode not in ('open', 'request', 'closed') then raise exception 'Mode tidak valid'; end if;
  c := public.clan_lock_as_leader(auth.uid());
  update public.clans set join_mode = p_mode where id = c.id;
  if p_mode = 'closed' then delete from public.clan_requests where clan_id = c.id; end if;
end; $$;
revoke all on function public.clan_set_join_mode(text) from public, anon;
grant execute on function public.clan_set_join_mode(text) to authenticated;

create or replace function public.clan_join(p_clan bigint, p_req uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid; c public.clans;
begin
  me := public.clan_op_begin(p_req);
  if public.clan_my_id(me) is not null then raise exception 'Kamu sudah tergabung di sebuah clan'; end if;
  select * into c from public.clans where id = p_clan and disbanded_at is null;
  if not found then raise exception 'Clan tidak ditemukan'; end if;
  if c.join_mode = 'closed' then raise exception 'Clan ini privat (tertutup), tidak menerima anggota baru'; end if;
  if c.join_mode = 'open' then
    perform public.clan_add_member(p_clan, me);
    return 'joined';
  end if;
  if (select count(*) from public.clan_requests where user_id = me) >= 5 then raise exception 'Terlalu banyak permintaan yang belum dijawab'; end if;
  insert into public.clan_requests (clan_id, user_id) values (p_clan, me) on conflict do nothing;
  return 'requested';
end; $$;
revoke all on function public.clan_join(bigint, uuid) from public, anon;
grant execute on function public.clan_join(bigint, uuid) to authenticated;

-- Terima permintaan: ditolak bila clan sedang tertutup (permintaan lama sudah dihapus saat ditutup)
create or replace function public.clan_request_respond(p_id bigint, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.clans; r public.clan_requests;
begin
  if me is null then raise exception 'not authenticated'; end if;
  c := public.clan_lock_rank(me, 2, 'Kamu tidak punya izin memproses permintaan masuk');
  select * into r from public.clan_requests where id = p_id and clan_id = c.id for update;
  if not found then raise exception 'Permintaan tidak ditemukan'; end if;
  if p_accept then
    if c.join_mode = 'closed' then
      delete from public.clan_requests where id = p_id;
      raise exception 'Clan sedang tertutup';
    end if;
    perform public.clan_add_member(c.id, r.user_id);
  else
    delete from public.clan_requests where id = p_id;
  end if;
end; $$;
revoke all on function public.clan_request_respond(bigint, boolean) from public, anon;
grant execute on function public.clan_request_respond(bigint, boolean) to authenticated;

-- ---------- Banner clan ----------
create or replace function public.clan_set_banner(p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.clans; v text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if me is null then raise exception 'not authenticated'; end if;
  c := public.clan_lock_as_leader(me);                       -- hanya Leader & Vice Leader
  if v is not null and (char_length(v) > 500 or v !~* '^https://([a-z0-9-]+\.)+[a-z]{2,}/[^[:space:]?#@]*\.gif(\?[^[:space:]#]*)?$') then
    raise exception 'Link banner harus https://domain/.../nama.gif';
  end if;
  if c.banner_at is not null and c.banner_at > now() - interval '10 seconds' then raise exception 'Tunggu 10 detik sebelum mengubah banner lagi'; end if;
  update public.clans set banner_url = v, banner_by = me, banner_at = now() where id = c.id;
end; $$;
revoke all on function public.clan_set_banner(text) from public, anon;
grant execute on function public.clan_set_banner(text) to authenticated;

-- ---------- Baca data (tambah banner) ----------
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
    'banner', c.banner_url,
    'my_role', mine,
    'my_clan', public.clan_my_id(me),
    'my_request', exists (select 1 from public.clan_requests where clan_id = c.id and user_id = me),
    'pending', case when mine is not null and public.clan_rank(mine) >= 2 then (select count(*) from public.clan_requests where clan_id = c.id) else 0 end);
end; $$;
revoke all on function public.clan_detail(bigint) from public, anon;
grant execute on function public.clan_detail(bigint) to authenticated;

drop function if exists public.clan_top(text, int);
create or replace function public.clan_top(p_q text default null, p_limit int default 50)
returns table (rk bigint, id bigint, tag text, name text, tier int, c1 text, c2 text, c3 text, rarity text, level int, members int, slots int, total_xp numeric, join_mode text, banner text)
language sql stable security definer set search_path = public as $$
  with t as (
    select c.*, public.clan_total_xp(c.id) tx, (select count(*)::int from public.clan_members m where m.clan_id = c.id) mc
      from public.clans c where c.disbanded_at is null),
  r as (select t.*, row_number() over (order by tx desc, created_at asc, id asc) pos from t)
  select r.pos, r.id, r.tag, r.name, r.tier, col.c1, col.c2, col.c3, col.rarity, public.clan_level(r.tx), r.mc, r.slots, r.tx, r.join_mode, r.banner_url
    from r left join public.clan_colors col on col.id = r.color_id
   where auth.uid() is not null
     and (p_q is null or btrim(p_q) = '' or position(lower(btrim(p_q)) in lower(r.tag)) > 0 or position(lower(btrim(p_q)) in lower(r.name)) > 0)
   order by r.pos limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;
revoke all on function public.clan_top(text, int) from public, anon;
grant execute on function public.clan_top(text, int) to authenticated;
