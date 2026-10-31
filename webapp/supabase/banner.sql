-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan SETELAH keamanan-7-akses-panel.sql (memakai is_developer()).
-- Banner info dari panel developer: tampil ke semua pengguna saat membuka aplikasi. Hanya ada SATU banner aktif.

create table if not exists public.app_banner (
  id             bigint generated always as identity primary key,
  title          text not null check (char_length(title) between 1 and 80),
  body           text not null check (char_length(body) between 1 and 600),
  button_enabled boolean not null default false,
  button_text    text check (button_text is null or char_length(button_text) between 1 and 30),
  button_url     text check (button_url is null or char_length(button_url) <= 500),
  active         boolean not null default true,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create unique index if not exists app_banner_one_active on public.app_banner (active) where active;
alter table public.app_banner enable row level security;
revoke all on public.app_banner from anon, authenticated;   -- semua akses lewat fungsi di bawah

-- Semua pengguna yang login: ambil banner aktif (kalau ada)
create or replace function public.get_active_banner()
returns table (id bigint, title text, body text, button_enabled boolean, button_text text, button_url text)
language sql stable security definer set search_path = public as $$
  select b.id, b.title, b.body, b.button_enabled, b.button_text, b.button_url
    from public.app_banner b
   where b.active and auth.uid() is not null
   limit 1;
$$;
revoke all on function public.get_active_banner() from public, anon;
grant execute on function public.get_active_banner() to authenticated;

-- Developer: pasang banner baru (otomatis mengganti banner aktif sebelumnya)
create or replace function public.dev_publish_banner(
  p_title text, p_body text, p_button boolean, p_button_text text, p_button_url text
) returns bigint
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, '')); bt text := btrim(coalesce(p_button_text, '')); bu text := btrim(coalesce(p_button_url, '')); nid bigint;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if char_length(t) = 0 or char_length(t) > 80 then raise exception 'Judul wajib diisi (maks 80 karakter)'; end if;
  if char_length(b) = 0 or char_length(b) > 600 then raise exception 'Teks wajib diisi (maks 600 karakter)'; end if;
  if p_button then
    if char_length(bt) = 0 or char_length(bt) > 30 then raise exception 'Teks tombol wajib diisi (maks 30 karakter)'; end if;
    if bu !~* '^https?://[^[:space:]]+$' or char_length(bu) > 500 then raise exception 'Link harus diawali http:// atau https://'; end if;
  else
    bt := null; bu := null;
  end if;
  update public.app_banner set active = false where active;
  insert into public.app_banner (title, body, button_enabled, button_text, button_url, created_by)
  values (t, b, coalesce(p_button, false), bt, bu, auth.uid()) returning id into nid;
  return nid;
end; $$;
revoke all on function public.dev_publish_banner(text, text, boolean, text, text) from public, anon;
grant execute on function public.dev_publish_banner(text, text, boolean, text, text) to authenticated;

-- Developer: matikan banner aktif (tidak ada banner yang tampil)
create or replace function public.dev_disable_banner() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  update public.app_banner set active = false where active;
end; $$;
revoke all on function public.dev_disable_banner() from public, anon;
grant execute on function public.dev_disable_banner() to authenticated;
