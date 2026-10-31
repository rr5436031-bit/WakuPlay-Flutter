-- Background komentar (anime + komentar teman di halaman Akun) = wallpaper gacha milik pemilik komentar.
-- Aman diulang. Jalankan SETELAH banner-gacha-bebas.sql dan blokir.sql.
--
-- ATURAN (semua dijaga SERVER, aplikasi hanya mengikuti):
--  1. Hanya user yang login yang boleh meminta (anon ditolak).
--  2. Maks 100 user per permintaan; daftar kosong / NULL = hasil kosong, bukan error.
--  3. Hanya wallpaper gacha yang BENAR-BENAR dimiliki pemiliknya (wp_banner_owned). Custom URL (GIF Premium) TIDAK PERNAH ikut.
--  4. Link harus https, tanpa spasi, maks 500 huruf. Selain itu dibuang.
--  5. Akun yang sedang diblokir tidak menampilkan background.
--  6. Tabel profiles tidak bisa diubah dari aplikasi (insert/update/delete dicabut), jadi banner_url hanya berubah lewat set_my_banner().

create or replace function public.get_comment_banners(p_ids uuid[])
returns table (user_id uuid, banner_url text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.banner_url
    from public.profiles p
   where auth.uid() is not null
     and p_ids is not null
     and p.user_id = any (p_ids[1:100])
     and p.banner_url is not null
     and char_length(p.banner_url) <= 500
     and p.banner_url ~* '^https://[^[:space:]]+$'
     and public.wp_banner_owned(p.user_id, p.banner_url)
     and not public.is_banned(p.user_id);
$$;
revoke all on function public.get_comment_banners(uuid[]) from public, anon;
grant execute on function public.get_comment_banners(uuid[]) to authenticated;

-- Pastikan profiles tetap terkunci dari sisi aplikasi
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
