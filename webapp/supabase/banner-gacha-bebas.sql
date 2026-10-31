-- ============================================================================================
-- BANNER: wallpaper gacha BEBAS (tanpa Premium) + Custom URL KHUSUS Premium/staf + background komentar
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH gacha-wallpaper.sql, perks-premium.sql dan profil-publik.sql.
-- JANGAN jalankan ulang ketiga file itu sesudah ini (akan menimpa aturan di bawah).
--
-- ATURAN (semua dijaga SERVER, APK yang dimodifikasi pun tidak bisa menembusnya):
--   1. Wallpaper hasil gacha MILIK SENDIRI boleh dipasang sebagai banner oleh siapa saja (tanpa Premium).
--      Server memeriksa wallpaper itu benar-benar ada di koleksimu. Menempel link wallpaper orang lain = ditolak.
--   2. Custom URL (.gif manual) HANYA Premium AKTIF / admin / developer / moderator. User biasa ditolak
--      walau memanggil API langsung (tanpa lewat layar aplikasi).
--   3. Menghapus banner selalu boleh.
--   4. Premium habis -> banner Custom URL otomatis TIDAK tampil lagi di profil siapa pun (data tidak dihapus,
--      tampil lagi kalau Premium aktif kembali). Banner wallpaper gacha tetap tampil.
--   5. Background komentar HANYA dari wallpaper gacha. Banner Custom URL tidak pernah dipakai di komentar,
--      jadi tidak bisa dipakai menumpangkan gambar luar ke komentar orang lain.
--   6. Tabel profiles tidak bisa diubah langsung dari client (hak ubah dicabut di keamanan.sql); satu-satunya jalan
--      mengubah banner adalah fungsi set_my_banner di bawah.
-- ============================================================================================

create index if not exists gacha_wallpapers_image_url on public.gacha_wallpapers (image_url);

-- Apakah p_url adalah wallpaper gacha yang DIMILIKI p_uid?
create or replace function public.wp_banner_owned(p_uid uuid, p_url text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_url is not null and exists (
    select 1 from public.gacha_inventory i join public.gacha_wallpapers g on g.id = i.wallpaper_id
     where i.user_id = p_uid and g.image_url = p_url);
$$;

-- Apakah banner p_url milik p_uid boleh TAMPIL sekarang? (wallpaper gacha milik sendiri, atau Custom URL dengan hak Premium/staf aktif)
create or replace function public.wp_banner_visible(p_uid uuid, p_url text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_url is not null and (public.wp_banner_owned(p_uid, p_url) or public.wp_perk_ok(p_uid, 'banner'));
$$;
revoke all on function public.wp_banner_owned(uuid, text), public.wp_banner_visible(uuid, text) from public, anon, authenticated;

-- ---------- Pasang / hapus banner ----------
create or replace function public.set_my_banner(p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v is not null and not public.wp_banner_owned(auth.uid(), v) then
    -- bukan wallpaper koleksi sendiri -> berarti Custom URL: wajib Premium / staf
    if not public.wp_perk_ok(auth.uid(), 'banner') then raise exception 'Custom URL khusus Premium'; end if;
    if char_length(v) > 500 or v !~* '^https?://[^[:space:]]+$' or v !~* '\.gif($|[?#])' then
      raise exception 'Link banner harus berupa URL .gif, atau pilih wallpaper dari koleksi gacha';
    end if;
  end if;
  insert into public.profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.profiles set banner_url = v where user_id = auth.uid();
end; $$;
revoke all on function public.set_my_banner(text) from public, anon;
grant execute on function public.set_my_banner(text) to authenticated;

-- ---------- Profil publik: banner Custom URL disembunyikan kalau haknya sudah tidak aktif ----------
create or replace function public.get_public_profile(p_uid uuid)
returns table (user_id uuid, name text, avatar text, seq bigint, role text, banner_url text, joined timestamptz, xp numeric, comments bigint)
language sql stable security definer set search_path = public as $$
  select p.user_id,
         coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
         u.raw_user_meta_data->>'avatar_url',
         p.seq, p.role,
         case when public.wp_banner_visible(p.user_id, p.banner_url) then p.banner_url else null end,
         case when p.role in ('developer', 'admin') then null else coalesce(u.created_at, p.created_at) end,
         case when p.role in ('developer', 'admin') then null else coalesce((select x.xp from public.user_xp x where x.user_id = p.user_id), 0) end,
         case when p.role in ('developer', 'admin') then null else (select count(*) from public.comments c where c.user_id = p.user_id) end
  from public.profiles p
  left join auth.users u on u.id = p.user_id
  where p.user_id = p_uid;
$$;
revoke all on function public.get_public_profile(uuid) from public, anon;
grant execute on function public.get_public_profile(uuid) to authenticated;

-- ---------- Background komentar: HANYA wallpaper gacha milik pemilik komentar ----------
-- Satu permintaan untuk banyak user (maks 100), hanya mengirim user yang punya banner gacha.
create or replace function public.get_comment_banners(p_ids uuid[])
returns table (user_id uuid, banner_url text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.banner_url
    from public.profiles p
   where auth.uid() is not null
     and p.user_id = any (p_ids[1:100])
     and p.banner_url is not null
     and public.wp_banner_owned(p.user_id, p.banner_url);
$$;
revoke all on function public.get_comment_banners(uuid[]) from public, anon;
grant execute on function public.get_comment_banners(uuid[]) to authenticated;
