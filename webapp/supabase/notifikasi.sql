-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan SETELAH teman-chat.sql.
-- Fitur: notifikasi (ada yang add teman, chat pribadi baru, episode baru anime favorit/riwayat).

create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null check (type in ('friend_request', 'dm', 'episode')),
  title      text not null,
  body       text,
  data       jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notif_user on public.notifications (user_id, created_at desc);
create unique index if not exists notif_dedupe on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
revoke insert, update, truncate on public.notifications from authenticated;
drop policy if exists "notif read own" on public.notifications;
drop policy if exists "notif delete own" on public.notifications;
create policy "notif read own" on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy "notif delete own" on public.notifications for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------- Ada yang menambahkan kamu sebagai teman ----------
create or replace function public.notif_on_friend() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    insert into public.notifications (user_id, type, title, body, data, dedupe_key)
    values (new.addressee, 'friend_request', 'Permintaan pertemanan',
            public.wp_name(new.requester) || ' menambahkan kamu sebagai teman',
            jsonb_build_object('from', new.requester), 'fr-' || new.id)
    on conflict do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists notif_on_friend on public.friendships;
create trigger notif_on_friend after insert on public.friendships for each row execute function public.notif_on_friend();

-- ---------- Chat pribadi baru (pesan beruntun dari orang yang sama digabung jadi 1 notifikasi) ----------
create or replace function public.notif_on_dm() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text := public.wp_name(new.sender); preview text := left(new.body, 80); n bigint;
begin
  select id into n from public.notifications
   where user_id = new.receiver and type = 'dm' and read_at is null and (data->>'from')::uuid = new.sender
   order by created_at desc limit 1;
  if n is not null then
    update public.notifications
       set body = preview, created_at = now(), data = jsonb_set(data, '{count}', to_jsonb(coalesce((data->>'count')::int, 1) + 1))
     where id = n;
  else
    insert into public.notifications (user_id, type, title, body, data)
    values (new.receiver, 'dm', nm, preview, jsonb_build_object('from', new.sender, 'count', 1));
  end if;
  return new;
end; $$;
drop trigger if exists notif_on_dm on public.direct_messages;
create trigger notif_on_dm after insert on public.direct_messages for each row execute function public.notif_on_dm();

-- ---------- Episode baru (dikirim aplikasi untuk akun sendiri; 1 episode = 1 notifikasi) ----------
create or replace function public.notify_episode(p_anime_id text, p_title text, p_poster text, p_episode_id text, p_number text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.notifications (user_id, type, title, body, data, dedupe_key)
  values (auth.uid(), 'episode', left(coalesce(p_title, 'Anime'), 120), 'Episode ' || left(coalesce(p_number, '?'), 10) || ' sudah tayang',
          jsonb_build_object('anime_id', p_anime_id, 'episode_id', p_episode_id, 'poster', p_poster, 'number', p_number),
          'ep-' || left(p_anime_id, 80) || '-' || left(p_episode_id, 80))
  on conflict do nothing;
end; $$;
revoke all on function public.notify_episode(text, text, text, text, text) from public, anon;
grant execute on function public.notify_episode(text, text, text, text, text) to authenticated;

-- ---------- Tandai dibaca (p_id kosong = semua) ----------
create or replace function public.notif_mark_read(p_id bigint default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_id is null or id = p_id);
end; $$;
revoke all on function public.notif_mark_read(bigint) from public, anon;
grant execute on function public.notif_mark_read(bigint) to authenticated;

-- Notifikasi lama (> 30 hari) dibersihkan otomatis saat ada notifikasi baru
create or replace function public.notif_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications where user_id = new.user_id and created_at < now() - interval '30 days';
  return null;
end; $$;
drop trigger if exists notif_cleanup on public.notifications;
create trigger notif_cleanup after insert on public.notifications for each row execute function public.notif_cleanup();

-- Realtime: notifikasi muncul langsung
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;
alter table public.notifications replica identity default;

-- Membuka chat dengan seseorang = notifikasi chat dari dia ikut dianggap dibaca
create or replace function public.dm_mark_read(p_peer uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.direct_messages set read_at = now()
   where receiver = auth.uid() and sender = p_peer and read_at is null;
  update public.notifications set read_at = now()
   where user_id = auth.uid() and type = 'dm' and read_at is null and data->>'from' = p_peer::text;
end; $$;
revoke all on function public.dm_mark_read(uuid) from public, anon;
grant execute on function public.dm_mark_read(uuid) to authenticated;
