-- Jalankan di Supabase -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- WAJIB sudah menjalankan keamanan-6-panel-developer.sql lebih dulu.
--
-- Panel Developer SEKARANG HANYA untuk akun yang ID-nya didaftarkan manual di tabel dev_panel_access.
-- Punya role 'developer' SAJA tidak cukup. Syarat akses panel (dicek di server, bukan di aplikasi):
--   1) role di database = 'developer'  DAN
--   2) user_id-nya ada di tabel dev_panel_access (hanya bisa diisi lewat SQL Editor)
-- Tabel itu TERTUTUP dari API: aplikasi, panel, atau siapa pun yang memanggil API tidak bisa
-- menambah / membaca / mengubahnya -- termasuk developer yang sedang memakai panel.

create table if not exists public.dev_panel_access (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  granted_at timestamptz not null default now()
);
alter table public.dev_panel_access enable row level security;   -- tanpa policy = tidak ada akses lewat API
revoke all on public.dev_panel_access from public, anon, authenticated;

-- Pemeriksa utama. is_developer() (dipakai dev_list_users & dev_update_user) kini ikut aturan yang sama,
-- jadi SEMUA fungsi panel otomatis tertutup bagi yang belum didaftarkan.
create or replace function public.has_dev_panel() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.dev_panel_access a
      join public.profiles p on p.user_id = a.user_id
     where a.user_id = auth.uid() and p.role = 'developer'
  );
$$;
revoke all on function public.has_dev_panel() from public, anon;
grant execute on function public.has_dev_panel() to authenticated;

create or replace function public.is_developer() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_dev_panel();
$$;
revoke all on function public.is_developer() from public, anon;
grant execute on function public.is_developer() to authenticated;

-- Hanya akun ber-role developer yang boleh didaftarkan
create or replace function public.dev_panel_access_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where user_id = new.user_id and role = 'developer') then
    raise exception 'User ini belum ber-role developer. Beri role developer dulu, baru daftarkan akses panel.';
  end if;
  return new;
end; $$;
drop trigger if exists trg_dev_panel_access_guard on public.dev_panel_access;
create trigger trg_dev_panel_access_guard before insert or update on public.dev_panel_access
  for each row execute function public.dev_panel_access_guard();

-- Role developer dicabut -> akses panel ikut terhapus (tidak hidup lagi diam-diam kalau role dikembalikan)
create or replace function public.dev_panel_revoke_on_demote() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'developer' and new.role is distinct from 'developer' then
    delete from public.dev_panel_access where user_id = new.user_id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_dev_panel_revoke on public.profiles;
create trigger trg_dev_panel_revoke after update of role on public.profiles
  for each row execute function public.dev_panel_revoke_on_demote();

-- Catatan setiap pemberian / pencabutan akses (lihat: select * from public.dev_audit where field = 'panel_access' order by id desc;)
create or replace function public.dev_panel_access_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('public.dev_audit') is not null then
    if tg_op = 'INSERT' then
      insert into public.dev_audit (actor, target, field, old_value, new_value) values (auth.uid(), new.user_id, 'panel_access', null, 'granted');
    elsif tg_op = 'DELETE' then
      insert into public.dev_audit (actor, target, field, old_value, new_value) values (auth.uid(), old.user_id, 'panel_access', 'granted', 'revoked');
    end if;
  end if;
  return null;
end; $$;
drop trigger if exists trg_dev_panel_access_audit on public.dev_panel_access;
create trigger trg_dev_panel_access_audit after insert or delete on public.dev_panel_access
  for each row execute function public.dev_panel_access_audit();

-- =====================================================================================
-- CARA PAKAI (jalankan satu per satu di SQL Editor, hapus tanda -- di depannya)
-- =====================================================================================
-- Setelah file ini dijalankan, panel TERTUTUP untuk semua orang sampai kamu mendaftarkan ID.
--
-- Beri akses berdasarkan #ID (contoh #1):
--   insert into public.dev_panel_access (user_id, note)
--   select user_id, 'catatan bebas' from public.profiles where seq = 1;
--
-- Beri akses berdasarkan UID:
--   insert into public.dev_panel_access (user_id) values ('PASTE-UID-DI-SINI');
--
-- Cabut akses:
--   delete from public.dev_panel_access where user_id = (select user_id from public.profiles where seq = 1);
--
-- Lihat siapa yang punya akses:
--   select a.user_id, p.seq, p.role, a.note, a.granted_at
--     from public.dev_panel_access a left join public.profiles p on p.user_id = a.user_id order by a.granted_at;
