-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan SETELAH xp-buff.sql / leaderboard-xp.sql.
-- XP DIKUNCI DI SERVER: aplikasi (APK) tidak bisa menentukan jumlah XP. Server yang menghitung & membatasi:
--   * XP hanya lewat sesi nonton (xp_start -> xp_beat), 1 beat per >= 55 detik, +150 XP per beat (2 menit = 300 XP)
--   * posisi video harus maju wajar (30-130 dtk per beat & tidak melebihi waktu nyata x 2,2) dan tidak melebihi durasi episode
--   * TIDAK ADA batas total XP (harian / per episode / iframe). Satu-satunya "batas" adalah waktu: maksimal 1 beat per >= 55 detik
--     per akun, jadi laju tertinggi tetap 150 XP per menit (sekitar 216.000 XP per hari bila menonton 24 jam nonstop).
--   * KUNCI GANDA: angka 150 XP ada di fungsi xp_beat() DAN di trigger user_xp_guard (bagian bawah file ini). Trigger menolak
--     XP bertambah > 150 sekali jalan, dan menolak SEMUA perubahan XP selain dari xp_beat() / Panel Developer. Jadi biarpun
--     tabel user_xp tidak sengaja dibuka lagi suatu hari, XP tetap tidak bisa dimanipulasi dari APK.
-- Catatan jujur: tidak ada pengaman di dalam APK yang tidak bisa dibongkar; semua batas ada di server supaya APK yang dimodif pun tetap terbatas.
--   XP_PER_MIN di aplikasi hanya TAMPILAN. Mengubahnya di APK hasil bongkar tidak mengubah XP sebenarnya.

alter table public.xp_daily add column if not exists unverified numeric not null default 0;

create table if not exists public.xp_sessions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token      uuid not null default gen_random_uuid(),
  anime_id   text not null,
  ep_id      text not null,
  duration   numeric not null default 1500,
  verified   boolean not null default false,       -- true = posisi video dikirim & diperiksa
  started_at timestamptz not null default now(),
  last_beat  timestamptz not null default now(),
  last_pos   numeric,
  beats      int not null default 0
);
create table if not exists public.xp_ep_day (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  ep_id   text not null,
  secs    numeric not null default 0,
  primary key (user_id, day, ep_id)
);
alter table public.xp_sessions enable row level security;
alter table public.xp_ep_day enable row level security;
revoke all on public.xp_sessions, public.xp_ep_day from anon, authenticated;

-- Mulai sesi nonton (dipanggil saat video mulai diputar)
create or replace function public.xp_start(p_anime text, p_ep text, p_duration numeric, p_pos numeric default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); tok uuid := gen_random_uuid(); dur numeric; ver boolean;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_anime is null or p_ep is null or length(p_anime) > 100 or length(p_ep) > 200 then raise exception 'Data tidak valid'; end if;
  dur := least(greatest(coalesce(p_duration, 1500), 60), 14400);
  ver := p_pos is not null and p_pos >= 0;
  insert into public.xp_sessions (user_id, token, anime_id, ep_id, duration, verified, started_at, last_beat, last_pos, beats)
  values (uid, tok, p_anime, p_ep, dur, ver, now(), now(), case when ver then least(p_pos, dur + 5) end, 0)
  on conflict (user_id) do update set token = excluded.token, anime_id = excluded.anime_id, ep_id = excluded.ep_id, duration = excluded.duration,
    verified = excluded.verified, started_at = now(), last_beat = now(), last_pos = excluded.last_pos, beats = 0;
  return tok;
end; $$;
revoke all on function public.xp_start(text, text, numeric, numeric) from public, anon;
grant execute on function public.xp_start(text, text, numeric, numeric) to authenticated;

-- Detak tiap ~1 menit menonton. Mengembalikan total XP terbaru (tidak berubah bila ditolak).
create or replace function public.xp_beat(p_token uuid, p_pos numeric default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.xp_sessions;
  el numeric; delta numeric; cur numeric;
  today date := (now() at time zone 'Asia/Jakarta')::date;
  per_beat constant numeric := 150;       -- harus sama dengan XP_PER_MIN di aplikasi dan batas di trigger user_xp_guard
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into s from public.xp_sessions where user_id = uid and token = p_token for update;
  if not found then raise exception 'Sesi tidak valid'; end if;
  insert into public.user_xp (user_id, xp, last_tick) values (uid, 0, now() - interval '1 hour') on conflict (user_id) do nothing;
  select xp into cur from public.user_xp where user_id = uid;

  el := extract(epoch from (now() - s.last_beat));
  if el < 55 then return cur; end if;                                   -- terlalu cepat
  if el > 3600 then                                                     -- sesi basi: mulai baseline baru tanpa XP
    update public.xp_sessions set last_beat = now(), last_pos = case when s.verified then p_pos end where user_id = uid;
    return cur;
  end if;

  if s.verified then
    if p_pos is null or s.last_pos is null then
      update public.xp_sessions set last_beat = now(), last_pos = p_pos where user_id = uid; return cur;
    end if;
    delta := p_pos - s.last_pos;
    if delta < 30 or delta > 130 or delta > el * 2.2 + 5 or p_pos > s.duration + 10 then
      update public.xp_sessions set last_beat = now(), last_pos = p_pos where user_id = uid; return cur;   -- loncat/seek/terlalu cepat: tanpa XP
    end if;
  end if;

  insert into public.xp_daily (user_id, day, gained) values (uid, today, 0) on conflict (user_id, day) do nothing;

  perform set_config('wp.xp_mode', 'beat', true);                      -- izin khusus untuk trigger user_xp_guard (hanya berlaku di transaksi ini)
  update public.user_xp set xp = xp + per_beat, last_tick = now() where user_id = uid returning xp into cur;
  perform set_config('wp.xp_mode', '', true);
  update public.xp_daily set gained = gained + per_beat, unverified = unverified + case when s.verified then 0 else per_beat end where user_id = uid and day = today;
  update public.xp_sessions set last_beat = now(), last_pos = case when s.verified then p_pos end, beats = beats + 1 where user_id = uid;
  return cur;
end; $$;
revoke all on function public.xp_beat(uuid, numeric) from public, anon;
grant execute on function public.xp_beat(uuid, numeric) to authenticated;

-- ===== PENJAGA TABEL user_xp (kunci ganda) =====
-- XP hanya boleh berubah lewat: (1) xp_beat() = naik maksimal 150 per kali, (2) Panel Developer (dev_update_user).
-- Selain itu ditolak, siapa pun penggunanya.
create or replace function public.user_xp_guard() returns trigger
language plpgsql set search_path = public as $$
declare mode text := current_setting('wp.xp_mode', true);
begin
  if tg_op = 'INSERT' then
    if new.xp <> 0 and mode is distinct from 'beat' and not public.is_developer() then
      raise exception 'XP hanya bisa berubah lewat sesi nonton';
    end if;
  elsif new.xp is distinct from old.xp then
    if public.is_developer() then null;                                                    -- Panel Developer
    elsif mode = 'beat' and new.xp > old.xp and new.xp - old.xp <= 150 then null;          -- sesi nonton: maks 150 XP
    else raise exception 'XP hanya bisa berubah lewat sesi nonton atau Panel Developer';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists user_xp_guard on public.user_xp;
create trigger user_xp_guard before insert or update on public.user_xp
  for each row execute function public.user_xp_guard();
-- Catatan: kalau SUATU SAAT kamu sendiri perlu mengubah XP lewat SQL Editor, matikan sementara:
--   alter table public.user_xp disable trigger user_xp_guard;  ...ubah...  alter table public.user_xp enable trigger user_xp_guard;

-- ===== TERAKHIR: matikan add_xp() lama (APK lama yang belum update tidak lagi dapat XP) =====
-- Jalankan bagian ini bersamaan dengan merilis APK baru.
create or replace function public.add_xp() returns numeric
language plpgsql security definer set search_path = public as $$
begin raise exception 'Perbarui aplikasi WakuPlay ke versi terbaru'; end; $$;
revoke all on function public.add_xp() from public, anon, authenticated;
