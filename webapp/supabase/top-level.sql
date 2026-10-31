-- ============================================================================================
-- TOP LEVEL (slide ke-4 banner Home + halaman Top Level + badge TOP LEVEL di profil)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH level-xp.sql, blokir.sql, keamanan-6-panel-developer.sql.
--
-- Top Level = orang dengan level (XP total) TERTINGGI sepanjang waktu. Tidak ada harian / mingguan / bulanan.
--
-- ATURAN KETAT (semuanya dijaga SERVER; aplikasi hanya menampilkan angka yang dikembalikan server):
--   1. Peringkat dihitung dari total XP di tabel user_xp (level hanya turunan dari XP, jadi urutannya sama).
--      Pakai XP, bukan angka level, supaya dua orang dengan level sama tetap terurut adil.
--   2. Badge TIDAK disimpan di tabel mana pun. Tidak ada kolom badge yang bisa diisi / diubah user.
--      Setiap profil dibuka, peringkat dihitung ulang dari user_xp.
--   3. Badge hanya untuk 10 besar. Peringkat 11 ke bawah = tidak ada badge. Halaman Top Level menampilkan 100 besar.
--   4. Akun diblokir tidak tampil dan tidak mendapat badge. Begitu blokir dibuka, otomatis muncul lagi.
--   5. Akun Developer / Admin tidak ikut peringkat (level mereka di aplikasi memang tampil maksimal, bukan hasil XP).
--   6. XP 0 tidak masuk peringkat.
--   7. Urutan: XP terbanyak -> kalau sama, id pengguna (hasil selalu sama, tidak acak antar pemanggilan).
--   8. XP user_xp hanya bisa berubah lewat sesi nonton / gift / giveaway / Panel Developer (dijaga user_xp_guard).
--      Jadi peringkat tidak bisa dipalsukan dari aplikasi.
--   9. Tiga fungsi di bawah memakai SATU sumber urutan yang sama (top_level_ranked), jadi badge, halaman,
--      dan slide banner tidak pernah beda angka.
--  10. Semua fungsi hanya MEMBACA. Tidak mengubah XP, level, profil, atau Premium siapa pun.
-- ============================================================================================

create index if not exists user_xp_rank on public.user_xp (xp desc, user_id);

-- Urutan resmi (internal, tidak bisa dipanggil dari aplikasi). p_limit 1..100
create or replace function public.top_level_ranked(p_limit int)
returns table (rk bigint, uid uuid, xp numeric)
language sql stable security definer set search_path = public as $$
  select row_number() over (order by x.xp desc, x.user_id), x.user_id, x.xp
    from public.user_xp x
   where x.xp > 0
     and not public.is_banned(x.user_id)
     and not exists (select 1 from public.profiles p where p.user_id = x.user_id and p.role in ('developer', 'admin'))
   order by x.xp desc, x.user_id
   limit least(greatest(coalesce(p_limit, 100), 1), 100);
$$;
revoke all on function public.top_level_ranked(int) from public, anon, authenticated;

-- Top 1..100
create or replace function public.get_top_levels(p_limit int default 100)
returns table (rank bigint, user_id uuid, name text, avatar text, seq bigint, role text, total_xp numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return query
  select q.rk, q.uid,
         coalesce(u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'full_name',
                  u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'User'),
         u.raw_user_meta_data->>'avatar_url',
         pr.seq, coalesce(pr.role, 'user'), q.xp
    from public.top_level_ranked(p_limit) q
    join auth.users u on u.id = q.uid
    left join public.profiles pr on pr.user_id = q.uid
   order by q.rk;
end; $$;
revoke all on function public.get_top_levels(int) from public, anon;
grant execute on function public.get_top_levels(int) to authenticated;

-- Peringkat milik sendiri (untuk yang belum masuk 100 besar). rank = null kalau tidak ikut peringkat.
create or replace function public.get_my_top_level()
returns table (rank bigint, total_xp numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := auth.uid(); mine numeric; r bigint;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select x.xp into mine from public.user_xp x where x.user_id = me;
  if mine is null or mine <= 0 or public.is_banned(me)
     or exists (select 1 from public.profiles p where p.user_id = me and p.role in ('developer', 'admin')) then
    return query select null::bigint, coalesce(mine, 0::numeric);
    return;
  end if;
  select count(*) + 1 into r
    from public.user_xp x
   where (x.xp > mine or (x.xp = mine and x.user_id < me))
     and not public.is_banned(x.user_id)
     and not exists (select 1 from public.profiles p where p.user_id = x.user_id and p.role in ('developer', 'admin'));
  return query select r, mine;
end; $$;
revoke all on function public.get_my_top_level() from public, anon;
grant execute on function public.get_my_top_level() to authenticated;

-- Badge: peringkat Top Level satu pengguna kalau masuk 10 besar, selain itu null (hanya membaca)
create or replace function public.top_level_of(p_user uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare r int;
begin
  if auth.uid() is null or p_user is null then return null; end if;
  select q.rk::int into r from public.top_level_ranked(10) q where q.uid = p_user;
  return r;
end; $$;
revoke all on function public.top_level_of(uuid) from public, anon;
grant execute on function public.top_level_of(uuid) to authenticated;

-- Kunci tulis (penjaga; sama dengan file lain)
revoke insert, update, delete, truncate on public.user_xp from anon, authenticated;

-- Cek cepat (opsional, jalankan terpisah):
--   select * from public.get_top_levels(10);      -- harus urut XP terbesar, tanpa developer/admin/akun diblokir
--   select public.top_level_of('<uuid user>');    -- 1..10 atau null

notify pgrst, 'reload schema';
