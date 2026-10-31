-- ============================================================================================
-- XP NONTON: +500 XP setiap 2 MENIT PENUH menonton (sebelumnya +150 XP tiap 1 menit)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH xp-aman.sql, gift-xp-500.sql, giveaway-xp.sql. Jalankan ini PALING TERAKHIR untuk fungsi xp_beat / user_xp_guard.
--
-- ATURAN KETAT (semua dijaga SERVER; angka di aplikasi hanya tampilan):
--  1. XP hanya cair kalau sudah >= 2 menit penuh sejak sesi dimulai / sejak XP terakhir. Kurang dari itu = 0 XP,
--     dan jam hitungnya TIDAK diulang (jadi mengirim detak lebih cepat tidak mengganggu detak yang sah berikutnya).
--     Toleransi 5 detik (115 dtk) untuk jeda jaringan; aplikasi sendiri menunggu 120 dtk penuh.
--  2. Jumlah tetap +500 XP per detak. Tidak ada pengali, bonus, atau tingkatan.
--  3. Posisi video harus maju wajar untuk 2 menit: 60 - 260 detik per detak (mendukung kecepatan 0,5x - 2x),
--     tidak melebihi waktu nyata x 2,2 + 5, dan tidak melebihi durasi episode. Loncat / seek = 0 XP.
--  4. Satu sesi per akun, satu detak per >= 115 detik per akun, jadi laju tertinggi 250 XP per menit.
--  5. Sesi basi (> 1 jam sejak detak terakhir) = mulai ulang tanpa XP.
--  6. KUNCI GANDA: angka 500 ada di xp_beat() DAN di trigger user_xp_guard (maks 500 per kali dari jalur nonton).
--     Jalur gift (maks 15.000) dan giveaway (maks 60.000) tidak berubah.
--  7. Aplikasi lama yang masih mengirim detak tiap 1 menit tidak error: detak ke-1 ditolak (terlalu cepat, jam tidak
--     diulang), detak ke-2 di menit ke-2 dibayar +500. Jadi aplikasi lama pun tidak bisa lebih cepat dari 2 menit.
--  8. Tetap masuk Leaderboard (xp_daily) seperti sebelumnya.
-- ============================================================================================

create or replace function public.xp_beat(p_token uuid, p_pos numeric default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.xp_sessions;
  el numeric; delta numeric; cur numeric;
  today date := (now() at time zone 'Asia/Jakarta')::date;
  per_beat constant numeric := 500;       -- harus sama dengan batas di user_xp_guard
  min_gap  constant numeric := 115;       -- 2 menit penuh (120 dtk) dikurangi toleransi jaringan 5 dtk
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into s from public.xp_sessions where user_id = uid and token = p_token for update;
  if not found then raise exception 'Sesi tidak valid'; end if;
  insert into public.user_xp (user_id, xp, last_tick) values (uid, 0, now() - interval '1 hour') on conflict (user_id) do nothing;
  select xp into cur from public.user_xp where user_id = uid;

  el := extract(epoch from (now() - s.last_beat));
  if el < min_gap then return cur; end if;                              -- belum 2 menit: tanpa XP, jam tidak diulang
  if el > 3600 then                                                     -- sesi basi: baseline baru tanpa XP
    update public.xp_sessions set last_beat = now(), last_pos = case when s.verified then p_pos end where user_id = uid;
    return cur;
  end if;

  if s.verified then
    if p_pos is null or s.last_pos is null then
      update public.xp_sessions set last_beat = now(), last_pos = p_pos where user_id = uid; return cur;
    end if;
    delta := p_pos - s.last_pos;
    if delta < 60 or delta > 260 or delta > el * 2.2 + 5 or p_pos > s.duration + 10 then
      update public.xp_sessions set last_beat = now(), last_pos = p_pos where user_id = uid; return cur;   -- loncat / seek: tanpa XP
    end if;
  end if;

  insert into public.xp_daily (user_id, day, gained) values (uid, today, 0) on conflict (user_id, day) do nothing;

  perform set_config('wp.xp_mode', 'beat', true);
  update public.user_xp set xp = xp + per_beat, last_tick = now() where user_id = uid returning xp into cur;
  perform set_config('wp.xp_mode', '', true);
  update public.xp_daily set gained = gained + per_beat, unverified = unverified + case when s.verified then 0 else per_beat end where user_id = uid and day = today;
  update public.xp_sessions set last_beat = now(), last_pos = case when s.verified then p_pos end, beats = beats + 1 where user_id = uid;
  return cur;
end; $$;
revoke all on function public.xp_beat(uuid, numeric) from public, anon;
grant execute on function public.xp_beat(uuid, numeric) to authenticated;

-- Penjaga tabel user_xp: batas jalur nonton naik jadi 500 (gift 15.000 dan giveaway 60.000 tetap)
create or replace function public.user_xp_guard() returns trigger
language plpgsql set search_path = public as $$
declare mode text := current_setting('wp.xp_mode', true);
begin
  if tg_op = 'INSERT' then
    if new.xp <> 0 and mode is distinct from 'beat' and mode is distinct from 'gift' and mode is distinct from 'gaxp' and not public.is_developer() then
      raise exception 'XP hanya bisa berubah lewat sesi nonton';
    end if;
  elsif new.xp is distinct from old.xp then
    if public.is_developer() then null;
    elsif mode = 'beat' and new.xp > old.xp and new.xp - old.xp <= 500 then null;
    elsif mode = 'gift' and new.xp > old.xp and new.xp - old.xp <= 15000 then null;
    elsif mode = 'gaxp' and new.xp > old.xp and new.xp - old.xp <= 60000 then null;
    else raise exception 'XP hanya bisa berubah lewat sesi nonton atau Panel Developer';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists user_xp_guard on public.user_xp;
create trigger user_xp_guard before insert or update on public.user_xp
  for each row execute function public.user_xp_guard();

notify pgrst, 'reload schema';
