-- ============================================================================================
-- PERBAIKI ID USER YANG LOMPAT (#190 -> #1000026)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
--
-- PENYEBAB: ubah ID di Panel Developer (tab Tabel) otomatis mengangkat penghitung ID ke ID tertinggi yang ada.
-- Begitu ada satu user berID besar (sekitar #1000025), semua user BARU ikut lompat ke #1000026, #1000027, ...
--
-- YANG DILAKUKAN:
--  1) Permanen: ID baru = ID tertinggi di bawah 1.000.000 + 1. ID besar buatan tangan (vanity, >= 1.000.000) tidak lagi
--     mempengaruhi nomor urut user baru. Nomor tidak pernah dipakai ganda.
--  2) Sekali jalan: user yang dibuat SETELAH user terakhir ber-ID normal tapi ber-ID >= 1.000.000 dirapikan, diurutkan
--     menurut waktu daftar, lanjut dari ID normal terakhir (#191, #192, ...). User lama ber-ID vanity TIDAK disentuh.
--     ID di pesan chat global ikut diperbarui. Hasil perubahan (ID lama -> baru) tampil di tabel paling bawah.
-- ============================================================================================

-- ---------- 1) Penetapan ID untuk user baru ----------
create or replace function public.assign_profile_seq() returns trigger
language plpgsql security definer set search_path = public as $$
declare base bigint; n bigint;
begin
  if new.seq is null then
    perform 1 from public.profile_counter where id = 1 for update;      -- antre: dua pendaftar bersamaan tidak dapat nomor sama
    select coalesce(max(seq), 0) into base from public.profiles where seq < 1000000;
    select greatest(base, case when last_seq < 1000000 then last_seq else 0 end) + 1 into n from public.profile_counter where id = 1;
    while exists (select 1 from public.profiles where seq = n) loop n := n + 1; end loop;
    update public.profile_counter set last_seq = n where id = 1;
    new.seq := n;
  end if;
  return new;
end; $$;

-- ---------- 2) Rapikan user yang terlanjur lompat ----------
create temp table if not exists _idfix_log (user_id uuid, id_lama bigint, id_baru bigint);
truncate _idfix_log;

do $$
declare base bigint; cutoff timestamptz; r record; n bigint;
begin
  select coalesce(max(seq), 0) into base from public.profiles where seq < 1000000;
  select created_at into cutoff from public.profiles where seq = base;
  n := base;
  for r in select user_id, seq from public.profiles
            where seq >= 1000000 and (cutoff is null or created_at > cutoff)
            order by created_at, seq loop
    n := n + 1;
    while exists (select 1 from public.profiles where seq = n) loop n := n + 1; end loop;
    insert into _idfix_log values (r.user_id, r.seq, n);
    update public.profiles set seq = n where user_id = r.user_id;
    update public.global_messages set user_seq = n where user_id = r.user_id;
  end loop;
  update public.profile_counter set last_seq = greatest(n, base) where id = 1;
end $$;

-- Hasil: ID lama -> ID baru (kosong = tidak ada yang perlu dirapikan).
select l.id_lama, l.id_baru, public.wp_name(l.user_id) as nama from _idfix_log l order by l.id_baru;
