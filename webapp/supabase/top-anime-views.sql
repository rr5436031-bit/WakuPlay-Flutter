-- ============================================================================================
-- TOP ANIME BERDASARKAN VIEW DI WAKUPLAY (bukan dari API)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH anime-views.sql.
--
-- Urutan: view terbanyak di atas (Naruto 200, One Piece 300 -> Top 1 One Piece, Top 2 Naruto).
-- Seri: yang view terakhirnya paling baru menang. Hasil di-cache 2 menit supaya tidak menghitung ulang tiap orang buka Home.
-- ============================================================================================
create table if not exists public.anime_top_cache (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default 'epoch'
);
insert into public.anime_top_cache (id) values (1) on conflict do nothing;
alter table public.anime_top_cache enable row level security;
revoke all on public.anime_top_cache from anon, authenticated;

create or replace function public.top_anime_by_views(p_limit int default 10) returns table (id text, views bigint)
language plpgsql security definer set search_path = public as $$
declare c public.anime_top_cache; n int := least(greatest(coalesce(p_limit, 10), 1), 30);
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into c from public.anime_top_cache where anime_top_cache.id = 1;
  if c.updated_at < now() - interval '2 minutes' and pg_try_advisory_xact_lock(hashtext('anime_top_cache')) then
    update public.anime_top_cache set updated_at = now(), data = coalesce((
      select jsonb_agg(jsonb_build_object('id', t.anime_id, 'views', t.v) order by t.v desc, t.last desc)
        from (select v.anime_id, count(*) as v, max(v.created_at) as last
                from public.anime_views v group by v.anime_id order by count(*) desc, max(v.created_at) desc limit 30) t
    ), '[]'::jsonb) where anime_top_cache.id = 1 returning * into c;
  end if;
  return query select (e->>'id')::text, (e->>'views')::bigint
                 from jsonb_array_elements(c.data) with ordinality as x(e, ord) order by x.ord limit n;
end; $$;
revoke all on function public.top_anime_by_views(int) from public, anon;
grant execute on function public.top_anime_by_views(int) to authenticated;
