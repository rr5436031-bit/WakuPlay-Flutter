-- ============================================================
-- KEAMANAN WakuPlay: ID, level/XP, role, dan anti-pemalsuan data
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run
-- (aman dijalankan berulang). Jalankan SETELAH schema.sql, chat-global.sql, level-xp.sql.
-- ============================================================

-- ---------- 1) ROLE & BISU di profil (tidak bisa diubah user dari aplikasi) ----------
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists muted_until timestamptz;
do $$ begin
  alter table public.profiles add constraint profiles_role_check check (role in ('user', 'moderator', 'admin'));
exception when duplicate_object then null; end $$;

-- ---------- 2) CABUT HAK TULIS LANGSUNG ke tabel penting ----------
-- ID (#), role, XP/level hanya bisa berubah lewat fungsi server (trigger / add_xp), bukan dari aplikasi.
revoke all on public.profiles, public.profile_counter, public.user_xp from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;
revoke insert, update, delete, truncate on public.user_xp from authenticated;
revoke all on public.profile_counter from authenticated;
-- Chat & komentar: tidak boleh diedit setelah dikirim (hanya kirim & hapus milik sendiri)
revoke all on public.global_messages from anon;
revoke update, truncate on public.global_messages from authenticated;
revoke all on public.comments from anon;
revoke update, truncate on public.comments from authenticated;

-- ---------- 3) Pembantu: apakah user ini staf (moderator/admin)? ----------
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role in ('moderator', 'admin'));
$$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- Staf boleh menghapus pesan/komentar siapa pun (moderasi)
drop policy if exists "gchat delete staff" on public.global_messages;
create policy "gchat delete staff" on public.global_messages for delete to authenticated using (public.is_staff());
drop policy if exists "comments delete staff" on public.comments;
create policy "comments delete staff" on public.comments for delete to authenticated using (public.is_staff());

-- ---------- 4) CHAT GLOBAL: identitas SELALU dari server ----------
alter table public.global_messages add column if not exists user_role text;

create or replace function public.chat_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  r public.global_messages;
  nm text;
  av text;
  recent int;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Tidak diizinkan';
  end if;

  select * into p from public.profiles where user_id = new.user_id;
  if p.muted_until is not null and p.muted_until > now() then
    raise exception 'Kamu sedang dibisukan sampai % WIB', to_char(p.muted_until at time zone 'Asia/Jakarta', 'DD/MM HH24:MI');
  end if;

  -- isi pesan: buang karakter kontrol, tidak boleh kosong
  new.body := btrim(regexp_replace(new.body, '[[:cntrl:]]', '', 'g'));
  if char_length(new.body) = 0 then raise exception 'Pesan kosong'; end if;

  -- anti-spam: maksimal 5 pesan per 10 detik
  select count(*) into recent from public.global_messages where user_id = new.user_id and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'Terlalu cepat, tunggu beberapa detik'; end if;

  -- nama, foto, ID, role: diambil server-side, kiriman dari aplikasi DIABAIKAN (tidak bisa dipalsukan)
  select coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''),
                  nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
         u.raw_user_meta_data->>'avatar_url'
    into nm, av from auth.users u where u.id = new.user_id;
  nm := left(btrim(regexp_replace(coalesce(nm, ''), '[^[:alnum:] ]', '', 'g')), 20);
  new.user_name   := coalesce(nullif(nm, ''), 'User');
  new.user_avatar := case when av ~ '^https://[a-z0-9-]+\.googleusercontent\.com/' and length(av) <= 500 then av else null end;
  new.user_seq    := p.seq;
  new.user_role   := coalesce(p.role, 'user');

  -- kutipan balasan: diambil dari pesan aslinya, bukan dari kiriman user
  if new.reply_to is not null then
    select * into r from public.global_messages where id = new.reply_to;
    if found then
      new.reply_name := r.user_name; new.reply_body := left(r.body, 120);
    else
      new.reply_to := null; new.reply_name := null; new.reply_body := null;
    end if;
  else
    new.reply_name := null; new.reply_body := null;
  end if;

  new.created_at := now();
  return new;
end; $$;
drop trigger if exists gchat_before_insert on public.global_messages;
create trigger gchat_before_insert before insert on public.global_messages for each row execute function public.chat_before_insert();

-- ---------- 5) KOMENTAR: identitas dari server + anti-spam ----------
create or replace function public.comment_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  nm text;
  av text;
  recent int;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Tidak diizinkan';
  end if;
  select * into p from public.profiles where user_id = new.user_id;
  if p.muted_until is not null and p.muted_until > now() then
    raise exception 'Kamu sedang dibisukan sampai % WIB', to_char(p.muted_until at time zone 'Asia/Jakarta', 'DD/MM HH24:MI');
  end if;
  new.body := btrim(regexp_replace(new.body, '[[:cntrl:]]', ' ', 'g'));
  if char_length(new.body) = 0 then raise exception 'Komentar kosong'; end if;
  select count(*) into recent from public.comments where user_id = new.user_id and created_at > now() - interval '30 seconds';
  if recent >= 5 then raise exception 'Terlalu cepat, tunggu beberapa detik'; end if;

  select coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''),
                  nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
         u.raw_user_meta_data->>'avatar_url'
    into nm, av from auth.users u where u.id = new.user_id;
  nm := left(btrim(regexp_replace(coalesce(nm, ''), '[^[:alnum:] ]', '', 'g')), 20);
  new.user_name   := coalesce(nullif(nm, ''), 'User');
  new.user_avatar := case when av ~ '^https://[a-z0-9-]+\.googleusercontent\.com/' and length(av) <= 500 then av else null end;
  new.created_at  := now();
  return new;
end; $$;
drop trigger if exists comment_before_insert on public.comments;
create trigger comment_before_insert before insert on public.comments for each row execute function public.comment_before_insert();

-- ============================================================
-- CARA PAKAI (jalankan manual di SQL Editor bila perlu):
--   Jadikan admin / moderator (ganti angka dengan ID # user):
--     update public.profiles set role = 'admin'     where seq = 1;
--     update public.profiles set role = 'moderator' where seq = 5;
--   Bisukan user 1 jam / buka bisu:
--     update public.profiles set muted_until = now() + interval '1 hour' where seq = 7;
--     update public.profiles set muted_until = null where seq = 7;
--   Cek semua aturan (RLS) yang aktif:
--     select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by 1, 2;
-- ============================================================
