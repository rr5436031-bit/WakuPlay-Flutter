-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan SETELAH schema.sql, keamanan*.sql, dan profil-publik.sql.
-- Fitur: teman (cari ID persis, permintaan, terima/tolak), chat pribadi, feed komentar teman 24 jam.

-- ---------- 0) Nama tampilan (sama seperti di chat global), hanya dipakai di dalam fungsi server ----------
create or replace function public.wp_name(p_uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(left(btrim(regexp_replace(coalesce(
           nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''),
           nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)), '[^[:alnum:] ]', '', 'g')), 20), ''), 'User')
  from auth.users u where u.id = p_uid;
$$;
revoke all on function public.wp_name(uuid) from public, anon, authenticated;

-- ---------- 1) Tabel pertemanan (tidak bisa diakses langsung, hanya lewat fungsi di bawah) ----------
create table if not exists public.friendships (
  id           bigint generated always as identity primary key,
  requester    uuid not null references auth.users(id) on delete cascade,
  addressee    uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (requester <> addressee)
);
-- satu pasangan hanya boleh satu baris, siapa pun yang mengirim duluan
create unique index if not exists friendships_pair on public.friendships (least(requester::text, addressee::text), greatest(requester::text, addressee::text));
create index if not exists friendships_req on public.friendships (requester);
create index if not exists friendships_add on public.friendships (addressee);
alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;

-- ---------- 2) Cari user: ID harus PERSIS sama (ketik 1 -> hanya #1, bukan 11 / 12 / 120) ----------
create or replace function public.find_friend(p_seq bigint)
returns table (user_id uuid, name text, avatar text, seq bigint, role text, xp numeric, relation text, request_id bigint)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
  select p.user_id, public.wp_name(p.user_id), u.raw_user_meta_data->>'avatar_url', p.seq, p.role,
         coalesce((select x.xp from public.user_xp x where x.user_id = p.user_id), 0),
         case when f.id is null then 'none'
              when f.status = 'accepted' then 'friend'
              when f.requester = me then 'sent'
              else 'received' end,
         f.id
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join public.friendships f
      on (f.requester = me and f.addressee = p.user_id) or (f.addressee = me and f.requester = p.user_id)
   where p.seq = p_seq and p.user_id <> me
   limit 1;
end; $$;
revoke all on function public.find_friend(bigint) from public, anon;
grant execute on function public.find_friend(bigint) to authenticated;

-- ---------- 3) Kirim / terima / tolak / batal / hapus teman ----------
create or replace function public.friend_request(p_target uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); f public.friendships; n int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_target is null or p_target = me then raise exception 'Tidak bisa menambahkan diri sendiri'; end if;
  if not exists (select 1 from public.profiles where user_id = p_target) then raise exception 'User tidak ditemukan'; end if;

  select * into f from public.friendships
   where (requester = me and addressee = p_target) or (requester = p_target and addressee = me);
  if found then
    if f.status = 'accepted' then return 'friend'; end if;
    if f.requester = me then return 'sent'; end if;
    -- dia sudah minta duluan -> langsung jadi teman
    update public.friendships set status = 'accepted', responded_at = now() where id = f.id;
    return 'friend';
  end if;

  select count(*) into n from public.friendships where requester = me and status = 'pending';
  if n >= 50 then raise exception 'Terlalu banyak permintaan yang belum dijawab'; end if;
  insert into public.friendships (requester, addressee) values (me, p_target);
  return 'sent';
end; $$;
revoke all on function public.friend_request(uuid) from public, anon;
grant execute on function public.friend_request(uuid) to authenticated;

create or replace function public.friend_respond(p_id bigint, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now()
     where id = p_id and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships where id = p_id and addressee = auth.uid() and status = 'pending';
  end if;
end; $$;
revoke all on function public.friend_respond(bigint, boolean) from public, anon;
grant execute on function public.friend_respond(bigint, boolean) to authenticated;

create or replace function public.friend_cancel(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.friendships where id = p_id and requester = auth.uid() and status = 'pending';
end; $$;
revoke all on function public.friend_cancel(bigint) from public, anon;
grant execute on function public.friend_cancel(bigint) to authenticated;

create or replace function public.friend_remove(p_other uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.friendships
   where status = 'accepted'
     and ((requester = auth.uid() and addressee = p_other) or (addressee = auth.uid() and requester = p_other));
end; $$;
revoke all on function public.friend_remove(uuid) from public, anon;
grant execute on function public.friend_remove(uuid) to authenticated;

-- ---------- 4) Chat pribadi ----------
create table if not exists public.direct_messages (
  id         bigint generated always as identity primary key,
  sender     uuid not null references auth.users(id) on delete cascade,
  receiver   uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists dm_pair_a on public.direct_messages (sender, receiver, created_at desc);
create index if not exists dm_pair_b on public.direct_messages (receiver, sender, created_at desc);
alter table public.direct_messages enable row level security;
revoke all on public.direct_messages from anon;
revoke update, truncate on public.direct_messages from authenticated;

drop policy if exists "dm read own" on public.direct_messages;
drop policy if exists "dm insert own" on public.direct_messages;
drop policy if exists "dm delete own" on public.direct_messages;
create policy "dm read own" on public.direct_messages for select to authenticated using ((select auth.uid()) in (sender, receiver));
create policy "dm insert own" on public.direct_messages for insert to authenticated with check ((select auth.uid()) = sender);
create policy "dm delete own" on public.direct_messages for delete to authenticated using ((select auth.uid()) = sender);

-- Hanya teman (sudah diterima) yang boleh saling kirim pesan; isi dibersihkan; anti-spam; hormati status bisu
create or replace function public.dm_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles; recent int;
begin
  if auth.uid() is null or new.sender is distinct from auth.uid() then raise exception 'Tidak diizinkan'; end if;
  if not exists (
    select 1 from public.friendships f where f.status = 'accepted'
       and ((f.requester = new.sender and f.addressee = new.receiver) or (f.requester = new.receiver and f.addressee = new.sender))
  ) then raise exception 'Kalian belum berteman'; end if;

  select * into p from public.profiles where user_id = new.sender;
  if p.muted_until is not null and p.muted_until > now() then
    raise exception 'Kamu sedang dibisukan sampai % WIB', to_char(p.muted_until at time zone 'Asia/Jakarta', 'DD/MM HH24:MI');
  end if;

  new.body := btrim(regexp_replace(regexp_replace(new.body, E'[\\x01-\\x09\\x0b-\\x1f\\x7f]', '', 'g'), E'\n{3,}', E'\n\n', 'g'));
  if char_length(new.body) = 0 then raise exception 'Pesan kosong'; end if;

  select count(*) into recent from public.direct_messages where sender = new.sender and created_at > now() - interval '10 seconds';
  if recent >= 6 then raise exception 'Terlalu cepat, tunggu beberapa detik'; end if;

  new.created_at := now();
  new.read_at := null;
  return new;
end; $$;
drop trigger if exists dm_before_insert on public.direct_messages;
create trigger dm_before_insert before insert on public.direct_messages for each row execute function public.dm_before_insert();

-- Tandai pesan dari teman sebagai sudah dibaca
create or replace function public.dm_mark_read(p_peer uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.direct_messages set read_at = now()
   where receiver = auth.uid() and sender = p_peer and read_at is null;
end; $$;
revoke all on function public.dm_mark_read(uuid) from public, anon;
grant execute on function public.dm_mark_read(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then null; end $$;
alter table public.direct_messages replica identity default;   -- hanya kunci utama yang ikut di event hapus (isi pesan tidak ikut tersiar)

-- ---------- 5) Daftar teman & permintaan ----------
create or replace function public.get_friends()
returns table (user_id uuid, name text, avatar text, seq bigint, role text, xp numeric, unread bigint, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, public.wp_name(o.id), u.raw_user_meta_data->>'avatar_url', p.seq, p.role,
         coalesce((select x.xp from public.user_xp x where x.user_id = o.id), 0),
         (select count(*) from public.direct_messages d where d.sender = o.id and d.receiver = auth.uid() and d.read_at is null),
         (select max(d.created_at) from public.direct_messages d
           where (d.sender = o.id and d.receiver = auth.uid()) or (d.sender = auth.uid() and d.receiver = o.id))
    from public.friendships f
    cross join lateral (select case when f.requester = auth.uid() then f.addressee else f.requester end as id) o
    join auth.users u on u.id = o.id
    left join public.profiles p on p.user_id = o.id
   where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee)
   order by 8 desc nulls last, 4 asc;
$$;
revoke all on function public.get_friends() from public, anon;
grant execute on function public.get_friends() to authenticated;

create or replace function public.get_friend_requests()
returns table (id bigint, direction text, user_id uuid, name text, avatar text, seq bigint, role text, xp numeric, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.id, case when f.addressee = auth.uid() then 'in' else 'out' end, o.id, public.wp_name(o.id),
         u.raw_user_meta_data->>'avatar_url', p.seq, p.role,
         coalesce((select x.xp from public.user_xp x where x.user_id = o.id), 0), f.created_at
    from public.friendships f
    cross join lateral (select case when f.requester = auth.uid() then f.addressee else f.requester end as id) o
    join auth.users u on u.id = o.id
    left join public.profiles p on p.user_id = o.id
   where f.status = 'pending' and auth.uid() in (f.requester, f.addressee)
   order by f.created_at desc;
$$;
revoke all on function public.get_friend_requests() from public, anon;
grant execute on function public.get_friend_requests() to authenticated;

-- Angka kecil di tombol teman: permintaan masuk + pesan belum dibaca
create or replace function public.get_social_badge()
returns table (requests bigint, unread bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.friendships f where f.addressee = auth.uid() and f.status = 'pending'),
         (select count(*) from public.direct_messages d where d.receiver = auth.uid() and d.read_at is null);
$$;
revoke all on function public.get_social_badge() from public, anon;
grant execute on function public.get_social_badge() to authenticated;

-- ---------- 6) Komentar: simpan judul/poster/episode supaya bisa tampil di feed teman ----------
alter table public.comments add column if not exists anime_title text;
alter table public.comments add column if not exists anime_poster text;
alter table public.comments add column if not exists episode_number text;

create or replace function public.comment_meta_clean() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.anime_title    := nullif(left(btrim(coalesce(new.anime_title, '')), 200), '');
  new.episode_number := nullif(left(btrim(coalesce(new.episode_number, '')), 20), '');
  new.anime_poster   := case when new.anime_poster ~* '^https?://[^[:space:]]+$' and length(new.anime_poster) <= 500 then new.anime_poster else null end;
  return new;
end; $$;
drop trigger if exists comment_meta_clean on public.comments;
create trigger comment_meta_clean before insert on public.comments for each row execute function public.comment_meta_clean();

-- Balasan komentar: kolom parent_id (null = komentar utama)
alter table public.comments add column if not exists parent_id bigint references public.comments(id) on delete cascade;
create index if not exists comments_parent on public.comments (parent_id, created_at);

-- Komentar teman dalam 24 jam terakhir. Komentar developer & admin selalu tampil untuk semua orang (tanpa harus berteman), juga 24 jam.
-- Hanya komentar utama (balasan dibuka lewat tombol Reply). Komentar lama tanpa judul/poster dilengkapi dari riwayat tonton si teman bila ada.
drop function if exists public.get_friend_feed(int);
create or replace function public.get_friend_feed(p_hours int default 24)
returns table (id bigint, user_id uuid, name text, avatar text, seq bigint, role text, xp numeric,
               anime_id text, episode_id text, episode_number text, anime_title text, anime_poster text,
               body text, created_at timestamptz, reply_count bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.user_id, public.wp_name(c.user_id), u.raw_user_meta_data->>'avatar_url', p.seq, p.role,
         coalesce((select x.xp from public.user_xp x where x.user_id = c.user_id), 0),
         c.anime_id, c.episode_id,
         left(coalesce(c.episode_number, h.episode_number), 20), left(coalesce(c.anime_title, h.anime_title), 200),
         case when coalesce(c.anime_poster, h.anime_poster) ~* '^https?://[^[:space:]]+$' and length(coalesce(c.anime_poster, h.anime_poster)) <= 500 then coalesce(c.anime_poster, h.anime_poster) end,
         c.body, c.created_at,
         (select count(*) from public.comments r where r.parent_id = c.id)
    from public.comments c
    left join public.friendships f on f.status = 'accepted'
         and ((f.requester = auth.uid() and f.addressee = c.user_id) or (f.addressee = auth.uid() and f.requester = c.user_id))
    join auth.users u on u.id = c.user_id
    left join public.profiles p on p.user_id = c.user_id
    left join public.watch_history h on h.user_id = c.user_id and h.episode_id = c.episode_id
   where c.parent_id is null
     and c.created_at > now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24))
     and (f.id is not null or p.role in ('developer', 'admin'))
   order by c.created_at desc
   limit 100;
$$;
revoke all on function public.get_friend_feed(int) from public, anon;
grant execute on function public.get_friend_feed(int) to authenticated;
