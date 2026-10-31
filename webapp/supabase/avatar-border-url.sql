-- ============================================================================================
-- AVATAR BORDER VIA URL .GIF (Panel Developer > tab Border)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH avatar-border.sql dan keamanan-6-panel-developer.sql. Jalankan keamanan-8-audit.sql lagi sesudahnya (opsional).
--
-- CARA KERJA
--  * Developer mengisi: nama, rarity, link .gif, harga -> tekan Impor -> border LANGSUNG muncul di Shop.
--  * Gambar TIDAK diunggah ke Supabase Storage dan TIDAK ikut di APK. Database hanya menyimpan link-nya (hemat storage).
--  * Border bawaan b01..b50 (gambar SVG di aplikasi) tetap ada supaya pembelian lama aman.
--
-- ATURAN KETAT (semua dijaga SERVER, aplikasi tidak bisa menipu)
--  1. Hanya developer yang bisa impor / ubah / hapus (is_developer()).
--  2. Nama: 1-40 karakter, tanpa < > dan karakter kontrol, tidak boleh kembar (huruf besar/kecil dianggap sama).
--  3. Link: wajib https, domain asli (bukan IP / localhost / port / user:pass@), wajib ada path, wajib berakhiran .gif, maks 500 karakter, tidak boleh kembar.
--  4. Harga: 1 - 100.000.000 DAN harus di dalam rentang rarity-nya (tabel avatar_border_tiers, bisa kamu ubah).
--  5. Maksimal 500 border dari impor.
--  6. Border yang sudah dibeli orang: rarity TIDAK bisa diubah. Kalau dihapus, pemilik otomatis dapat WakuGold kembali
--     sebesar harga yang mereka bayar. Harga boleh diubah; pembeli lama tidak ditagih ulang.
--  7. Border bawaan b01..b50 hanya bisa diubah harga / aktifnya.
-- ============================================================================================

-- ---------- 0) Bersihkan cara lama: border aset a001..a999 (gambar di dalam APK) ----------
-- Pemilik lama mendapat WakuGold kembali sebesar harga yang dibayar, lalu baris dihapus. Aman dijalankan berulang.
do $$ begin
  if exists (select 1 from public.avatar_borders where id ~ '^a[0-9]{3}$') then
    update public.wallets w set gold = w.gold + x.s, updated_at = now()
      from (select o.user_id, sum(o.price_paid)::bigint s from public.avatar_border_owned o where o.border_id ~ '^a[0-9]{3}$' group by o.user_id) x
     where w.user_id = x.user_id;
    insert into public.gold_ledger (user_id, delta, reason)
      select o.user_id, sum(o.price_paid)::bigint, 'avatar_border_refund' from public.avatar_border_owned o where o.border_id ~ '^a[0-9]{3}$' group by o.user_id;
    delete from public.avatar_borders where id ~ '^a[0-9]{3}$';     -- kepemilikan & pemakaian ikut terhapus (cascade)
  end if;
end $$;
alter table public.avatar_borders drop column if exists source;
alter table public.avatar_borders drop column if exists license;

-- ---------- 1) Struktur ----------
alter table public.avatar_borders add column if not exists image_url text;
create sequence if not exists public.avatar_border_seq;
alter table public.avatar_borders drop constraint if exists avatar_borders_id_check;
alter table public.avatar_borders add constraint avatar_borders_id_check check (id ~ '^(b[0-9]{2}|u[0-9]{1,9})$');
alter table public.avatar_borders drop constraint if exists avatar_borders_url_check;
alter table public.avatar_borders add constraint avatar_borders_url_check check (
  (id ~ '^b[0-9]{2}$' and image_url is null)
  or (id ~ '^u[0-9]{1,9}$' and image_url is not null and char_length(image_url) <= 500
      and image_url ~* '^https://([a-z0-9-]+\.)+[a-z]{2,}/[^[:space:]?#@]*\.gif(\?[^[:space:]#]*)?$'));
create unique index if not exists avatar_borders_name_uq on public.avatar_borders (lower(name));
create unique index if not exists avatar_borders_url_uq on public.avatar_borders (lower(image_url)) where image_url is not null;

-- Rentang harga tiap rarity (ubah lewat Table Editor kalau mau menyeimbangkan ulang)
create table if not exists public.avatar_border_tiers (
  rarity text primary key check (rarity in ('basic', 'standard', 'premium', 'epic', 'legendary', 'mythic')),
  min_price bigint not null check (min_price >= 1),
  max_price bigint not null check (max_price <= 100000000 and max_price >= min_price)
);
insert into public.avatar_border_tiers (rarity, min_price, max_price) values
  ('basic', 500, 1500), ('standard', 2000, 4500), ('premium', 5000, 10000),
  ('epic', 12000, 20000), ('legendary', 25000, 40000), ('mythic', 50000, 100000)
on conflict (rarity) do nothing;
alter table public.avatar_border_tiers enable row level security;
revoke all on public.avatar_border_tiers from anon, authenticated;

-- ---------- 2) Pemeriksa (dipakai impor & ubah) ----------
create or replace function public.avatar_border_check(p_name text, p_rarity text, p_url text, p_price bigint, p_id text default null)
returns table (nm text, u text) language plpgsql stable security definer set search_path = public as $$
declare t public.avatar_border_tiers;
begin
  nm := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  u := btrim(coalesce(p_url, ''));
  if char_length(nm) < 1 or char_length(nm) > 40 then raise exception 'Nama wajib diisi (1-40 karakter)'; end if;
  if nm ~ '[<>[:cntrl:]]' then raise exception 'Nama tidak boleh berisi < > atau karakter aneh'; end if;
  if exists (select 1 from public.avatar_borders where lower(name) = lower(nm) and id is distinct from p_id) then raise exception 'Nama border sudah dipakai'; end if;
  select * into t from public.avatar_border_tiers where rarity = p_rarity;
  if not found then raise exception 'Rarity tidak valid'; end if;
  if char_length(u) > 500 then raise exception 'Link maksimal 500 karakter'; end if;
  if u !~* '^https://([a-z0-9-]+\.)+[a-z]{2,}/[^[:space:]?#@]*\.gif(\?[^[:space:]#]*)?$' then
    raise exception 'Link harus https://domain/.../nama.gif (tanpa IP, port, atau user:pass@)';
  end if;
  if exists (select 1 from public.avatar_borders where lower(image_url) = lower(u) and id is distinct from p_id) then raise exception 'Link .gif ini sudah dipakai border lain'; end if;
  if p_price is null or p_price < 1 or p_price > 100000000 then raise exception 'Harga 1 sampai 100.000.000'; end if;
  if p_price < t.min_price or p_price > t.max_price then
    raise exception 'Harga % harus % sampai % WakuGold', initcap(p_rarity), t.min_price, t.max_price;
  end if;
  return next;
end; $$;
revoke all on function public.avatar_border_check(text, text, text, bigint, text) from public, anon, authenticated;

-- ---------- 3) IMPOR: border baru langsung muncul di Shop ----------
create or replace function public.dev_border_import(p_name text, p_rarity text, p_url text, p_price bigint) returns text
language plpgsql security definer set search_path = public as $$
declare c record; nid text;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  perform pg_advisory_xact_lock(hashtextextended('avatar_border_import', 5));
  if (select count(*) from public.avatar_borders where id ~ '^u') >= 500 then raise exception 'Batas 500 border impor tercapai. Hapus yang tidak terpakai dulu'; end if;
  select * into c from public.avatar_border_check(p_name, p_rarity, p_url, p_price, null);
  nid := 'u' || nextval('public.avatar_border_seq')::text;
  insert into public.avatar_borders (id, name, rarity, price, sort, active, image_url)
  values (nid, c.nm, p_rarity, p_price, coalesce((select max(sort) from public.avatar_borders), 0) + 1, true, c.u);
  return nid;
exception when unique_violation then raise exception 'Nama atau link .gif sudah dipakai';
end; $$;
revoke all on function public.dev_border_import(text, text, text, bigint) from public, anon;
grant execute on function public.dev_border_import(text, text, text, bigint) to authenticated;

-- ---------- 4) UBAH border impor (nama, rarity, link, harga, aktif) ----------
create or replace function public.dev_border_update(p_id text, p_name text, p_rarity text, p_url text, p_price bigint, p_active boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare b public.avatar_borders; c record; owners int;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  select * into b from public.avatar_borders where id = p_id for update;
  if not found then raise exception 'Border tidak ditemukan'; end if;
  if b.id !~ '^u' then raise exception 'Border bawaan hanya bisa diubah harga / aktifnya'; end if;
  select count(*) into owners from public.avatar_border_owned where border_id = b.id;
  if owners > 0 and p_rarity is distinct from b.rarity then raise exception 'Rarity tidak bisa diubah karena sudah dibeli % orang', owners; end if;
  select * into c from public.avatar_border_check(p_name, p_rarity, p_url, p_price, b.id);
  update public.avatar_borders set name = c.nm, rarity = p_rarity, image_url = c.u, price = p_price, active = coalesce(p_active, true) where id = b.id;
exception when unique_violation then raise exception 'Nama atau link .gif sudah dipakai';
end; $$;
revoke all on function public.dev_border_update(text, text, text, text, bigint, boolean) from public, anon;
grant execute on function public.dev_border_update(text, text, text, text, bigint, boolean) to authenticated;

-- ---------- 5) HAPUS: border impor dihapus total dari database. Kalau sudah ada yang membeli, pemilik otomatis dapat WakuGold kembali ----------
drop function if exists public.dev_border_delete(text);      -- versi lama mengembalikan void, sekarang jsonb
create or replace function public.dev_border_delete(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare owners int := 0; refunded bigint := 0;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  if p_id !~ '^u[0-9]{1,9}$' then raise exception 'Border bawaan tidak bisa dihapus (nonaktifkan saja)'; end if;
  perform pg_advisory_xact_lock(hashtextextended('avatar_border_import', 5));
  if not exists (select 1 from public.avatar_borders where id = p_id) then raise exception 'Border tidak ditemukan'; end if;
  select count(*), coalesce(sum(price_paid), 0) into owners, refunded from public.avatar_border_owned where border_id = p_id;
  if owners > 0 then
    update public.wallets w set gold = w.gold + x.price_paid, updated_at = now()
      from public.avatar_border_owned x where x.border_id = p_id and w.user_id = x.user_id;
    insert into public.gold_ledger (user_id, delta, reason)
      select user_id, price_paid, 'avatar_border_refund' from public.avatar_border_owned where border_id = p_id;
  end if;
  delete from public.avatar_borders where id = p_id;      -- kepemilikan & pemakaian ikut terhapus (cascade), tanpa sisa
  return jsonb_build_object('ok', true, 'owners', owners, 'refunded', refunded);
end; $$;
revoke all on function public.dev_border_delete(text) from public, anon;
grant execute on function public.dev_border_delete(text) to authenticated;

-- ---------- 6) Daftar untuk panel developer (semua border + jumlah pemilik + rentang harga) ----------
create or replace function public.dev_border_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  return jsonb_build_object(
    'tiers', coalesce((select jsonb_object_agg(rarity, jsonb_build_array(min_price, max_price)) from public.avatar_border_tiers), '{}'::jsonb),
    'list', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'rarity', b.rarity, 'price', b.price, 'active', b.active,
              'image_url', b.image_url, 'owners', (select count(*) from public.avatar_border_owned o where o.border_id = b.id)) order by b.sort desc, b.id)
              from public.avatar_borders b), '[]'::jsonb));
end; $$;
revoke all on function public.dev_border_list() from public, anon;
grant execute on function public.dev_border_list() to authenticated;

-- ---------- 7) Toko: sekarang ikut mengirim image_url ----------
create or replace function public.border_shop() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Login diperlukan'; end if;
  return jsonb_build_object(
    'gold', coalesce((select gold from public.wallets where user_id = me), 0),
    'equipped', (select border_id from public.avatar_border_equipped where user_id = me),
    'owned', coalesce((select jsonb_agg(border_id) from public.avatar_border_owned where user_id = me), '[]'::jsonb),
    'list', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'rarity', b.rarity, 'price', b.price, 'sort', b.sort, 'image_url', b.image_url) order by b.sort, b.id)
                        from public.avatar_borders b
                       where b.active or exists (select 1 from public.avatar_border_owned o where o.user_id = me and o.border_id = b.id)), '[]'::jsonb));
end; $$;
revoke all on function public.border_shop() from public, anon;
grant execute on function public.border_shop() to authenticated;

-- ---------- 8) Border yang dipakai pengguna lain (komentar, chat, profil, clan) - sekarang + image_url ----------
drop function if exists public.border_of(uuid[]);
create or replace function public.border_of(p_uids uuid[]) returns table (user_id uuid, border_id text, image_url text)
language sql stable security definer set search_path = public as $$
  select e.user_id, e.border_id, b.image_url
    from public.avatar_border_equipped e join public.avatar_borders b on b.id = e.border_id
   where auth.uid() is not null and e.user_id = any (p_uids[1:100]);
$$;
revoke all on function public.border_of(uuid[]) from public, anon;
grant execute on function public.border_of(uuid[]) to authenticated;

-- ---------- 9) Harga / aktif border BAWAAN (b01..b50): tetap dijaga rentang harga rarity. Border impor wajib lewat dev_border_update ----------
create or replace function public.dev_border_save(p_id text, p_price bigint, p_active boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare b public.avatar_borders; t public.avatar_border_tiers;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  select * into b from public.avatar_borders where id = p_id for update;
  if not found then raise exception 'Border tidak ditemukan'; end if;
  if b.id !~ '^b[0-9]{2}$' then raise exception 'Border impor diubah lewat dev_border_update'; end if;
  select * into t from public.avatar_border_tiers where rarity = b.rarity;
  if p_price is null or p_price < t.min_price or p_price > t.max_price then
    raise exception 'Harga % harus % sampai % WakuGold', initcap(b.rarity), t.min_price, t.max_price;
  end if;
  update public.avatar_borders set price = p_price, active = coalesce(p_active, true) where id = b.id;
end; $$;
revoke all on function public.dev_border_save(text, bigint, boolean) from public, anon;
grant execute on function public.dev_border_save(text, bigint, boolean) to authenticated;

-- ---------- 10) Impor file GIF dari HP (opsional, selain link): bucket publik, khusus developer, WAJIB di bawah 5 MB, hanya image/gif ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatar-border', 'avatar-border', true, 5242879, array['image/gif'])
on conflict (id) do update set public = true, file_size_limit = 5242879, allowed_mime_types = array['image/gif'];

drop policy if exists "avatar-border read" on storage.objects;
create policy "avatar-border read" on storage.objects for select using (bucket_id = 'avatar-border');
drop policy if exists "avatar-border dev insert" on storage.objects;
create policy "avatar-border dev insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatar-border' and public.is_developer() and name ~* '^[a-z0-9._-]+\.gif$');
drop policy if exists "avatar-border dev delete" on storage.objects;
create policy "avatar-border dev delete" on storage.objects for delete to authenticated using (bucket_id = 'avatar-border' and public.is_developer());
