-- ============================================================================================
-- BADGE TOP GIVER di profil (kayak badge TOP LB BULANAN) + ATURAN ANTI-BADGE-PALSU
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH top-giver.sql dan giveaway-premium.sql.
--
-- ATURAN BADGE (semuanya dijaga SERVER; aplikasi hanya menampilkan angka yang dikembalikan server):
--   1. Badge TIDAK disimpan di tabel mana pun. Tidak ada kolom badge di profil yang bisa diisi / diubah user.
--      Setiap kali profil dibuka, peringkat dihitung ulang dari catatan klaim giveaway permanen.
--   2. Badge hanya untuk 10 besar Top Giver BULANAN (bulan berjalan, WIB). Peringkat 11 ke bawah = tidak ada badge.
--   3. Yang dihitung = hari Premium dari giveaway Chat Global yang benar-benar DIKLAIM ORANG LAIN
--      (aturan lengkap ada di top-giver.sql: klaim sendiri, gift langsung, dan akun diblokir tidak dihitung;
--       satu penerima maksimal 60 hari per pemberi per bulan).
--   4. Tabel giveaways / giveaway_claims / profiles: user TIDAK bisa insert / update / delete langsung.
--      Semua perubahan hanya lewat fungsi server (giveaway_create / giveaway_claim) yang punya batasan sendiri.
--   5. Fungsi penghitung internal (top_giver_totals) tidak bisa dipanggil dari aplikasi; aplikasi hanya boleh
--      memanggil monthly_giver_of() yang hanya membaca.
--   6. Akun yang sedang diblokir tidak mendapat badge.
-- ============================================================================================

-- Peringkat Top Giver bulanan milik satu pengguna kalau masuk 10 besar, selain itu null (hanya membaca)
create or replace function public.monthly_giver_of(p_user uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare r int; mine bigint; ppl bigint; lastat timestamptz;
begin
  if auth.uid() is null or p_user is null then return null; end if;
  select t.days, t.people, t.last_at into mine, ppl, lastat
    from public.top_giver_totals(public.top_giver_from('monthly')) t where t.giver = p_user;
  if mine is null or mine <= 0 then return null; end if;
  -- urutan SAMA PERSIS dengan get_top_givers: hari terbanyak -> penerima berbeda lebih banyak -> lebih dulu mencapai angka itu -> id
  select count(*)::int + 1 into r
    from public.top_giver_totals(public.top_giver_from('monthly')) t
   where t.giver <> p_user
     and (t.days > mine
          or (t.days = mine and t.people > ppl)
          or (t.days = mine and t.people = ppl and t.last_at < lastat)
          or (t.days = mine and t.people = ppl and t.last_at = lastat and t.giver < p_user));
  return case when r <= 10 then r end;
end; $$;
revoke all on function public.monthly_giver_of(uuid) from public, anon;
grant execute on function public.monthly_giver_of(uuid) to authenticated;

-- Kunci tulis (diulang di sini sebagai penjaga; sama dengan giveaway-premium.sql & keamanan.sql)
alter table public.giveaways enable row level security;
alter table public.giveaway_claims enable row level security;
revoke insert, update, delete, truncate on public.giveaways, public.giveaway_claims from anon, authenticated;
revoke all on public.giveaway_claims from anon, authenticated;
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
revoke all on function public.top_giver_totals(timestamptz) from public, anon, authenticated;
revoke all on function public.top_giver_from(text) from public, anon, authenticated;

-- Cek cepat (jalankan manual, hasilnya harus kosong = tidak ada hak tulis yang bocor):
--   select grantee, table_name, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name in ('giveaways','giveaway_claims','profiles')
--      and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
