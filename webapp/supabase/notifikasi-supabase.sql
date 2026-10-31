-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan PALING AKHIR, setelah notifikasi.sql, push.sql, lapor-request-tag.sql, balasan.sql, wakugames-clan.sql, clan-role.sql.
--
-- NOTIFIKASI TANPA FIREBASE. Semua lewat Supabase:
--   * kejadian -> baris di tabel notifications (trigger)  -> aplikasi terbuka: Realtime
--   * aplikasi tertutup: plugin Android wp-notify menanyakan ke server tiap ~5 menit lewat fungsi notif_poll (pakai "kunci perangkat",
--     bukan login, jadi tidak ada masalah token kedaluwarsa) lalu menampilkan notifikasi sistem.
--
-- Jenis: tag (mention), balasan (reply), anime baru (new_anime), episode baru (episode), permintaan teman (friend_request / friend_accept),
--        permintaan masuk clan (clan_request), chat pribadi (dm).

-- ============================================================ 1) MATIKAN PUSH FIREBASE LAMA (kalau pernah dipasang)
drop trigger if exists notif_push on public.notifications;

-- ============================================================ 2) JENIS NOTIFIKASI
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('friend_request', 'friend_accept', 'dm', 'episode', 'mention', 'reply', 'clan_request', 'new_anime'));
create index if not exists notif_user_created on public.notifications (user_id, created_at);

-- ============================================================ 3) BALASAN KOMENTAR -> pemilik komentar utama
create or replace function public.notif_on_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare par public.comments;
begin
  if new.parent_id is null then return null; end if;
  select * into par from public.comments where id = new.parent_id;
  if not found or par.user_id = new.user_id then return null; end if;
  insert into public.notifications (user_id, type, title, body, data, dedupe_key)
  values (par.user_id, 'reply', left(coalesce(nullif(new.user_name, ''), public.wp_name(new.user_id)) || ' membalas komentarmu', 120),
          left(coalesce(new.body, ''), 100),
          jsonb_build_object('from', new.user_id, 'comment_id', new.id, 'parent_id', par.id, 'episode_id', par.episode_id, 'anime_id', par.anime_id,
                             'anime_title', par.anime_title, 'poster', par.anime_poster, 'number', par.episode_number),
          'rp-' || new.id)
  on conflict do nothing;
  return null;
exception when others then return null;       -- notifikasi tidak boleh menggagalkan komentar
end; $$;
drop trigger if exists notif_on_reply on public.comments;
create trigger notif_on_reply after insert on public.comments for each row execute function public.notif_on_reply();

-- ============================================================ 4) PERMINTAAN MASUK CLAN -> pengurus clan (Officer ke atas)
create or replace function public.notif_on_clan_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare cn text; nm text := public.wp_name(new.user_id);
begin
  select name into cn from public.clans where id = new.clan_id;
  insert into public.notifications (user_id, type, title, body, data, dedupe_key)
  select m.user_id, 'clan_request', left(nm || ' ingin masuk clan', 120), 'Permintaan masuk ' || coalesce(cn, 'clan'),
         jsonb_build_object('from', new.user_id, 'clan_id', new.clan_id, 'request_id', new.id),
         'cr-' || new.id || '-' || m.user_id
    from public.clan_members m
   where m.clan_id = new.clan_id and m.role in ('leader', 'vice_leader', 'admiral', 'officer') and m.user_id <> new.user_id
  on conflict do nothing;
  return null;
exception when others then return null;
end; $$;
drop trigger if exists notif_on_clan_request on public.clan_requests;
create trigger notif_on_clan_request after insert on public.clan_requests for each row execute function public.notif_on_clan_request();

-- ============================================================ 5) ANIME BARU + EPISODE BARU (dipanggil Edge Function episode-watch tiap 10 menit)
-- Anime yang BARU PERTAMA KALI terlihat dengan episode 1-2 (setelah data awal terisi) = "anime baru" untuk pengguna aktif (maks 5 anime per panggilan).
-- Episode naik = "episode baru" untuk yang memfavoritkan / menonton anime itu.
create or replace function public.episode_watch_apply(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare it jsonb; aid text; ttl text; pos text; ep numeric; prev numeric; n int := 0; c int; known bigint; newc int := 0; epl text;
begin
  select count(*) into known from public.anime_ep_state;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    aid := it->>'id'; ttl := left(coalesce(nullif(it->>'title', ''), 'Anime'), 120); pos := nullif(it->>'poster', '');
    begin ep := (it->>'ep')::numeric; exception when others then ep := null; end;
    if aid is null or ep is null or ep <= 0 or ep > 5000 then continue; end if;
    epl := case when ep = trunc(ep) then trunc(ep)::text else trim(trailing '0' from ep::text) end;
    select last_ep into prev from public.anime_ep_state where anime_id = aid for update;
    if not found then
      insert into public.anime_ep_state (anime_id, last_ep) values (aid, ep) on conflict do nothing;
      if known >= 30 and ep <= 2 and newc < 5 then              -- bukan data awal, dan memang anime yang baru tayang
        newc := newc + 1;
        insert into public.notifications (user_id, type, title, body, data, dedupe_key)
        select u.user_id, 'new_anime', ttl, 'Anime baru tayang di WakuPlay!',
               jsonb_build_object('anime_id', aid, 'poster', pos, 'number', epl), 'na-' || left(aid, 80)
          from (select user_id from public.watch_history where updated_at > now() - interval '60 days'
                union select user_id from public.favorites
                union select user_id from public.notif_devices) u
        on conflict do nothing;
        get diagnostics c = row_count; n := n + c;
      end if;
    elsif ep > prev then
      update public.anime_ep_state set last_ep = ep, updated_at = now() where anime_id = aid;
      insert into public.notifications (user_id, type, title, body, data, dedupe_key)
      select u.user_id, 'episode', ttl, 'Episode ' || epl || ' sudah tayang di WakuPlay!',
             jsonb_build_object('anime_id', aid, 'episode_id', null, 'poster', pos, 'number', ep::text),
             'ep-' || left(aid, 80) || '-' || ep::text
        from (select user_id from public.favorites where anime_id = aid
              union
              select user_id from public.watch_history where anime_id = aid and updated_at > now() - interval '60 days') u
      on conflict do nothing;
      get diagnostics c = row_count; n := n + c;
    end if;
  end loop;
  return n;
end; $$;
revoke all on function public.episode_watch_apply(jsonb) from public, anon, authenticated;
grant execute on function public.episode_watch_apply(jsonb) to service_role;

-- ============================================================ 6) PERANGKAT (kunci perangkat untuk polling saat aplikasi tertutup)
create table if not exists public.notif_devices (
  device_id    uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  secret_hash  text not null,
  prefs        jsonb not null default '{}'::jsonb,
  platform     text not null default 'android',
  created_at   timestamptz not null default now(),
  last_poll_at timestamptz
);
create index if not exists notif_devices_user on public.notif_devices (user_id);
alter table public.notif_devices enable row level security;
revoke all on public.notif_devices from anon, authenticated;     -- tertutup; hanya lewat fungsi di bawah

-- Jenis -> kunci pilihan di Pengaturan. Pilihan yang tidak ada = aktif.
create or replace function public.notif_pref_key(p_type text) returns text
language sql immutable as $$
  select case p_type when 'friend_request' then 'friend' when 'friend_accept' then 'friend' when 'dm' then 'dm' when 'episode' then 'episode'
                     when 'mention' then 'mention' when 'reply' then 'reply' when 'clan_request' then 'clan' when 'new_anime' then 'anime' else 'other' end;
$$;

create or replace function public.notif_clean_prefs(p jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, coalesce((p ->> k)::boolean, true)), '{}'::jsonb)
    from unnest(array['friend', 'dm', 'episode', 'mention', 'reply', 'clan', 'anime']) k
   where p is not null and jsonb_typeof(p) = 'object' and (p ->> k) in ('true', 'false');
$$;

-- Daftarkan perangkat ini (login). Mengembalikan kunci SEKALI ini saja; server hanya menyimpan hash-nya.
create or replace function public.notif_device_register(p_prefs jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); sec text; d uuid; cur timestamptz;
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from public.notif_devices where user_id = me and device_id not in
    (select device_id from public.notif_devices where user_id = me order by created_at desc limit 4);       -- maks 5 perangkat per akun
  sec := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.notif_devices (user_id, secret_hash, prefs)
  values (me, encode(sha256(convert_to(sec, 'UTF8')), 'hex'), public.notif_clean_prefs(p_prefs))
  returning device_id into d;
  select coalesce(max(created_at), now()) into cur from public.notifications where user_id = me;     -- notifikasi lama tidak ikut dimunculkan
  return jsonb_build_object('device_id', d, 'secret', sec, 'since', cur);
end; $$;
revoke all on function public.notif_device_register(jsonb) from public, anon;
grant execute on function public.notif_device_register(jsonb) to authenticated;

create or replace function public.notif_device_set_prefs(p_device uuid, p_prefs jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.notif_devices set prefs = public.notif_clean_prefs(p_prefs) where device_id = p_device and user_id = auth.uid();
end; $$;
revoke all on function public.notif_device_set_prefs(uuid, jsonb) from public, anon;
grant execute on function public.notif_device_set_prefs(uuid, jsonb) to authenticated;

create or replace function public.notif_device_revoke(p_device uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.notif_devices where device_id = p_device and user_id = auth.uid();
end; $$;
revoke all on function public.notif_device_revoke(uuid) from public, anon;
grant execute on function public.notif_device_revoke(uuid) to authenticated;

-- Dipanggil plugin Android saat aplikasi tertutup (tanpa login, memakai kunci perangkat).
-- Mengembalikan notifikasi BELUM DIBACA yang dibuat/diperbarui setelah p_since (maks 15, tiga hari terakhir), difilter pilihan pengguna.
-- ok=false -> kunci tidak berlaku lagi (logout / dicabut): plugin berhenti.
create or replace function public.notif_poll(p_device uuid, p_secret text, p_since timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.notif_devices; items jsonb; cur timestamptz;
begin
  if p_device is null or p_secret is null or char_length(p_secret) < 32 or char_length(p_secret) > 200 then return jsonb_build_object('ok', false); end if;
  select * into d from public.notif_devices where device_id = p_device;
  if not found or d.secret_hash <> encode(sha256(convert_to(p_secret, 'UTF8')), 'hex') then return jsonb_build_object('ok', false); end if;
  p_since := greatest(coalesce(p_since, now() - interval '1 hour'), now() - interval '3 days');
  update public.notif_devices set last_poll_at = now() where device_id = d.device_id and (last_poll_at is null or last_poll_at < now() - interval '1 minute');
  select max(created_at) into cur from public.notifications where user_id = d.user_id and created_at > p_since;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'type', x.type, 'title', x.title, 'body', x.body, 'data', x.data, 'created_at', x.created_at) order by x.created_at), '[]'::jsonb)
    into items
    from (select n.* from public.notifications n
           where n.user_id = d.user_id and n.read_at is null and n.created_at > p_since
             and coalesce((d.prefs ->> public.notif_pref_key(n.type))::boolean, true)
           order by n.created_at asc limit 15) x;
  return jsonb_build_object('ok', true, 'items', items, 'cursor', coalesce(cur, p_since));
end; $$;
revoke all on function public.notif_poll(uuid, text, timestamptz) from public;
grant execute on function public.notif_poll(uuid, text, timestamptz) to anon, authenticated;

-- Bersihkan perangkat yang sudah 90 hari tidak aktif (dipanggil setiap ada perangkat baru mendaftar)
create or replace function public.notif_devices_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.notif_devices where coalesce(last_poll_at, created_at) < now() - interval '90 days';
  return null;
end; $$;
drop trigger if exists notif_devices_cleanup on public.notif_devices;
create trigger notif_devices_cleanup after insert on public.notif_devices for each statement execute function public.notif_devices_cleanup();

-- ============================================================ CEK (opsional)
--   select type, count(*) from public.notifications group by 1;           -- jenis yang ada
--   select user_id, device_id, last_poll_at from public.notif_devices;    -- perangkat yang aktif polling
