-- ============================================================================
-- keamanan-8-audit.sql  —  Pengerasan keamanan (jalankan TERAKHIR, setelah semua SQL lain)
-- Supabase Dashboard -> SQL Editor -> New query -> Run.  Aman dijalankan berulang.
--
-- Ringkas:
--  1) Pengguna belum login (anon) tidak punya akses apa pun ke tabel / fungsi.
--  2) Fungsi internal (trigger, helper) tidak bisa dipanggil lewat API sama sekali.
--  3) favorites / riwayat / laporan: hanya untuk user login, ada batas panjang & jumlah (anti spam & penuh-penuhin database).
--  4) Poster / judul dari riwayat tonton dibersihkan (tidak bisa dipakai menyelipkan link aneh).
--  5) Isi chat pribadi tidak ikut tersiar di event "hapus" realtime.
--  6) Tabel baru otomatis ber-RLS (cadangan kalau lupa mengaktifkan).
-- ============================================================================

-- ---------- 1) anon: tidak boleh apa-apa ----------
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on table public.%I from anon', r.tablename);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f'
              and p.proname <> 'check_device_ban'   -- satu-satunya fungsi yang sengaja boleh dipanggil sebelum login (cek blokir perangkat)
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    execute format('revoke all on function %s from public, anon', r.sig);
  end loop;
end $$;
revoke all on all sequences in schema public from anon;
-- objek BARU yang dibuat nanti juga tertutup untuk anon
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------- 2) fungsi internal: tidak bisa dipanggil dari aplikasi ----------
do $$ declare nm text; sig text; begin
  foreach nm in array array[
    'assign_profile_seq','chat_before_insert','comment_before_insert','comment_meta_clean','comment_parent_check',
    'dev_panel_access_audit','dev_panel_access_guard','dev_panel_revoke_on_demote','dm_before_insert','handle_new_user','wp_name','reports_rate','userdata_guard_history','userdata_guard_fav','is_banned','ban_guard_user','ban_guard_dm'
  ] loop
    for sig in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = nm loop
      execute format('revoke all on function %s from public, anon, authenticated', sig);
    end loop;
  end loop;
end $$;

-- ---------- 3) favorites / riwayat / laporan ----------
-- kebijakan hanya untuk user login
drop policy if exists "favorites own select" on public.favorites;
drop policy if exists "favorites own insert" on public.favorites;
drop policy if exists "favorites own update" on public.favorites;
drop policy if exists "favorites own delete" on public.favorites;
create policy "favorites own select" on public.favorites for select to authenticated using ((select auth.uid()) = user_id);
create policy "favorites own insert" on public.favorites for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "favorites own update" on public.favorites for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "favorites own delete" on public.favorites for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "history own select" on public.watch_history;
drop policy if exists "history own insert" on public.watch_history;
drop policy if exists "history own update" on public.watch_history;
drop policy if exists "history own delete" on public.watch_history;
create policy "history own select" on public.watch_history for select to authenticated using ((select auth.uid()) = user_id);
create policy "history own insert" on public.watch_history for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "history own update" on public.watch_history for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "history own delete" on public.watch_history for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "reports insert own" on public.reports;
create policy "reports insert own" on public.reports for insert to authenticated with check ((select auth.uid()) = user_id);
revoke select, update, delete on public.reports from authenticated;   -- laporan hanya bisa ditulis, tidak bisa dibaca user lain

-- batas panjang (data lama tidak diperiksa ulang, hanya data baru)
do $$ begin
  begin alter table public.reports add constraint reports_len check (char_length(reason) between 1 and 200 and (anime_id is null or char_length(anime_id) <= 100) and (episode_id is null or char_length(episode_id) <= 100)) not valid; exception when duplicate_object then null; end;
  begin alter table public.comments add constraint comments_ids_len check (char_length(episode_id) <= 100 and (anime_id is null or char_length(anime_id) <= 100)) not valid; exception when duplicate_object then null; end;
end $$;

-- laporan: maks 5 per menit per user
create or replace function public.reports_rate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.reports where user_id = new.user_id and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'Terlalu banyak laporan, coba lagi sebentar';
  end if;
  return new;
end; $$;
revoke all on function public.reports_rate() from public, anon, authenticated;
drop trigger if exists reports_rate on public.reports;
create trigger reports_rate before insert on public.reports for each row execute function public.reports_rate();

-- riwayat & favorit: batas jumlah per user + pembersihan poster/judul (kolom keduanya berbeda, jadi fungsinya terpisah)
create or replace function public.userdata_guard_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.watch_history where user_id = new.user_id) >= 5000 then
    raise exception 'Batas riwayat tercapai';
  end if;
  new.anime_title    := left(new.anime_title, 200);
  new.episode_number := left(new.episode_number, 20);
  new.anime_poster   := case when new.anime_poster ~* '^https?://[^[:space:]]+$' and length(new.anime_poster) <= 500 then new.anime_poster else null end;
  return new;
end; $$;
create or replace function public.userdata_guard_fav() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.favorites where user_id = new.user_id) >= 2000 then
    raise exception 'Batas favorit tercapai';
  end if;
  new.title  := left(new.title, 200);
  new.poster := case when new.poster ~* '^https?://[^[:space:]]+$' and length(new.poster) <= 500 then new.poster else null end;
  return new;
end; $$;
revoke all on function public.userdata_guard_history() from public, anon, authenticated;
revoke all on function public.userdata_guard_fav() from public, anon, authenticated;
drop trigger if exists userdata_guard on public.watch_history;
create trigger userdata_guard before insert or update on public.watch_history for each row execute function public.userdata_guard_history();
drop trigger if exists userdata_guard on public.favorites;
create trigger userdata_guard before insert or update on public.favorites for each row execute function public.userdata_guard_fav();

-- ---------- 5) chat pribadi: event hapus hanya membawa kunci utama ----------
do $$ begin
  if to_regclass('public.direct_messages') is not null then
    alter table public.direct_messages replica identity default;
  end if;
end $$;

-- ---------- 6) tabel baru otomatis ber-RLS (cadangan) ----------
do $$ begin
  create or replace function public.rls_auto_enable() returns event_trigger
  language plpgsql security definer set search_path = pg_catalog as $f$
  declare c record;
  begin
    for c in select * from pg_event_trigger_ddl_commands() where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') and schema_name = 'public' loop
      execute format('alter table %s enable row level security', c.object_identity);
    end loop;
  end; $f$;
  drop event trigger if exists rls_auto_enable;
  create event trigger rls_auto_enable on ddl_command_end when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') execute function public.rls_auto_enable();
exception when others then raise notice 'event trigger dilewati: %', sqlerrm;
end $$;

-- ---------- Pemeriksaan: tabel di schema public yang BELUM ber-RLS (harus kosong) ----------
select c.relname as tabel_tanpa_rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
