-- ============================================================================================
-- XP GIFT LANGSUNG DINAIKKAN: 1 hari x 1 orang = 500 XP (dulu 100)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH gift-xp.sql dan giveaway-xp.sql. Tidak mengubah pajak gift dan tidak menghapus catatan lama.
--  - xp_per_day maks 500 (bawaan 500), batas harian bawaan 30.000 XP (= 60 hari gift per hari)
--  - batas satu kali pemberian di user_xp_guard naik dari 3.000 ke 15.000 (30 hari x 500)
-- Aturan lain (hanya pemberi dapat XP, sekali bayar, tidak masuk Leaderboard) tidak berubah.
-- ============================================================================================

alter table public.gift_xp_config drop constraint if exists gift_xp_config_xp_per_day_check;
alter table public.gift_xp_config add constraint gift_xp_config_xp_per_day_check check (xp_per_day between 0 and 500);
alter table public.gift_xp_log drop constraint if exists gift_xp_log_xp_check;
alter table public.gift_xp_log add constraint gift_xp_log_xp_check check (xp between 0 and 15000);
alter table public.gift_xp_config alter column xp_per_day set default 500;
alter table public.gift_xp_config alter column daily_cap set default 30000;
update public.gift_xp_config set xp_per_day = 500, daily_cap = 30000 where id;

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
    elsif mode = 'beat' and new.xp > old.xp and new.xp - old.xp <= 150 then null;
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

-- Cek cepat (opsional): select * from public.gift_xp_config;     -- 500 / 30000

notify pgrst, 'reload schema';
