-- ============================================================================================
-- LAPOR / REQUEST + TAG @ID (notifikasi tag lewat SQL, TANPA Firebase)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
--
-- Syarat (sudah ada di project): schema.sql, teman-chat.sql, notifikasi.sql, gift-premium.sql,
--                                blokir.sql, keamanan-5-developer.sql
--
-- Isi file ini:
--   1) Tag orang di chat:  @<ID>  (contoh @1). Server yang memvalidasi, nama diisi server (tidak bisa dipalsukan).
--   2) Notifikasi tag lewat tabel `notifications` (SQL + Realtime). Push Firebase SENGAJA dilewati untuk jenis ini.
--   3) Ruang "Request" dan "Lapor" (tabel feedback_messages) dengan aturan ketat.
--   4) Tanda status oleh staf (Selesai / Ditolak) lewat fungsi server.
-- ============================================================================================

-- ---------- 0) Cek syarat dulu supaya tidak setengah jalan ----------
do $$
begin
  if to_regclass('public.global_messages') is null then raise exception 'Tabel global_messages belum ada. Jalankan schema.sql / chat-global.sql dulu.'; end if;
  if to_regclass('public.notifications') is null then raise exception 'Tabel notifications belum ada. Jalankan notifikasi.sql dulu.'; end if;
  if to_regclass('public.profiles') is null then raise exception 'Tabel profiles belum ada. Jalankan schema.sql dulu.'; end if;
  if to_regprocedure('public.wp_name(uuid)') is null then raise exception 'Fungsi wp_name belum ada. Jalankan teman-chat.sql dulu.'; end if;
  if to_regprocedure('public.ban_guard_user()') is null then raise exception 'Fungsi ban_guard_user belum ada. Jalankan blokir.sql dulu.'; end if;
  if to_regprocedure('public.is_staff()') is null then raise exception 'Fungsi is_staff belum ada. Jalankan keamanan-5-developer.sql dulu.'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'global_messages' and column_name = 'kind') then
    raise exception 'Kolom global_messages.kind belum ada. Jalankan gift-premium.sql dulu.';
  end if;
end $$;

-- ---------- 1) Jenis notifikasi baru: mention (tag) ----------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('friend_request', 'friend_accept', 'dm', 'episode', 'mention'));

-- Push Firebase DILEWATI untuk notifikasi tag (hanya kalau push.sql pernah dijalankan; kalau belum, bagian ini dilewati)
do $outer$
begin
  if to_regprocedure('public.notif_push()') is not null then
    execute $f$
create or replace function public.notif_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $b$
declare u text; s text;
begin
  if new.type = 'mention' then return null; end if;     -- tag: lewat SQL + Realtime saja, tanpa Firebase
  if tg_op = 'UPDATE' and not (new.type = 'dm' and new.read_at is null and new.body is distinct from old.body) then return null; end if;
  select value into u from public.push_config where key = 'push_url';
  select value into s from public.push_config where key = 'push_secret';
  if u is null or s is null or u like '%GANTI%' or s like '%GANTI%' then return null; end if;
  begin
    perform net.http_post(url := u, body := jsonb_build_object('notification_id', new.id),
                          headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', s),
                          timeout_milliseconds := 5000);
  exception when others then null;
  end;
  return null;
end; $b$
    $f$;
  end if;
end $outer$;

-- ---------- 2) Mesin tag ----------
-- Aturan tag (ketat tapi tidak pernah membuat pesan gagal kecuali melebihi batas):
--   * Format PAS:  @<angka tanpa nol di depan>, didahului awal teks / spasi / tanda baca (bukan huruf, angka, _ atau @)
--     dan diikuti akhir teks / spasi / tanda baca.  "@1" sah.  "a@1", "@01", "@1a", "@@1" TIDAK dianggap tag.
--   * ID harus ada di profiles.seq. ID yang tidak ada = teks biasa (tidak biru, tidak error).
--   * Maksimal 5 orang berbeda per pesan (lebih dari itu ditolak dengan pesan yang jelas).
--   * Tag diri sendiri tampil biru tetapi tidak membuat notifikasi.
--   * Anti-spam: satu pengirim hanya bisa membuat 5 notifikasi tag ke orang yang sama per 10 menit.
--   * Kolom `mentions` HANYA diisi server (kiriman dari aplikasi selalu ditimpa).
create or replace function public.mention_seqs(p_body text) returns bigint[]
language sql immutable as $$
  select coalesce(array_agg(s order by first_pos), '{}'::bigint[])
    from (
      select (t.m)[1]::bigint as s, min(t.ord) as first_pos
        from regexp_matches(coalesce(p_body, ''), '(?:^|[^A-Za-z0-9_@])@([1-9][0-9]{0,8})(?![A-Za-z0-9_])', 'g') with ordinality as t(m, ord)
       group by 1
    ) x;
$$;

create or replace function public.mention_resolve(p_body text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare seqs bigint[]; r jsonb;
begin
  seqs := public.mention_seqs(p_body);
  if coalesce(array_length(seqs, 1), 0) = 0 then return null; end if;
  if array_length(seqs, 1) > 5 then raise exception 'Maksimal 5 orang yang di-tag dalam satu pesan'; end if;
  select jsonb_agg(jsonb_build_object('seq', p.seq, 'uid', p.user_id, 'name', public.wp_name(p.user_id)) order by array_position(seqs, p.seq))
    into r from public.profiles p where p.seq = any(seqs);
  return r;      -- null kalau tidak ada ID yang cocok
end; $$;
revoke all on function public.mention_resolve(text) from public, anon, authenticated;

-- Buat notifikasi untuk tiap orang yang di-tag. TIDAK PERNAH menggagalkan pesan (semua error ditelan).
create or replace function public.mention_notify(p_room text, p_msg bigint, p_sender uuid, p_body text, p_mentions jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare t jsonb; tuid uuid; recent int; sname text; label text; prev text;
begin
  if p_mentions is null or jsonb_typeof(p_mentions) <> 'array' then return; end if;
  sname := public.wp_name(p_sender);
  label := case p_room when 'request' then 'Request' when 'lapor' then 'Lapor' else 'Chat Global' end;
  prev  := left(btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g')), 80);
  for t in select * from jsonb_array_elements(p_mentions) loop
    begin
      tuid := nullif(t->>'uid', '')::uuid;
      continue when tuid is null or tuid = p_sender;
      select count(*) into recent from public.notifications
       where user_id = tuid and type = 'mention' and data->>'from' = p_sender::text and created_at > now() - interval '10 minutes';
      continue when recent >= 5;
      insert into public.notifications (user_id, type, title, body, data, dedupe_key)
      values (tuid, 'mention', left(sname || ' menandai kamu', 120), 'di ' || label || ': ' || prev,
              jsonb_build_object('from', p_sender, 'room', p_room, 'msg', p_msg), 'mt-' || p_room || '-' || p_msg)
      on conflict do nothing;
    exception when others then null;
    end;
  end loop;
exception when others then null;
end; $$;
revoke all on function public.mention_notify(text, bigint, uuid, text, jsonb) from public, anon, authenticated;

-- Pratinjau tag di kolom ketik (nama sesuai ID), supaya pengguna yakin ID-nya pas sebelum kirim
create or replace function public.mention_preview(p_seqs bigint[]) returns table (seq bigint, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return query
  select p.seq, public.wp_name(p.user_id)
    from public.profiles p
   where p.seq = any((select coalesce(array_agg(x), '{}'::bigint[]) from (select distinct unnest(p_seqs) x limit 5) q));
end; $$;
revoke all on function public.mention_preview(bigint[]) from public, anon;
grant execute on function public.mention_preview(bigint[]) to authenticated;

-- ---------- 3) Chat Global: pasang tag ----------
alter table public.global_messages add column if not exists mentions jsonb;

-- Awalan "zz_" supaya jalan SETELAH trigger yang membersihkan isi pesan (aa_ban_guard, gchat_before_insert)
create or replace function public.gchat_mention_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.kind, 'text') = 'text' then new.mentions := public.mention_resolve(new.body); else new.mentions := null; end if;
  return new;
end; $$;
drop trigger if exists zz_gchat_mention_before on public.global_messages;
create trigger zz_gchat_mention_before before insert on public.global_messages for each row execute function public.gchat_mention_before();

create or replace function public.gchat_mention_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.mentions is not null then perform public.mention_notify('global', new.id, new.user_id, new.body, new.mentions); end if;
  return null;
end; $$;
drop trigger if exists zz_gchat_mention_after on public.global_messages;
create trigger zz_gchat_mention_after after insert on public.global_messages for each row execute function public.gchat_mention_after();

-- ---------- 4) Ruang Request & Lapor ----------
create table if not exists public.feedback_messages (
  id          bigint generated always as identity primary key,
  channel     text not null check (channel in ('request', 'lapor')),
  user_id     uuid not null references auth.users(id) on delete cascade,
  user_name   text,
  user_avatar text,
  user_seq    bigint,
  user_role   text,
  body        text not null check (char_length(body) between 1 and 500),
  reply_to    bigint references public.feedback_messages(id) on delete set null,
  reply_name  text,
  reply_body  text,
  mentions    jsonb,
  status      text not null default 'open' check (status in ('open', 'done', 'rejected')),
  status_by   uuid,
  status_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists feedback_channel_created on public.feedback_messages (channel, created_at desc);
create index if not exists feedback_user_created on public.feedback_messages (user_id, created_at desc);

alter table public.feedback_messages enable row level security;
revoke all on public.feedback_messages from anon, authenticated;
grant select, insert, delete on public.feedback_messages to authenticated;      -- TIDAK ada update langsung (status lewat fungsi server)
drop policy if exists "fb read" on public.feedback_messages;
drop policy if exists "fb insert own" on public.feedback_messages;
drop policy if exists "fb delete own" on public.feedback_messages;
drop policy if exists "fb delete staff" on public.feedback_messages;
create policy "fb read" on public.feedback_messages for select to authenticated using (true);
create policy "fb insert own" on public.feedback_messages for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'open' and status_by is null and status_at is null);
-- Penulis hanya boleh menghapus pesannya selagi masih "open" (belum ditandai staf). Staf boleh menghapus apa pun.
create policy "fb delete own" on public.feedback_messages for delete to authenticated using ((select auth.uid()) = user_id and status = 'open');
create policy "fb delete staff" on public.feedback_messages for delete to authenticated using (public.is_staff());

-- Aturan ketat + identitas dari server (nama, foto, ID, role tidak bisa dipalsukan)
create or replace function public.fb_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  r public.feedback_messages;
  nm text; av text;
  staff boolean;
  n_recent int; n_day int; minlen int; uniq int;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then raise exception 'Tidak diizinkan'; end if;

  select * into p from public.profiles where user_id = new.user_id;
  if p.muted_until is not null and p.muted_until > now() then
    raise exception 'Kamu sedang dibisukan sampai % WIB', to_char(p.muted_until at time zone 'Asia/Jakarta', 'DD/MM HH24:MI');
  end if;
  staff := coalesce(p.role, 'user') in ('moderator', 'admin', 'developer');

  -- bersihkan isi: buang karakter kontrol (Enter dipertahankan), maks 1 baris kosong berturut-turut
  new.body := btrim(regexp_replace(regexp_replace(coalesce(new.body, ''), E'[\\x01-\\x09\\x0b-\\x1f\\x7f]', '', 'g'), E'\\n{3,}', E'\\n\\n', 'g'));
  if char_length(new.body) = 0 then raise exception 'Pesan kosong'; end if;
  if char_length(new.body) > 500 then raise exception 'Maksimal 500 karakter'; end if;

  -- batas kecepatan (semua orang): maks 3 pesan per menit per ruang (staf 8 per 10 detik)
  if staff then
    select count(*) into n_recent from public.feedback_messages where user_id = new.user_id and created_at > now() - interval '10 seconds';
    if n_recent >= 8 then raise exception 'Terlalu cepat, tunggu beberapa detik'; end if;
  else
    select count(*) into n_recent from public.feedback_messages where user_id = new.user_id and channel = new.channel and created_at > now() - interval '60 seconds';
    if n_recent >= 3 then raise exception 'Terlalu cepat, maksimal 3 pesan per menit. Tunggu sebentar'; end if;

    -- batas harian: 20 pesan per 24 jam (Request + Lapor digabung)
    select count(*) into n_day from public.feedback_messages where user_id = new.user_id and created_at > now() - interval '24 hours';
    if n_day >= 20 then raise exception 'Batas harian tercapai (20 pesan per 24 jam)'; end if;

    -- panjang minimal: pesan asal-asalan ditolak
    minlen := case new.channel when 'lapor' then 20 else 15 end;
    if char_length(new.body) < minlen then
      raise exception '% minimal % karakter. Jelaskan dengan jelas ya', case new.channel when 'lapor' then 'Laporan' else 'Request' end, minlen;
    end if;
    -- minimal 5 karakter berbeda (menolak "aaaaaaaaaaaaaaaa" / "........")
    select count(distinct ch) into uniq from regexp_split_to_table(lower(regexp_replace(new.body, '\s', '', 'g')), '') ch;
    if uniq < 5 then raise exception 'Isi pesan tidak valid, tulis dengan kalimat yang jelas'; end if;

    -- tanpa link / iklan
    if new.body ~* '(https?://|www\.|wa\.me|t\.me/|discord\.gg|bit\.ly)' then raise exception 'Tidak boleh mengirim link. Jelaskan dengan kata-kata'; end if;

    -- tanpa pesan kembar dalam 30 menit
    if exists (select 1 from public.feedback_messages where user_id = new.user_id and lower(body) = lower(new.body) and created_at > now() - interval '30 minutes') then
      raise exception 'Pesan yang sama sudah kamu kirim, tunggu jawaban dulu';
    end if;
  end if;

  -- identitas: selalu dari server
  select coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''),
                  nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
         u.raw_user_meta_data->>'avatar_url'
    into nm, av from auth.users u where u.id = new.user_id;
  nm := left(btrim(regexp_replace(coalesce(nm, ''), '[^[:alnum:] ]', '', 'g')), 20);
  new.user_name   := coalesce(nullif(nm, ''), 'User');
  new.user_avatar := case when av ~ '^https://[a-z0-9-]+\.googleusercontent\.com/' and length(av) <= 500 then av else null end;
  new.user_seq    := p.seq;
  new.user_role   := coalesce(p.role, 'user');

  -- balasan: hanya boleh ke pesan di ruang yang sama; kutipan diambil dari pesan asli
  new.reply_name := null; new.reply_body := null;
  if new.reply_to is not null then
    select * into r from public.feedback_messages where id = new.reply_to and channel = new.channel;
    if found then new.reply_name := r.user_name; new.reply_body := left(r.body, 120); else new.reply_to := null; end if;
  end if;

  new.status := 'open'; new.status_by := null; new.status_at := null;
  new.created_at := now();
  return new;
end; $$;
drop trigger if exists fb_before_insert on public.feedback_messages;
create trigger fb_before_insert before insert on public.feedback_messages for each row execute function public.fb_before_insert();

-- Akun diblokir tidak bisa kirim (awalan "aa_" = dicek paling awal)
drop trigger if exists aa_ban_guard on public.feedback_messages;
create trigger aa_ban_guard before insert on public.feedback_messages for each row execute function public.ban_guard_user();

-- Tag di ruang Request/Lapor
create or replace function public.fb_mention_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.mentions := public.mention_resolve(new.body);
  return new;
end; $$;
drop trigger if exists zz_fb_mention_before on public.feedback_messages;
create trigger zz_fb_mention_before before insert on public.feedback_messages for each row execute function public.fb_mention_before();

create or replace function public.fb_mention_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.mentions is not null then perform public.mention_notify(new.channel, new.id, new.user_id, new.body, new.mentions); end if;
  return null;
end; $$;
drop trigger if exists zz_fb_mention_after on public.feedback_messages;
create trigger zz_fb_mention_after after insert on public.feedback_messages for each row execute function public.fb_mention_after();

-- Staf menandai status: open / done / rejected
create or replace function public.feedback_set_status(p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_staff() then raise exception 'Hanya staf yang boleh mengubah status'; end if;
  if p_status is null or p_status not in ('open', 'done', 'rejected') then raise exception 'Status tidak valid'; end if;
  update public.feedback_messages
     set status = p_status,
         status_by = case when p_status = 'open' then null else auth.uid() end,
         status_at = case when p_status = 'open' then null else now() end
   where id = p_id;
  if not found then raise exception 'Pesan tidak ditemukan'; end if;
end; $$;
revoke all on function public.feedback_set_status(bigint, text) from public, anon;
grant execute on function public.feedback_set_status(bigint, text) to authenticated;

-- Realtime: pesan baru, hapus, dan perubahan status langsung muncul
do $$ begin
  alter publication supabase_realtime add table public.feedback_messages;
exception when duplicate_object then null; end $$;
alter table public.feedback_messages replica identity full;

-- ---------- Selesai ----------
-- Cek cepat setelah dijalankan (opsional):
--   select public.mention_seqs('halo @1 dan @23, a@5 @01 @7a @@8');   -- hasil: {1,23}
