-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan SETELAH keamanan-7-akses-panel.sql (memakai is_developer()).
-- Pemberitahuan update: developer mengisi versi terbaru + teks + link download. Member yang versinya lebih lama melihat popup.

create table if not exists public.app_update (
  id             bigint generated always as identity primary key,
  latest_version text not null check (latest_version ~ '^[0-9]+(\.[0-9]+){0,3}$'),
  message        text not null check (char_length(message) between 1 and 600),
  download_url   text not null check (download_url ~* '^https?://[^[:space:]]+$' and char_length(download_url) <= 500),
  force_update   boolean not null default false,   -- true = popup tidak bisa ditutup
  active         boolean not null default true,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create unique index if not exists app_update_one_active on public.app_update (active) where active;
alter table public.app_update enable row level security;
revoke all on public.app_update from anon, authenticated;   -- semua akses lewat fungsi di bawah

-- Semua pengguna login: info update aktif (kalau ada). Aplikasi sendiri yang membandingkan versinya.
create or replace function public.get_app_update()
returns table (latest_version text, message text, download_url text, force_update boolean)
language sql stable security definer set search_path = public as $$
  select u.latest_version, u.message, u.download_url, u.force_update
    from public.app_update u
   where u.active and auth.uid() is not null
   limit 1;
$$;
revoke all on function public.get_app_update() from public, anon;
grant execute on function public.get_app_update() to authenticated;

-- Developer: pasang / ganti pemberitahuan update
create or replace function public.dev_publish_update(p_version text, p_message text, p_url text, p_force boolean default false)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v text := btrim(coalesce(p_version, '')); m text := btrim(coalesce(p_message, '')); l text := btrim(coalesce(p_url, '')); nid bigint;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if v !~ '^[0-9]+(\.[0-9]+){0,3}$' then raise exception 'Versi harus berupa angka, contoh: 1.1'; end if;
  if char_length(m) = 0 or char_length(m) > 600 then raise exception 'Teks pemberitahuan wajib diisi (maks 600 karakter)'; end if;
  if l !~* '^https?://[^[:space:]]+$' or char_length(l) > 500 then raise exception 'Link harus diawali http:// atau https://'; end if;
  update public.app_update set active = false where active;
  insert into public.app_update (latest_version, message, download_url, force_update, created_by)
  values (v, m, l, coalesce(p_force, false), auth.uid()) returning id into nid;
  return nid;
end; $$;
revoke all on function public.dev_publish_update(text, text, text, boolean) from public, anon;
grant execute on function public.dev_publish_update(text, text, text, boolean) to authenticated;

-- Developer: matikan pemberitahuan update
create or replace function public.dev_disable_update() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  update public.app_update set active = false where active;
end; $$;
revoke all on function public.dev_disable_update() from public, anon;
grant execute on function public.dev_disable_update() to authenticated;
