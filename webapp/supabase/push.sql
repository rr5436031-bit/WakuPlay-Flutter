-- ============================================================================================
-- NOTIFIKASI PUSH (muncul di HP walau aplikasi TERTUTUP) + notifikasi "pertemanan diterima" + episode terbaru dari server
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Syarat: notifikasi.sql dan teman-chat.sql sudah pernah dijalankan.
-- Setelah ini ikuti PANDUAN-NOTIFIKASI.md (Firebase, secrets, deploy 2 fungsi, isi push_config, jadwalkan pengecekan episode).
-- ============================================================================================

-- ---------- 1) Jenis notifikasi baru: pertemanan diterima ----------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in ('friend_request', 'friend_accept', 'dm', 'episode'));

-- Orang yang menambahkanmu menerima notifikasi saat permintaannya DITERIMA (ACC)
create or replace function public.notif_on_friend_accept() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'accepted' then
    insert into public.notifications (user_id, type, title, body, data, dedupe_key)
    values (new.requester, 'friend_accept', 'Pertemanan diterima',
            public.wp_name(new.addressee) || ' menerima permintaan pertemananmu',
            jsonb_build_object('from', new.addressee), 'fa-' || new.id)
    on conflict do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists notif_on_friend_accept on public.friendships;
create trigger notif_on_friend_accept after update on public.friendships for each row execute function public.notif_on_friend_accept();

-- ---------- 2) Token perangkat (FCM) ----------
create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  platform   text not null default 'android',
  prefs      jsonb not null default '{"friend": true, "dm": true, "episode": true}'::jsonb,   -- pilihan jenis notifikasi dari Pengaturan
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;     -- hanya lewat fungsi di bawah

-- Satu token hanya milik satu akun (kalau HP dipakai ganti akun, token pindah ke akun yang login)
create or replace function public.push_token_save(p_token text, p_platform text default 'android', p_prefs jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_token is null or char_length(p_token) < 20 or char_length(p_token) > 4096 then raise exception 'token tidak valid'; end if;
  insert into public.push_tokens (token, user_id, platform, prefs, updated_at)
  values (p_token, auth.uid(), coalesce(p_platform, 'android'),
          coalesce(jsonb_build_object('friend', coalesce((p_prefs->>'friend')::boolean, true), 'dm', coalesce((p_prefs->>'dm')::boolean, true), 'episode', coalesce((p_prefs->>'episode')::boolean, true)),
                   '{"friend": true, "dm": true, "episode": true}'::jsonb), now())
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, prefs = excluded.prefs, updated_at = now();
end; $$;
revoke all on function public.push_token_save(text, text, jsonb) from public, anon;
grant execute on function public.push_token_save(text, text, jsonb) to authenticated;

create or replace function public.push_token_delete(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
end; $$;
revoke all on function public.push_token_delete(text) from public, anon;
grant execute on function public.push_token_delete(text) to authenticated;

-- ---------- 3) Konfigurasi pemanggil fungsi (URL + rahasia). DIISI SEKALI oleh kamu, lihat PANDUAN-NOTIFIKASI.md ----------
create table if not exists public.push_config (
  key   text primary key,
  value text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

-- ---------- 4) Setiap notifikasi baru -> kirim push (tidak pernah menggagalkan penyimpanan notifikasi) ----------
create extension if not exists pg_net with schema extensions;

create or replace function public.notif_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare u text; s text;
begin
  -- Pesan chat pribadi beruntun digabung jadi 1 baris (UPDATE): push hanya saat isi pesannya berganti
  if tg_op = 'UPDATE' and not (new.type = 'dm' and new.read_at is null and new.body is distinct from old.body) then return null; end if;
  select value into u from public.push_config where key = 'push_url';
  select value into s from public.push_config where key = 'push_secret';
  if u is null or s is null or u like '%GANTI%' or s like '%GANTI%' then return null; end if;
  begin
    perform net.http_post(url := u, body := jsonb_build_object('notification_id', new.id),
                          headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', s),
                          timeout_milliseconds := 5000);
  exception when others then null;
  end;
  return null;
end; $$;
drop trigger if exists notif_push on public.notifications;
create trigger notif_push after insert or update on public.notifications for each row execute function public.notif_push();

-- ---------- 5) Episode terbaru dari SERVER (jalan terjadwal walau tidak ada yang membuka aplikasi) ----------
create table if not exists public.anime_ep_state (
  anime_id   text primary key,
  last_ep    numeric not null,
  updated_at timestamptz not null default now()
);
alter table public.anime_ep_state enable row level security;
revoke all on public.anime_ep_state from anon, authenticated;

-- Dipanggil Edge Function episode-watch. p_items = [{"id","title","poster","ep"}].
-- Pertama kali anime terlihat -> hanya dicatat (tanpa notifikasi). Kalau nomor episode NAIK -> semua pengguna yang
-- memfavoritkan / menonton anime itu (60 hari terakhir) dibuatkan notifikasi (1 episode = 1 notifikasi per pengguna).
create or replace function public.episode_watch_apply(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare it jsonb; aid text; ttl text; pos text; ep numeric; prev numeric; n int := 0; c int;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    aid := it->>'id'; ttl := left(coalesce(nullif(it->>'title', ''), 'Anime'), 120); pos := nullif(it->>'poster', '');
    begin ep := (it->>'ep')::numeric; exception when others then ep := null; end;
    if aid is null or ep is null or ep <= 0 or ep > 5000 then continue; end if;
    select last_ep into prev from public.anime_ep_state where anime_id = aid for update;
    if not found then
      insert into public.anime_ep_state (anime_id, last_ep) values (aid, ep) on conflict do nothing;
    elsif ep > prev then
      update public.anime_ep_state set last_ep = ep, updated_at = now() where anime_id = aid;
      insert into public.notifications (user_id, type, title, body, data, dedupe_key)
      select u.user_id, 'episode', ttl, 'Episode ' || trim(trailing '.' from trim(trailing '0' from ep::text)) || ' sudah tayang di WakuPlay!',
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

-- ---------- 6) Jadwalkan pengecekan episode tiap 10 menit ----------
-- Jalankan BAGIAN INI SETELAH push_config terisi (lihat PANDUAN-NOTIFIKASI.md langkah 6). Butuh ekstensi pg_cron.
--   create extension if not exists pg_cron;
--   select cron.schedule('episode-watch', '*/10 * * * *', $cron$
--     select net.http_post(
--       url := (select value from public.push_config where key = 'watch_url'),
--       headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', (select value from public.push_config where key = 'push_secret')),
--       body := '{}'::jsonb, timeout_milliseconds := 20000);
--   $cron$);
-- Lihat jadwal:   select * from cron.job;      Hentikan:   select cron.unschedule('episode-watch');
