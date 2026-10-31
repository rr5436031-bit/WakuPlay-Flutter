-- Pin (sematan) komentar di halaman Akun (komentar teman). Aman diulang.
-- Jalankan SETELAH teman-chat.sql, keamanan-5-developer.sql, blokir.sql.
--
-- ATURAN (semua dijaga SERVER; APK yang dimodifikasi tidak bisa melewati):
--  1. Yang boleh menyematkan / melepas: HANYA role admin atau developer (moderator & user ditolak), dan tidak sedang diblokir.
--  2. Yang boleh disematkan: hanya KOMENTAR UTAMA milik admin/developer (komentar mereka memang sudah tampil ke semua orang,
--     jadi sematan tidak membuka komentar pribadi teman ke orang lain). Balasan tidak bisa disematkan.
--  3. Maks 3 sematan sekaligus. Penuh = ditolak dengan kode LIMIT (bukan error), lepas dulu salah satu.
--  4. Tabel sematan terkunci total: tidak ada akses langsung dari aplikasi, hanya lewat 3 fungsi di bawah.
--  5. Sematan otomatis hilang kalau komentarnya dihapus, pemiliknya bukan lagi admin/developer, atau pemiliknya diblokir.
--  6. Semua orang yang login boleh MELIHAT sematan (get_pinned_feed). Menyematkan 2x tidak membuat dobel.
--  7. Semua hasil berupa jsonb { ok, code } supaya aplikasi tidak pecah; tidak ada exception untuk kasus biasa.

create table if not exists public.comment_pins (
  comment_id bigint primary key references public.comments(id) on delete cascade,
  pinned_by  uuid not null references auth.users(id) on delete cascade,
  pinned_at  timestamptz not null default now()
);
alter table public.comment_pins enable row level security;
revoke all on public.comment_pins from anon, authenticated;

-- Boleh menyematkan? (internal)
create or replace function public.can_pin_comment(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_uid is not null
     and exists (select 1 from public.profiles where user_id = p_uid and role in ('admin', 'developer'))
     and not public.is_banned(p_uid);
$$;
revoke all on function public.can_pin_comment(uuid) from public, anon, authenticated;

create or replace function public.pin_comment(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c record; n int;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NO_AUTH'); end if;
  if not public.can_pin_comment(me) then return jsonb_build_object('ok', false, 'code', 'FORBIDDEN'); end if;
  if p_id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select cm.id, cm.parent_id, cm.user_id into c from public.comments cm where cm.id = p_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if c.parent_id is not null then return jsonb_build_object('ok', false, 'code', 'REPLY'); end if;
  if not exists (select 1 from public.profiles where user_id = c.user_id and role in ('admin', 'developer')) then
    return jsonb_build_object('ok', false, 'code', 'NOT_STAFF_COMMENT');
  end if;
  if exists (select 1 from public.comment_pins where comment_id = p_id) then return jsonb_build_object('ok', true, 'code', 'ALREADY'); end if;
  select count(*) into n from public.comment_pins;
  if n >= 3 then return jsonb_build_object('ok', false, 'code', 'LIMIT'); end if;
  insert into public.comment_pins (comment_id, pinned_by) values (p_id, me) on conflict do nothing;
  return jsonb_build_object('ok', true, 'code', 'PINNED');
end; $$;
revoke all on function public.pin_comment(bigint) from public, anon;
grant execute on function public.pin_comment(bigint) to authenticated;

create or replace function public.unpin_comment(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'NO_AUTH'); end if;
  if not public.can_pin_comment(me) then return jsonb_build_object('ok', false, 'code', 'FORBIDDEN'); end if;
  delete from public.comment_pins where comment_id = p_id;
  return jsonb_build_object('ok', true, 'code', 'UNPINNED');
end; $$;
revoke all on function public.unpin_comment(bigint) from public, anon;
grant execute on function public.unpin_comment(bigint) to authenticated;

-- Daftar sematan (bentuk kolom sama dengan get_friend_feed + pinned_at). Tanpa batas 24 jam.
create or replace function public.get_pinned_feed()
returns table (id bigint, user_id uuid, name text, avatar text, seq bigint, role text, xp numeric,
               anime_id text, episode_id text, episode_number text, anime_title text, anime_poster text,
               body text, created_at timestamptz, reply_count bigint, pinned_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.user_id, public.wp_name(c.user_id), u.raw_user_meta_data->>'avatar_url', p.seq, p.role,
         coalesce((select x.xp from public.user_xp x where x.user_id = c.user_id), 0),
         c.anime_id, c.episode_id,
         left(coalesce(c.episode_number, h.episode_number), 20), left(coalesce(c.anime_title, h.anime_title), 200),
         case when coalesce(c.anime_poster, h.anime_poster) ~* '^https?://[^[:space:]]+$' and length(coalesce(c.anime_poster, h.anime_poster)) <= 500 then coalesce(c.anime_poster, h.anime_poster) end,
         c.body, c.created_at,
         (select count(*) from public.comments r where r.parent_id = c.id),
         k.pinned_at
    from public.comment_pins k
    join public.comments c on c.id = k.comment_id
    join auth.users u on u.id = c.user_id
    join public.profiles p on p.user_id = c.user_id
    left join public.watch_history h on h.user_id = c.user_id and h.episode_id = c.episode_id
   where auth.uid() is not null
     and c.parent_id is null
     and p.role in ('admin', 'developer')
     and not public.is_banned(c.user_id)
   order by k.pinned_at desc
   limit 3;
$$;
revoke all on function public.get_pinned_feed() from public, anon;
grant execute on function public.get_pinned_feed() to authenticated;
