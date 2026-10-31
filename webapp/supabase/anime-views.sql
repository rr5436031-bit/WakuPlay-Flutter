-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- View anime / episode dihitung dari database sendiri (bukan dari API). Mulai dari 0.
-- Aturan: 1 user x 1 episode = 1 view (nonton ulang episode yang sama tidak menambah view).

create table if not exists public.anime_views (
  user_id    uuid not null references auth.users(id) on delete cascade,
  anime_id   text not null,
  episode_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, episode_id)
);
create index if not exists anime_views_anime_idx on public.anime_views (anime_id);

alter table public.anime_views enable row level security;
revoke all on public.anime_views from anon, authenticated;   -- tidak ada akses langsung; hanya lewat fungsi di bawah

-- Catat 1 view. Mengembalikan true kalau ini view baru, false kalau user ini sudah pernah menonton episode itu.
create or replace function public.add_view(p_anime text, p_episode text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_anime is null or p_episode is null or btrim(p_anime) = '' or btrim(p_episode) = ''
     or char_length(p_anime) > 120 or char_length(p_episode) > 160 then
    raise exception 'data tidak valid';
  end if;
  insert into public.anime_views (user_id, anime_id, episode_id) values (auth.uid(), p_anime, p_episode)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n > 0;
end; $$;
revoke all on function public.add_view(text, text) from public, anon;
grant execute on function public.add_view(text, text) to authenticated;

-- Jumlah view per anime (banyak sekaligus)
create or replace function public.get_anime_views(p_ids text[]) returns table (id text, views bigint)
language sql stable security definer set search_path = public as $$
  select v.anime_id, count(*) from public.anime_views v
  where v.anime_id = any(p_ids[1:300]) group by v.anime_id;
$$;
revoke all on function public.get_anime_views(text[]) from public, anon;
grant execute on function public.get_anime_views(text[]) to authenticated;

-- Jumlah view per episode (banyak sekaligus)
create or replace function public.get_episode_views(p_ids text[]) returns table (id text, views bigint)
language sql stable security definer set search_path = public as $$
  select v.episode_id, count(*) from public.anime_views v
  where v.episode_id = any(p_ids[1:300]) group by v.episode_id;
$$;
revoke all on function public.get_episode_views(text[]) from public, anon;
grant execute on function public.get_episode_views(text[]) to authenticated;

-- (Opsional) Isi view awal dari riwayat tonton yang sudah ada. Hapus tanda -- di bawah kalau mau; kalau tidak, semua mulai dari 0.
-- insert into public.anime_views (user_id, anime_id, episode_id, created_at)
--   select user_id, anime_id, episode_id, coalesce(updated_at, now()) from public.watch_history on conflict do nothing;
