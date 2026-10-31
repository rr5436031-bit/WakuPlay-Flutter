-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Mengizinkan BARIS BARU (tombol Enter) di chat global & komentar. Karakter kontrol lain tetap dibuang.

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

  -- isi pesan: buang karakter kontrol (baris baru DIPERTAHANKAN, maks 1 baris kosong berturut-turut), tidak boleh kosong
  new.body := btrim(regexp_replace(regexp_replace(new.body, E'[\\x01-\\x09\\x0b-\\x1f\\x7f]', '', 'g'), E'\n{3,}', E'\n\n', 'g'));
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
  new.body := btrim(regexp_replace(regexp_replace(new.body, E'[\\x01-\\x09\\x0b-\\x1f\\x7f]', '', 'g'), E'\n{3,}', E'\n\n', 'g'));
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
