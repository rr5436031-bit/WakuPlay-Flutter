-- FIX: error "column reference \"found\" is ambiguous" saat Impor / membuka Panel > Border.
-- Penyebab: kolom avatar_border_sync_log.found bentrok dengan variabel bawaan plpgsql FOUND di dev_border_list().
-- Perbaikan: kolom ditulis dengan alias tabel (l.found). Jalankan di Supabase -> SQL Editor -> Run (aman diulang).
-- Prasyarat: avatar-border-github.sql sudah pernah dijalankan.

create or replace function public.dev_border_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  return jsonb_build_object(
    'tiers', coalesce((select jsonb_object_agg(rarity, jsonb_build_array(min_price, max_price)) from public.avatar_border_tiers), '{}'::jsonb),
    'prices', coalesce((select jsonb_object_agg(rarity, price) from public.avatar_border_prices), '{}'::jsonb),
    'stale', coalesce((select jsonb_object_agg(p.rarity, jsonb_build_object(
                'auto', (select count(*) from public.avatar_borders b where b.id ~ '^u' and b.rarity = p.rarity and b.price_auto and b.price <> p.price),
                'manual', (select count(*) from public.avatar_borders b where b.id ~ '^u' and b.rarity = p.rarity and not b.price_auto and b.price <> p.price)))
              from public.avatar_border_prices p), '{}'::jsonb),
    'github_total', (select count(*) from public.avatar_borders where origin in ('github', 'panel') and repo_path is not null),
    'missing_total', (select count(*) from public.avatar_borders where file_missing_at is not null),
    'sync', (select to_jsonb(s) from (select l.run_at, l.found, l.new_count, l.registered, l.failed, l.missing, l.ignored, l.pending, l.complete, l.report
               from public.avatar_border_sync_log l order by l.id desc limit 1) s),
    'list', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'rarity', b.rarity, 'price', b.price, 'active', b.active,
              'image_url', b.image_url, 'origin', b.origin, 'repo_path', b.repo_path, 'price_auto', b.price_auto, 'missing', b.file_missing_at is not null,
              'owners', (select count(*) from public.avatar_border_owned o where o.border_id = b.id)) order by b.sort desc, b.id)
              from public.avatar_borders b), '[]'::jsonb));
end; $$;
revoke all on function public.dev_border_list() from public, anon;
grant execute on function public.dev_border_list() to authenticated;
