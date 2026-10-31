-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan SETELAH teman-chat.sql dan keamanan-7-akses-panel.sql (memakai wp_name() dan is_developer()), dan sebelum/ sesudah keamanan-8-audit.sql.
-- Fitur: developer bisa memblokir akun (menit/jam/hari/bulan/tahun/permanen) beserta alasannya, dan membuka blokirnya.

create table if not exists public.account_bans (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  reason     text not null check (char_length(reason) between 1 and 300),
  label      text not null,                 -- contoh: '4 jam', 'permanen'
  expires_at timestamptz,                   -- null = permanen
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at  timestamptz,                   -- terisi = blokir dibuka manual
  lifted_by  uuid references auth.users(id) on delete set null
);
create index if not exists account_bans_user on public.account_bans (user_id, created_at desc);
create unique index if not exists account_bans_one_open on public.account_bans (user_id) where lifted_at is null;
alter table public.account_bans enable row level security;
revoke all on public.account_bans from anon, authenticated;   -- semua akses lewat fungsi di bawah

-- Sedang diblokir? (internal, tidak bisa dipanggil dari aplikasi)
create or replace function public.is_banned(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.account_bans b
                  where b.user_id = p_uid and b.lifted_at is null and (b.expires_at is null or b.expires_at > now()));
$$;
revoke all on function public.is_banned(uuid) from public, anon, authenticated;

-- Akun yang diblokir tidak bisa menulis apa pun (komentar, chat global, chat pribadi) walau aplikasinya dimodifikasi.
create or replace function public.ban_guard_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_banned(new.user_id) then raise exception 'Akun kamu sedang diblokir'; end if;
  return new;
end; $$;
create or replace function public.ban_guard_dm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_banned(new.sender) then raise exception 'Akun kamu sedang diblokir'; end if;
  return new;
end; $$;
revoke all on function public.ban_guard_user() from public, anon, authenticated;
revoke all on function public.ban_guard_dm() from public, anon, authenticated;
-- awalan "aa_" supaya dicek paling awal
drop trigger if exists aa_ban_guard on public.comments;
create trigger aa_ban_guard before insert on public.comments for each row execute function public.ban_guard_user();
drop trigger if exists aa_ban_guard on public.global_messages;
create trigger aa_ban_guard before insert on public.global_messages for each row execute function public.ban_guard_user();
drop trigger if exists aa_ban_guard on public.direct_messages;
create trigger aa_ban_guard before insert on public.direct_messages for each row execute function public.ban_guard_dm();

-- Pengguna: info blokir aktif milik sendiri (kosong = tidak diblokir). server_now dipakai untuk menghitung sisa waktu dengan benar.
create or replace function public.get_my_ban()
returns table (reason text, label text, expires_at timestamptz, permanent boolean, server_now timestamptz)
language sql stable security definer set search_path = public as $$
  select b.reason, b.label, b.expires_at, (b.expires_at is null), now()
    from public.account_bans b
   where b.user_id = auth.uid() and b.lifted_at is null and (b.expires_at is null or b.expires_at > now())
   order by b.created_at desc
   limit 1;
$$;
revoke all on function public.get_my_ban() from public, anon;
grant execute on function public.get_my_ban() to authenticated;

-- Developer: cari user dengan ID PERSIS (mencari 2 hanya menemukan #2, bukan #22 / #23)
create or replace function public.dev_find_user(p_seq bigint)
returns table (user_id uuid, seq bigint, name text, email text, role text, banned boolean, ban_reason text, ban_label text, ban_expires_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  return query
  select p.user_id, p.seq, public.wp_name(p.user_id), u.email::text, p.role,
         (b.id is not null), b.reason, b.label, b.expires_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join lateral (select x.* from public.account_bans x
                        where x.user_id = p.user_id and x.lifted_at is null and (x.expires_at is null or x.expires_at > now())
                        order by x.created_at desc limit 1) b on true
   where p.seq = p_seq
   limit 1;
end; $$;
revoke all on function public.dev_find_user(bigint) from public, anon;
grant execute on function public.dev_find_user(bigint) to authenticated;

-- Developer: blokir. p_unit: menit | jam | hari | bulan | tahun | permanen
create or replace function public.dev_ban_user(p_target uuid, p_reason text, p_amount int, p_unit text)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare r text := btrim(coalesce(p_reason, '')); u text := lower(btrim(coalesce(p_unit, ''))); iv interval; v_exp timestamptz; lbl text; trole text; mx int;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if char_length(r) = 0 or char_length(r) > 300 then raise exception 'Alasan wajib diisi (maks 300 karakter)'; end if;
  if p_target is null or p_target = auth.uid() then raise exception 'Tidak bisa memblokir diri sendiri'; end if;
  select role into trole from public.profiles where user_id = p_target;
  if not found then raise exception 'User tidak ditemukan'; end if;
  if trole = 'developer' then raise exception 'Akun developer tidak bisa diblokir'; end if;
  if u not in ('menit', 'jam', 'hari', 'bulan', 'tahun', 'permanen') then raise exception 'Satuan waktu tidak valid'; end if;

  if u = 'permanen' then
    v_exp := null; lbl := 'permanen';
  else
    mx := 1000;
    if u = 'tahun' then mx := 100; end if;
    if p_amount is null or p_amount < 1 or p_amount > mx then raise exception 'Jumlah waktu tidak valid'; end if;
    iv := case u when 'menit' then make_interval(mins => p_amount) when 'jam' then make_interval(hours => p_amount)
                 when 'hari' then make_interval(days => p_amount) when 'bulan' then make_interval(months => p_amount)
                 else make_interval(years => p_amount) end;
    v_exp := now() + iv; lbl := p_amount || ' ' || u;
  end if;

  update public.account_bans set lifted_at = now(), lifted_by = auth.uid() where user_id = p_target and lifted_at is null;
  insert into public.account_bans (user_id, reason, label, expires_at, created_by) values (p_target, r, lbl, v_exp, auth.uid());
  insert into public.dev_audit (actor, target, field, old_value, new_value) values (auth.uid(), p_target, 'ban', null, lbl || ': ' || left(r, 200));
  return v_exp;
end; $$;
revoke all on function public.dev_ban_user(uuid, text, int, text) from public, anon;
grant execute on function public.dev_ban_user(uuid, text, int, text) to authenticated;

-- Developer: buka blokir
create or replace function public.dev_unban_user(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  update public.account_bans set lifted_at = now(), lifted_by = auth.uid() where user_id = p_target and lifted_at is null;
  insert into public.dev_audit (actor, target, field, old_value, new_value) values (auth.uid(), p_target, 'unban', null, null);
end; $$;
revoke all on function public.dev_unban_user(uuid) from public, anon;
grant execute on function public.dev_unban_user(uuid) to authenticated;

-- Developer: daftar akun yang sedang diblokir
create or replace function public.dev_list_bans()
returns table (user_id uuid, seq bigint, name text, reason text, label text, expires_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  return query
  select b.user_id, p.seq, public.wp_name(b.user_id), b.reason, b.label, b.expires_at, b.created_at
    from public.account_bans b
    left join public.profiles p on p.user_id = b.user_id
   where b.lifted_at is null and (b.expires_at is null or b.expires_at > now())
   order by b.created_at desc
   limit 100;
end; $$;
revoke all on function public.dev_list_bans() from public, anon;
grant execute on function public.dev_list_bans() to authenticated;

-- ============================================================================
-- BLOKIR PERANGKAT: perangkat yang pernah dipakai akun terblokir ikut terblokir (tidak bisa login dengan akun lain)
-- ============================================================================
create table if not exists public.user_devices (
  user_id    uuid not null references auth.users(id) on delete cascade,
  device_id  text not null check (char_length(device_id) between 16 and 128),
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (user_id, device_id)
);
create index if not exists user_devices_device on public.user_devices (device_id);
alter table public.user_devices enable row level security;
revoke all on public.user_devices from anon, authenticated;

-- Aplikasi mendaftarkan ID perangkatnya setiap kali akun terbuka (maks 20 perangkat per akun)
create or replace function public.register_device(p_device text) returns void
language plpgsql security definer set search_path = public as $$
declare d text := btrim(coalesce(p_device, ''));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if char_length(d) < 16 or char_length(d) > 128 or d !~ '^[A-Za-z0-9_-]+$' then return; end if;
  insert into public.user_devices (user_id, device_id) values (auth.uid(), d)
  on conflict (user_id, device_id) do update set last_seen = now();
  delete from public.user_devices
   where user_id = auth.uid()
     and device_id not in (select device_id from public.user_devices where user_id = auth.uid() order by last_seen desc limit 20);
end; $$;
revoke all on function public.register_device(text) from public, anon;
grant execute on function public.register_device(text) to authenticated;

-- Dipanggil SEBELUM login (anon boleh): perangkat ini sedang terblokir? (hanya mengembalikan data kalau memang terblokir)
create or replace function public.check_device_ban(p_device text)
returns table (reason text, label text, expires_at timestamptz, permanent boolean, server_now timestamptz)
language sql stable security definer set search_path = public as $$
  select b.reason, b.label, b.expires_at, (b.expires_at is null), now()
    from public.account_bans b
    join public.user_devices d on d.user_id = b.user_id
   where d.device_id = btrim(coalesce(p_device, '')) and char_length(btrim(coalesce(p_device, ''))) >= 16
     and b.lifted_at is null and (b.expires_at is null or b.expires_at > now())
   order by (b.expires_at is null) desc, b.expires_at desc
   limit 1;
$$;
revoke all on function public.check_device_ban(text) from public;
grant execute on function public.check_device_ban(text) to anon, authenticated;
