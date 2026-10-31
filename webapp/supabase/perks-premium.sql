-- ============================================================================================
-- FITUR KHUSUS PREMIUM / STAF: ubah nama akun, pasang banner profil
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH premium.sql dan profil-publik.sql.
--
-- ATURAN (ubah di fungsi wp_perk_ok di bawah; samakan dengan src/lib/perks.js):
--   * Role admin / developer / moderator  -> boleh tanpa Premium
--   * User biasa dengan Premium AKTIF     -> boleh
--   * User biasa tanpa Premium            -> DITOLAK server (walau memanggil API langsung)
--   * Menghapus banner / mengembalikan nama ke nama Google selalu boleh (tidak dikunci).
-- ============================================================================================

create or replace function public.wp_perk_ok(p_uid uuid, p_perk text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_perk in ('rename', 'banner', 'skip_intro') and (
    exists (select 1 from public.profiles where user_id = p_uid and role in ('admin', 'developer', 'moderator'))
    or exists (select 1 from public.premium_members where user_id = p_uid and expires_at > now())
  );
$$;
revoke all on function public.wp_perk_ok(uuid, text) from public, anon, authenticated;
grant execute on function public.wp_perk_ok(uuid, text) to service_role;

-- ---------- Banner profil: memasang butuh Premium/staf (menghapus bebas) ----------
create or replace function public.set_my_banner(p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v is not null and not public.wp_perk_ok(auth.uid(), 'banner') then
    raise exception 'Banner profil khusus Premium';
  end if;
  if v is not null and (char_length(v) > 500 or v !~* '^https?://[^[:space:]]+$' or v !~* '\.gif($|[?#])') then
    raise exception 'Link banner harus berupa URL .gif';
  end if;
  insert into public.profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.profiles set banner_url = v where user_id = auth.uid();
end; $$;
revoke all on function public.set_my_banner(text) from public, anon;
grant execute on function public.set_my_banner(text) to authenticated;

-- ---------- Ubah nama: penjaga di tabel auth.users (nama disimpan di raw_user_meta_data.display_name) ----------
-- Hanya berlaku saat PENGGUNA SENDIRI mengubah namanya. Proses server/admin tidak terganggu.
create or replace function public.wp_guard_rename() returns trigger
language plpgsql security definer set search_path = public as $$
declare o text := coalesce(old.raw_user_meta_data->>'display_name', ''); n text := coalesce(new.raw_user_meta_data->>'display_name', '');
begin
  if n <> o and n <> '' and auth.uid() is not null and auth.uid() = new.id and not public.wp_perk_ok(new.id, 'rename') then
    raise exception 'Ubah nama khusus Premium';
  end if;
  return new;
end; $$;

drop trigger if exists wp_guard_rename_trg on auth.users;
create trigger wp_guard_rename_trg before update of raw_user_meta_data on auth.users
  for each row execute function public.wp_guard_rename();
