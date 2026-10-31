-- Jalankan di Supabase -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Panel Developer: daftar user + ubah data. SEMUA fungsi mengecek role = 'developer' di server,
-- jadi user biasa / admin / moderator tidak bisa memakainya walau memanggil API langsung.

-- Catatan perubahan (siapa mengubah apa) - hanya bisa dibaca lewat SQL Editor
create table if not exists public.dev_audit (
  id         bigint generated always as identity primary key,
  actor      uuid,
  target     uuid,
  field      text,
  old_value  text,
  new_value  text,
  created_at timestamptz not null default now()
);
alter table public.dev_audit enable row level security;
revoke all on public.dev_audit from anon, authenticated;

create or replace function public.is_developer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'developer');
$$;
revoke all on function public.is_developer() from public, anon;
grant execute on function public.is_developer() to authenticated;

-- Daftar user (cari: #ID, nama, email, atau awalan UID)
create or replace function public.dev_list_users(p_q text default '', p_limit int default 50, p_offset int default 0)
returns table (user_id uuid, seq bigint, name text, email text, role text, xp numeric, muted_until timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  qq text := btrim(coalesce(p_q, ''));
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  return query
  select p.user_id, p.seq, d.nm, u.email::text, p.role, coalesce(x.xp, 0), p.muted_until, u.created_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join public.user_xp x on x.user_id = p.user_id
    cross join lateral (
      select coalesce(nullif(left(btrim(regexp_replace(coalesce(
               nullif(u.raw_user_meta_data->>'display_name', ''), nullif(u.raw_user_meta_data->>'full_name', ''),
               nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)), '[^[:alnum:] ]', '', 'g')), 20), ''), 'User') as nm
    ) d
   where qq = ''
      or (case when qq ~ '^#?[0-9]{1,15}$' then p.seq = regexp_replace(qq, '^#', '')::bigint else false end)
      or p.user_id::text ilike qq || '%'
      or d.nm ilike '%' || qq || '%'
      or u.email ilike '%' || qq || '%'
   order by p.seq asc nulls last
   limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end; $$;
revoke all on function public.dev_list_users(text, int, int) from public, anon;
grant execute on function public.dev_list_users(text, int, int) to authenticated;

-- Ubah satu kolom user: role | seq (ID #) | xp | muted_until | name
create or replace function public.dev_update_user(p_target uuid, p_field text, p_val text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v text := nullif(btrim(coalesce(p_val, '')), '');
  v_old text;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if not exists (select 1 from public.profiles where user_id = p_target) then raise exception 'User tidak ditemukan'; end if;

  if p_field = 'role' then
    if v is null or v not in ('user', 'moderator', 'admin', 'developer') then raise exception 'Role tidak valid'; end if;
    select role into v_old from public.profiles where user_id = p_target;
    if v_old = 'developer' and v <> 'developer'
       and not exists (select 1 from public.profiles where role = 'developer' and user_id <> p_target) then
      raise exception 'Harus ada minimal 1 developer';
    end if;
    update public.profiles set role = v where user_id = p_target;

  elsif p_field = 'seq' then
    if v is null or v !~ '^[0-9]{1,12}$' then raise exception 'ID harus berupa angka'; end if;
    if v::bigint < 1 then raise exception 'ID minimal 1'; end if;
    if exists (select 1 from public.profiles where seq = v::bigint and user_id <> p_target) then
      raise exception 'ID # % sudah dipakai user lain', v;
    end if;
    select seq::text into v_old from public.profiles where user_id = p_target;
    update public.profiles set seq = v::bigint where user_id = p_target;
    -- penghitung ID user baru tidak boleh tertinggal di bawah ID tertinggi
    update public.profile_counter set last_seq = greatest(last_seq, (select coalesce(max(seq), 0) from public.profiles)) where id = 1;
    update public.global_messages set user_seq = v::bigint where user_id = p_target;

  elsif p_field = 'xp' then
    if v is null or v !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' then raise exception 'XP harus angka (maks. 2 desimal)'; end if;
    select xp::text into v_old from public.user_xp where user_id = p_target;
    insert into public.user_xp (user_id, xp, last_tick) values (p_target, v::numeric, now() - interval '1 hour')
    on conflict (user_id) do update set xp = excluded.xp;

  elsif p_field = 'muted_until' then
    select muted_until::text into v_old from public.profiles where user_id = p_target;
    if v is null then
      update public.profiles set muted_until = null where user_id = p_target;
    else
      begin
        update public.profiles set muted_until = v::timestamptz where user_id = p_target;
      exception when others then
        raise exception 'Format tanggal tidak valid';
      end;
    end if;

  elsif p_field = 'name' then
    v := regexp_replace(coalesce(v, ''), '\s+', ' ', 'g');
    if v !~ '^[A-Za-z0-9 ]{1,20}$' or btrim(v) = '' then raise exception 'Nama: 1-20 karakter, huruf/angka saja'; end if;
    select raw_user_meta_data->>'display_name' into v_old from auth.users where id = p_target;
    update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('display_name', v) where id = p_target;
    update public.global_messages set user_name = v where user_id = p_target;
    update public.comments set user_name = v where user_id = p_target;

  else
    raise exception 'Kolom tidak dikenal';
  end if;

  insert into public.dev_audit (actor, target, field, old_value, new_value) values (auth.uid(), p_target, p_field, v_old, v);
end; $$;
revoke all on function public.dev_update_user(uuid, text, text) from public, anon;
grant execute on function public.dev_update_user(uuid, text, text) to authenticated;

-- Lihat catatan perubahan:
--   select * from public.dev_audit order by id desc limit 50;
