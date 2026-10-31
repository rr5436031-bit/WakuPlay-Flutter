-- ============================================================================================
-- CHAT CLAN (tab "Clan" di halaman Chat) — cara kerja sama dengan chat global, tempatnya saja yang beda
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH wakugames-clan.sql, blokir.sql, keamanan-5-developer.sql dan baris-baru.sql.
--
-- ATURAN (semua dijaga SERVER, aplikasi yang dimodifikasi pun tidak bisa menembusnya):
--   1. Hanya ANGGOTA clan itu yang bisa membaca dan mengirim pesan. Keluar / dikeluarkan / clan dibubarkan = akses langsung hilang.
--   2. Nama, foto, ID (#) dan role pengirim diisi server (tidak bisa dipalsukan), sama seperti chat global.
--   3. Isi pesan 1-500 karakter, baris baru boleh, karakter kontrol dibuang, pesan kosong ditolak.
--   4. Anti-spam: maks 5 pesan per 10 detik. Akun dibisukan atau diblokir ditolak.
--   5. Balasan hanya bisa ke pesan di clan yang sama (kutipan diambil server dari pesan aslinya).
--   6. Hapus pesan: pemilik pesan, Leader clan itu, atau staff (moderator/admin/developer).
--   7. Giveaway & Gift Premium tetap hanya di Chat Global.
-- ============================================================================================

create table if not exists public.clan_messages (
  id          bigint generated always as identity primary key,
  clan_id     bigint not null references public.clans(id),
  user_id     uuid not null references auth.users(id) on delete cascade,
  user_name   text,
  user_avatar text,
  user_seq    bigint,
  user_role   text,
  body        text not null check (char_length(body) between 1 and 500),
  reply_to    bigint,
  reply_name  text,
  reply_body  text,
  created_at  timestamptz not null default now()
);
create index if not exists clan_messages_clan_time on public.clan_messages (clan_id, created_at desc);

-- Pembantu: apakah pemanggil anggota (atau Leader) clan itu? (clan yang sudah dibubarkan dianggap bukan)
create or replace function public.clan_chat_member(p_clan bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clan_members m join public.clans c on c.id = m.clan_id
                  where m.user_id = auth.uid() and m.clan_id = p_clan and c.disbanded_at is null);
$$;
create or replace function public.clan_chat_leader(p_clan bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clan_members m join public.clans c on c.id = m.clan_id
                  where m.user_id = auth.uid() and m.clan_id = p_clan and m.role = 'leader' and c.disbanded_at is null);
$$;
revoke all on function public.clan_chat_member(bigint), public.clan_chat_leader(bigint) from public, anon;
grant execute on function public.clan_chat_member(bigint), public.clan_chat_leader(bigint) to authenticated;

alter table public.clan_messages enable row level security;
revoke all on public.clan_messages from anon, authenticated;
grant select, insert, delete on public.clan_messages to authenticated;      -- tidak ada update: pesan tidak bisa diedit
drop policy if exists "cchat read" on public.clan_messages;
drop policy if exists "cchat insert" on public.clan_messages;
drop policy if exists "cchat delete" on public.clan_messages;
create policy "cchat read" on public.clan_messages for select to authenticated
  using (public.clan_chat_member(clan_id));
create policy "cchat insert" on public.clan_messages for insert to authenticated
  with check ((select auth.uid()) = user_id and public.clan_chat_member(clan_id));
create policy "cchat delete" on public.clan_messages for delete to authenticated
  using ((select auth.uid()) = user_id or public.clan_chat_leader(clan_id) or public.is_staff());

-- Pesan diproses server sebelum disimpan (sama dengan chat global)
create or replace function public.clan_chat_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  r public.clan_messages;
  nm text;
  av text;
  recent int;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Tidak diizinkan';
  end if;
  if not public.clan_chat_member(new.clan_id) then
    raise exception 'Kamu bukan anggota clan ini';
  end if;

  select * into p from public.profiles where user_id = new.user_id;
  if p.muted_until is not null and p.muted_until > now() then
    raise exception 'Kamu sedang dibisukan sampai % WIB', to_char(p.muted_until at time zone 'Asia/Jakarta', 'DD/MM HH24:MI');
  end if;

  new.body := btrim(regexp_replace(regexp_replace(new.body, E'[\\x01-\\x09\\x0b-\\x1f\\x7f]', '', 'g'), E'\n{3,}', E'\n\n', 'g'));
  if char_length(new.body) = 0 then raise exception 'Pesan kosong'; end if;

  select count(*) into recent from public.clan_messages where user_id = new.user_id and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'Terlalu cepat, tunggu beberapa detik'; end if;

  select coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''),
                  nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
         u.raw_user_meta_data->>'avatar_url'
    into nm, av from auth.users u where u.id = new.user_id;
  nm := left(btrim(regexp_replace(coalesce(nm, ''), '[^[:alnum:] ]', '', 'g')), 20);
  new.user_name   := coalesce(nullif(nm, ''), 'User');
  new.user_avatar := case when av ~ '^https://[a-z0-9-]+\.googleusercontent\.com/' and length(av) <= 500 then av else null end;
  new.user_seq    := p.seq;
  new.user_role   := coalesce(p.role, 'user');

  -- kutipan balasan: hanya dari pesan di clan yang SAMA
  if new.reply_to is not null then
    select * into r from public.clan_messages where id = new.reply_to and clan_id = new.clan_id;
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
revoke all on function public.clan_chat_before_insert() from public, anon, authenticated;
drop trigger if exists cchat_before_insert on public.clan_messages;
create trigger cchat_before_insert before insert on public.clan_messages for each row execute function public.clan_chat_before_insert();

-- Akun diblokir tidak bisa menulis (sama seperti chat global). Awalan "aa_" supaya dicek paling awal.
drop trigger if exists aa_ban_guard on public.clan_messages;
create trigger aa_ban_guard before insert on public.clan_messages for each row execute function public.ban_guard_user();

-- Realtime (pesan baru muncul langsung)
do $$ begin
  alter publication supabase_realtime add table public.clan_messages;
exception when duplicate_object then null; end $$;
alter table public.clan_messages replica identity full;
