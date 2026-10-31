-- Kebun Waku + Clan: LIHAT KEBUN & CLAN ORANG LAIN (hanya baca). Jalankan sekali di SQL Editor Supabase. Aman diulang.
--
-- ATURAN LIHAT KEBUN ORANG LAIN (ketat):
--  * farm_view HANYA MEMBACA (stable): tidak ada update / insert, tidak menyelesaikan produksi, tidak mengubah apa pun.
--  * Yang dikirim ke pelihat cuma: level, jumlah wortel matang (hitungan, bukan isi keranjang), dan dekorasi terpasang.
--    Tidak dikirim: WakuGold, isi/kapasitas keranjang, daftar item milik, harga, waktu panen berikutnya.
--  * Harus login. Fungsi aksi kebun (farm_harvest / farm_upgrade / farm_buy / farm_equip) tidak punya parameter user,
--    hanya bekerja pada akun yang sedang login, jadi kebun orang lain tidak mungkin diubah dari sisi kita.

create or replace function public.farm_view(p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.farm_players; lv public.farm_levels; ripe int := 0; cycles bigint; maxl int;
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  if p_uid is null then raise exception 'Pemain tidak valid'; end if;
  select max(level) into maxl from public.farm_levels;
  select * into p from public.farm_players where user_id = p_uid;
  if not found or p.level = 0 then
    return jsonb_build_object('level', 0, 'max_level', maxl, 'ripe', 0, 'equipped', coalesce(p.equipped, '{}'::jsonb), 'readonly', true);
  end if;
  select * into lv from public.farm_levels where level = p.level;
  ripe := p.stock;
  if p.last_tick is not null then
    cycles := floor(extract(epoch from (now() - p.last_tick)) / (lv.interval_min * 60));
    if cycles > 0 then ripe := least(lv.cap::bigint, p.stock + cycles * lv.yield)::int; end if;
  end if;
  return jsonb_build_object('level', p.level, 'max_level', maxl, 'ripe', ripe, 'equipped', coalesce(p.equipped, '{}'::jsonb), 'readonly', true);
end; $$;
revoke all on function public.farm_view(uuid) from public, anon;
grant execute on function public.farm_view(uuid) to authenticated;

-- Clan seseorang (null = belum punya clan)
create or replace function public.clan_of_user(p_uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'tag', c.tag, 'name', c.name)
    from public.clan_members m
    join public.clans c on c.id = m.clan_id and c.disbanded_at is null
   where auth.uid() is not null and m.user_id = p_uid
   limit 1;
$$;
revoke all on function public.clan_of_user(uuid) from public, anon;
grant execute on function public.clan_of_user(uuid) to authenticated;
