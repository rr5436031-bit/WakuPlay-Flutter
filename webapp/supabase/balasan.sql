-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Fitur: balasan komentar (Reply) di halaman nonton & di feed SocialLine.
-- Jalankan SETELAH schema.sql / keamanan*.sql / teman-chat.sql.

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

-- Balasan selalu menempel ke komentar UTAMA (membalas balasan = tetap di thread yang sama), dan mengikuti episode/anime komentar induknya
create or replace function public.comment_parent_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare par public.comments;
begin
  if new.parent_id is null then return new; end if;
  select * into par from public.comments where id = new.parent_id;
  if not found then raise exception 'Komentar yang dibalas sudah dihapus'; end if;
  if par.parent_id is not null then
    new.parent_id := par.parent_id;
    select * into par from public.comments where id = new.parent_id;
    if not found then raise exception 'Komentar yang dibalas sudah dihapus'; end if;
  end if;
  new.episode_id     := par.episode_id;
  new.anime_id       := par.anime_id;
  new.anime_title    := par.anime_title;
  new.anime_poster   := par.anime_poster;
  new.episode_number := par.episode_number;
  return new;
end; $$;
drop trigger if exists comment_parent_check on public.comments;
create trigger comment_parent_check before insert on public.comments for each row execute function public.comment_parent_check();

-- Jumlah balasan untuk beberapa komentar sekaligus
create or replace function public.get_reply_counts(p_ids bigint[])
returns table (parent_id bigint, n bigint)
language sql stable security definer set search_path = public as $$
  select c.parent_id, count(*) from public.comments c
   where c.parent_id = any(p_ids) and auth.uid() is not null
   group by c.parent_id;
$$;
revoke all on function public.get_reply_counts(bigint[]) from public, anon;
grant execute on function public.get_reply_counts(bigint[]) to authenticated;
