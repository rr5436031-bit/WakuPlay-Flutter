-- ============================================================================================
-- AVATAR BORDER v2: folder rarity di GitHub, harga otomatis per rarity, sinkronisasi upload manual
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH avatar-border.sql dan avatar-border-url.sql.
--
-- YANG DITAMBAHKAN (tabel avatar_borders yang sudah ada TETAP dipakai, tidak ada tabel Border kedua):
--  * avatar_border_prices     : harga WakuGold per rarity (sumber kebenaran, diubah Developer dari Panel).
--  * avatar_borders           : kolom baru repo_path (identitas unik file GitHub), origin, price_auto, file_missing_at, synced_at.
--  * avatar_border_sync_log   : riwayat sinkronisasi (20 terakhir) untuk Panel Developer.
--  * dev_border_import        : harga boleh kosong -> otomatis dari rarity. Dipakai impor Panel DAN sinkronisasi (satu pintu: avatar_border_register).
--  * dev_border_sync_apply    : dipanggil Edge Function `border-gif` (aksi sync) atas nama developer yang login.
--  * dev_border_price_set / dev_border_price_apply : ubah harga rarity, dan (opsional, eksplisit) terapkan ke border lama.
--
-- YANG TIDAK BERUBAH: border_buy, border_equip, wallets / gold_ledger, avatar_border_owned (riwayat pembelian), border_of.
-- Harga border lama TIDAK diubah diam-diam saat harga rarity diubah. Gunakan dev_border_price_apply (ada tombolnya di Panel).
-- File yang hilang dari GitHub hanya DITANDAI (file_missing_at): tidak dihapus, pembelian pemain tetap aman.
-- ============================================================================================

-- ---------- 0) Rarity border disederhanakan jadi 3: basic, standard, premium ----------
-- Border lama ber-rarity epic / legendary / mythic dipindah ke premium (hanya label). Harga, pembelian, dan koleksi pemain TIDAK berubah.
alter table public.avatar_borders drop constraint if exists avatar_borders_rarity_check;
update public.avatar_borders set rarity = 'premium' where rarity in ('epic', 'legendary', 'mythic');
alter table public.avatar_borders add constraint avatar_borders_rarity_check check (rarity in ('basic', 'standard', 'premium'));
delete from public.avatar_border_tiers where rarity not in ('basic', 'standard', 'premium');
alter table public.avatar_border_tiers drop constraint if exists avatar_border_tiers_rarity_check;
alter table public.avatar_border_tiers add constraint avatar_border_tiers_rarity_check check (rarity in ('basic', 'standard', 'premium'));
-- Rentang harga baru: Standard 6.000-7.000, Premium 8.000-13.000 (Basic tetap). Harga border yang sudah ada TIDAK diubah.
insert into public.avatar_border_tiers (rarity, min_price, max_price) values ('standard', 6000, 7000), ('premium', 8000, 13000)
on conflict (rarity) do update set min_price = excluded.min_price, max_price = excluded.max_price;
do $$ begin
  if to_regclass('public.avatar_border_prices') is not null then
    delete from public.avatar_border_prices where rarity not in ('basic', 'standard', 'premium');
    alter table public.avatar_border_prices drop constraint if exists avatar_border_prices_rarity_check;
    alter table public.avatar_border_prices add constraint avatar_border_prices_rarity_check check (rarity in ('basic', 'standard', 'premium'));
  end if;
end $$;

-- ---------- 1) Harga per rarity ----------
create table if not exists public.avatar_border_prices (
  rarity     text primary key check (rarity in ('basic', 'standard', 'premium')),
  price      bigint not null check (price between 1 and 100000000),
  updated_at timestamptz not null default now()
);
insert into public.avatar_border_prices (rarity, price) values
  ('basic', 1000), ('standard', 6500), ('premium', 10500)
on conflict (rarity) do nothing;
alter table public.avatar_border_prices enable row level security;
revoke all on public.avatar_border_prices from anon, authenticated;

-- Kalau harga rarity tersimpan (dari versi SQL sebelumnya) di luar rentang baru, geser ke nilai tengah. Harga yang sudah dalam rentang tidak disentuh.
update public.avatar_border_prices p set price = (t.min_price + t.max_price) / 2, updated_at = now()
  from public.avatar_border_tiers t
 where t.rarity = p.rarity and (p.price < t.min_price or p.price > t.max_price);

-- Pemeriksa harga: rentang rarity hanya dipaksakan kalau harga BERUBAH. Border lama yang harganya di luar rentang baru
-- tetap bisa diaktif/nonaktifkan atau diubah nama tanpa harus mengubah harga.
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
  if (p_price < t.min_price or p_price > t.max_price)
     and not exists (select 1 from public.avatar_borders where id = p_id and price = p_price and rarity = p_rarity) then
    raise exception 'Harga % harus % sampai % WakuGold', initcap(p_rarity), t.min_price, t.max_price;
  end if;
  return next;
end; $$;
revoke all on function public.avatar_border_check(text, text, text, bigint, text) from public, anon, authenticated;

-- Border bawaan (b01..b50): rentang hanya dipaksakan kalau harga berubah
create or replace function public.dev_border_save(p_id text, p_price bigint, p_active boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare b public.avatar_borders; t public.avatar_border_tiers;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  select * into b from public.avatar_borders where id = p_id for update;
  if not found then raise exception 'Border tidak ditemukan'; end if;
  if b.id !~ '^b[0-9]{2}$' then raise exception 'Border impor diubah lewat dev_border_update'; end if;
  select * into t from public.avatar_border_tiers where rarity = b.rarity;
  if p_price is null or p_price < 1 or p_price > 100000000 then raise exception 'Harga 1 sampai 100.000.000'; end if;
  if p_price <> b.price and (p_price < t.min_price or p_price > t.max_price) then
    raise exception 'Harga % harus % sampai % WakuGold', initcap(b.rarity), t.min_price, t.max_price;
  end if;
  update public.avatar_borders set price = p_price, active = coalesce(p_active, true) where id = b.id;
end; $$;
revoke all on function public.dev_border_save(text, bigint, boolean) from public, anon;
grant execute on function public.dev_border_save(text, bigint, boolean) to authenticated;

-- ---------- 2) Kolom baru di avatar_borders ----------
alter table public.avatar_borders add column if not exists repo_path text;
alter table public.avatar_borders add column if not exists origin text not null default 'link';
alter table public.avatar_borders add column if not exists price_auto boolean not null default false;
alter table public.avatar_borders add column if not exists file_missing_at timestamptz;
alter table public.avatar_borders add column if not exists synced_at timestamptz;
update public.avatar_borders set origin = 'builtin' where id ~ '^b[0-9]{2}$' and origin = 'link';
alter table public.avatar_borders drop constraint if exists avatar_borders_origin_check;
alter table public.avatar_borders add constraint avatar_borders_origin_check check (origin in ('builtin', 'link', 'panel', 'github'));
alter table public.avatar_borders drop constraint if exists avatar_borders_repo_path_check;
alter table public.avatar_borders add constraint avatar_borders_repo_path_check check (
  repo_path is null or (id ~ '^u' and repo_path ~* '^Border/(basic|standard|premium)/[^/\\?#%@<>"|*:[:cntrl:]]{1,120}\.gif$'));
create unique index if not exists avatar_borders_repo_path_uq on public.avatar_borders (lower(repo_path)) where repo_path is not null;

-- ---------- 3) Riwayat sinkronisasi ----------
create table if not exists public.avatar_border_sync_log (
  id         bigserial primary key,
  run_at     timestamptz not null default now(),
  run_by     uuid,
  found      int not null default 0,
  new_count  int not null default 0,
  registered int not null default 0,
  failed     int not null default 0,
  missing    int not null default 0,
  ignored    int not null default 0,
  pending    int not null default 0,
  complete   boolean not null default true,
  report     jsonb not null default '{}'::jsonb
);
alter table public.avatar_border_sync_log enable row level security;
revoke all on public.avatar_border_sync_log from anon, authenticated;

-- ---------- 4) Pembantu internal ----------
create or replace function public.avatar_border_price(p_rarity text) returns bigint
language sql stable security definer set search_path = public as $$
  select price from public.avatar_border_prices where rarity = p_rarity;
$$;
revoke all on function public.avatar_border_price(text) from public, anon, authenticated;

-- Nama border dari nama file: "border-001.gif" -> "Border 001". Kalau nama sudah dipakai, ditambah rarity lalu angka.
create or replace function public.avatar_border_name_from_file(p_file text, p_rarity text) returns text
language plpgsql stable security definer set search_path = public as $$
declare base text; cand text; n int := 1; suf text;
begin
  base := regexp_replace(coalesce(p_file, ''), '\.gif$', '', 'i');
  base := btrim(regexp_replace(regexp_replace(base, '[-_.]+', ' ', 'g'), '\s+', ' ', 'g'));
  base := regexp_replace(base, '[<>[:cntrl:]]', '', 'g');
  if base = '' then base := 'Border'; end if;
  base := left(initcap(base), 40);
  cand := base;
  if not exists (select 1 from public.avatar_borders where lower(name) = lower(cand)) then return cand; end if;
  suf := ' ' || initcap(p_rarity);
  cand := left(base, 40 - char_length(suf)) || suf;
  while exists (select 1 from public.avatar_borders where lower(name) = lower(cand)) loop
    n := n + 1;
    suf := ' ' || initcap(p_rarity) || ' ' || n::text;
    cand := left(base, 40 - char_length(suf)) || suf;
    if n > 999 then raise exception 'Nama unik tidak bisa dibuat untuk %', p_file; end if;
  end loop;
  return cand;
end; $$;
revoke all on function public.avatar_border_name_from_file(text, text) from public, anon, authenticated;

-- SATU-SATUNYA jalan membuat border impor (dipakai Panel dan Sinkronisasi) -> metadata selalu berformat sama.
create or replace function public.avatar_border_register(p_name text, p_rarity text, p_url text, p_path text, p_origin text, p_price bigint default null) returns text
language plpgsql security definer set search_path = public as $$
declare c record; nid text; pr bigint; auto boolean := (p_price is null);
begin
  if (select count(*) from public.avatar_borders where id ~ '^u') >= 700 then raise exception 'Batas 700 border impor tercapai. Hapus yang tidak terpakai dulu'; end if;
  pr := coalesce(p_price, public.avatar_border_price(p_rarity));
  if pr is null then raise exception 'Harga rarity % belum diatur', p_rarity; end if;
  select * into c from public.avatar_border_check(p_name, p_rarity, p_url, pr, null);
  nid := 'u' || nextval('public.avatar_border_seq')::text;
  insert into public.avatar_borders (id, name, rarity, price, sort, active, image_url, repo_path, origin, price_auto, synced_at)
  values (nid, c.nm, p_rarity, pr, coalesce((select max(sort) from public.avatar_borders), 0) + 1, true, c.u, p_path, p_origin, auto,
          case when p_origin = 'github' then now() end);
  return nid;
end; $$;
revoke all on function public.avatar_border_register(text, text, text, text, text, bigint) from public, anon, authenticated;

-- ---------- 5) IMPOR dari Panel Developer (harga kosong = otomatis dari rarity) ----------
drop function if exists public.dev_border_import(text, text, text, bigint);
create or replace function public.dev_border_import(p_name text, p_rarity text, p_url text, p_price bigint default null, p_path text default null) returns text
language plpgsql security definer set search_path = public as $$
declare nid text;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  perform pg_advisory_xact_lock(hashtextextended('avatar_border_import', 5));
  if p_path is not null then
    if p_path !~* '^Border/(basic|standard|premium)/[^/\\?#%@<>"|*:[:cntrl:]]{1,120}\.gif$' then raise exception 'Path file GitHub tidak valid'; end if;
    if lower(split_part(p_path, '/', 2)) <> p_rarity then raise exception 'Folder file tidak sama dengan rarity'; end if;
    if right(replace(p_url, '%20', ' '), char_length(p_path)) <> p_path then raise exception 'Link tidak cocok dengan path file'; end if;
  end if;
  nid := public.avatar_border_register(p_name, p_rarity, p_url, p_path, case when p_path is null then 'link' else 'panel' end, p_price);
  return nid;
exception when unique_violation then raise exception 'Nama atau link .gif sudah dipakai';
end; $$;
revoke all on function public.dev_border_import(text, text, text, bigint, text) from public, anon;
grant execute on function public.dev_border_import(text, text, text, bigint, text) to authenticated;

-- ---------- 6) UBAH border impor: harga manual ditandai (price_auto = false) kalau beda dari harga rarity ----------
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
  update public.avatar_borders set
    name = c.nm, rarity = p_rarity, image_url = c.u, price = p_price, active = coalesce(p_active, true),
    price_auto = (p_price = coalesce(public.avatar_border_price(p_rarity), -1)),
    repo_path = case when repo_path is not null and right(replace(c.u, '%20', ' '), char_length(repo_path)) = repo_path then repo_path else null end,
    file_missing_at = case when lower(c.u) = lower(b.image_url) then file_missing_at else null end
  where id = b.id;
exception when unique_violation then raise exception 'Nama atau link .gif sudah dipakai';
end; $$;
revoke all on function public.dev_border_update(text, text, text, text, bigint, boolean) from public, anon;
grant execute on function public.dev_border_update(text, text, text, text, bigint, boolean) to authenticated;

-- ---------- 7) Harga rarity: ubah + (opsional) terapkan ke border lama ----------
create or replace function public.dev_border_price_set(p_rarity text, p_price bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  if p_price is null or p_price < 1 or p_price > 100000000 then raise exception 'Harga 1 sampai 100.000.000'; end if;
  if not exists (select 1 from public.avatar_border_prices where rarity = p_rarity) then raise exception 'Rarity tidak valid'; end if;
  if exists (select 1 from public.avatar_border_tiers t where t.rarity = p_rarity and (p_price < t.min_price or p_price > t.max_price)) then
    raise exception 'Harga % harus % sampai % WakuGold', initcap(p_rarity), (select min_price from public.avatar_border_tiers where rarity = p_rarity), (select max_price from public.avatar_border_tiers where rarity = p_rarity);
  end if;
  update public.avatar_border_prices set price = p_price, updated_at = now() where rarity = p_rarity;
  -- Border yang sudah ada TIDAK diubah. Hanya border baru yang memakai harga ini.
  return jsonb_build_object('ok', true, 'rarity', p_rarity, 'price', p_price,
    'stale_auto', (select count(*) from public.avatar_borders where id ~ '^u' and rarity = p_rarity and price_auto and price <> p_price),
    'stale_manual', (select count(*) from public.avatar_borders where id ~ '^u' and rarity = p_rarity and not price_auto and price <> p_price));
end; $$;
revoke all on function public.dev_border_price_set(text, bigint) from public, anon;
grant execute on function public.dev_border_price_set(text, bigint) to authenticated;

-- p_scope 'auto' = hanya border yang harganya otomatis; 'all' = semua border IMPOR rarity itu (termasuk yang pernah diatur manual).
-- Border bawaan (b01..b50) tidak pernah disentuh. p_apply=false hanya menghitung. Yang sudah membeli tidak ditagih / dikembalikan.
create or replace function public.dev_border_price_apply(p_rarity text, p_scope text default 'auto', p_apply boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pr bigint; n int;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  if p_scope not in ('auto', 'all') then raise exception 'Cakupan tidak valid'; end if;
  pr := public.avatar_border_price(p_rarity);
  if pr is null then raise exception 'Rarity tidak valid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('avatar_border_import', 5));
  select count(*) into n from public.avatar_borders
   where id ~ '^u' and rarity = p_rarity and price <> pr and (p_scope = 'all' or price_auto);
  if p_apply and n > 0 then
    update public.avatar_borders set price = pr, price_auto = true
     where id ~ '^u' and rarity = p_rarity and price <> pr and (p_scope = 'all' or price_auto);
  end if;
  return jsonb_build_object('ok', true, 'rarity', p_rarity, 'price', pr, 'scope', p_scope, 'changed', n, 'applied', p_apply and n > 0);
end; $$;
revoke all on function public.dev_border_price_apply(text, text, boolean) from public, anon;
grant execute on function public.dev_border_price_apply(text, text, boolean) to authenticated;

-- ---------- 8) Sinkronisasi GitHub ----------
-- Daftar path + link yang sudah terdaftar (Edge Function melewati pemeriksaan isi file untuk yang sudah dikenal).
create or replace function public.dev_border_sync_known() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  return jsonb_build_object(
    'paths', coalesce((select jsonb_agg(lower(repo_path)) from public.avatar_borders where repo_path is not null), '[]'::jsonb),
    'urls',  coalesce((select jsonb_agg(lower(image_url)) from public.avatar_borders where image_url is not null), '[]'::jsonb));
end; $$;
revoke all on function public.dev_border_sync_known() from public, anon;
grant execute on function public.dev_border_sync_known() to authenticated;

-- p_items    : [{path, rarity, url, file}]  semua GIF valid hasil pemindaian (yang baru maupun yang sudah dikenal)
-- p_all_paths: semua path .gif di folder rarity (termasuk yang gagal / ditunda) -> dipakai mendeteksi file yang HILANG
-- p_complete : true kalau seluruh folder berhasil dibaca (kalau false, file hilang TIDAK ditandai)
-- p_meta     : {failed:[{path,reason}], ignored:int, ignored_list:[...], pending:int}
create or replace function public.dev_border_sync_apply(p_items jsonb, p_all_paths text[], p_complete boolean, p_meta jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; b record; nid text; nm text;
  v_new int := 0; v_reg int := 0; v_restored int := 0; v_missing int := 0; v_fail int := 0;
  v_names jsonb := '[]'::jsonb; v_fails jsonb := coalesce(p_meta->'failed', '[]'::jsonb);
  v_edge_fail int := jsonb_array_length(coalesce(p_meta->'failed', '[]'::jsonb));
  v_ignored int := coalesce((p_meta->>'ignored')::int, 0);
  v_pending int := coalesce((p_meta->>'pending')::int, 0);
  v_found int := coalesce(array_length(p_all_paths, 1), 0);
  v_lower text[];
  v_log bigint;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  perform pg_advisory_xact_lock(hashtextextended('avatar_border_import', 5));

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    begin
      select id, file_missing_at, repo_path into b from public.avatar_borders
       where lower(repo_path) = lower(it->>'path') or lower(image_url) = lower(it->>'url')
       order by (lower(repo_path) = lower(it->>'path')) desc limit 1;
      if found then
        v_reg := v_reg + 1;
        if b.file_missing_at is not null then v_restored := v_restored + 1; end if;
        update public.avatar_borders set
          repo_path = coalesce(repo_path, it->>'path'), file_missing_at = null, synced_at = now()
         where id = b.id and (repo_path is null or file_missing_at is not null or synced_at is null);
      else
        nm := public.avatar_border_name_from_file(it->>'file', it->>'rarity');
        nid := public.avatar_border_register(nm, it->>'rarity', it->>'url', it->>'path', 'github', null);
        v_new := v_new + 1;
        v_names := v_names || jsonb_build_object('id', nid, 'name', nm, 'rarity', it->>'rarity', 'path', it->>'path');
      end if;
    exception when others then
      v_fail := v_fail + 1;
      v_fails := v_fails || jsonb_build_object('path', it->>'path', 'reason', left(sqlerrm, 200));
    end;
  end loop;

  if p_complete then
    select coalesce(array_agg(lower(x)), '{}') into v_lower from unnest(coalesce(p_all_paths, '{}')) x;
    with m as (
      update public.avatar_borders set file_missing_at = now()
       where origin in ('github', 'panel') and repo_path is not null and file_missing_at is null
         and not (lower(repo_path) = any (v_lower))
      returning 1)
    select count(*) into v_missing from m;
  end if;

  insert into public.avatar_border_sync_log (run_by, found, new_count, registered, failed, missing, ignored, pending, complete, report)
  values (auth.uid(), v_found, v_new, v_reg, v_edge_fail + v_fail, v_missing, v_ignored, v_pending, coalesce(p_complete, false),
          jsonb_build_object('new', v_names, 'failed', v_fails, 'ignored_list', coalesce(p_meta->'ignored_list', '[]'::jsonb), 'restored', v_restored))
  returning id into v_log;
  delete from public.avatar_border_sync_log where id <= v_log - 20;

  return jsonb_build_object('ok', true, 'found', v_found, 'new', v_new, 'registered', v_reg, 'failed', v_edge_fail + v_fail,
    'missing', v_missing, 'restored', v_restored, 'ignored', v_ignored, 'pending', v_pending, 'complete', coalesce(p_complete, false),
    'new_list', v_names, 'failed_list', v_fails, 'ignored_list', coalesce(p_meta->'ignored_list', '[]'::jsonb));
end; $$;
revoke all on function public.dev_border_sync_apply(jsonb, text[], boolean, jsonb) from public, anon;
grant execute on function public.dev_border_sync_apply(jsonb, text[], boolean, jsonb) to authenticated;

-- ---------- 9) Daftar untuk Panel Developer (ditambah harga rarity, status sinkronisasi, asal border) ----------
create or replace function public.dev_border_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  return jsonb_build_object(
    'tiers', coalesce((select jsonb_object_agg(rarity, jsonb_build_array(min_price, max_price)) from public.avatar_border_tiers), '{}'::jsonb),
    'prices', coalesce((select jsonb_object_agg(rarity, price) from public.avatar_border_prices), '{}'::jsonb),
    'stale', coalesce((select jsonb_object_agg(p.rarity, jsonb_build_object(
                'auto', (select count(*) from public.avatar_borders b where b.id ~ '^u' and b.rarity = p.rarity and b.price_auto and b.price <> p.price),
                'manual', (select count(*) from public.avatar_borders b where b.id ~ '^u' and b.rarity = p.rarity and not b.price_auto and b.price <> p.price)))
              from public.avatar_border_prices p), '{}'::jsonb),
    'github_total', (select count(*) from public.avatar_borders where origin in ('github', 'panel') and repo_path is not null),
    'missing_total', (select count(*) from public.avatar_borders where file_missing_at is not null),
    'sync', (select to_jsonb(s) from (select l.run_at, l.found, l.new_count, l.registered, l.failed, l.missing, l.ignored, l.pending, l.complete, l.report
               from public.avatar_border_sync_log l order by l.id desc limit 1) s),
    'list', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'rarity', b.rarity, 'price', b.price, 'active', b.active,
              'image_url', b.image_url, 'origin', b.origin, 'repo_path', b.repo_path, 'price_auto', b.price_auto, 'missing', b.file_missing_at is not null,
              'owners', (select count(*) from public.avatar_border_owned o where o.border_id = b.id)) order by b.sort desc, b.id)
              from public.avatar_borders b), '[]'::jsonb));
end; $$;
revoke all on function public.dev_border_list() from public, anon;
grant execute on function public.dev_border_list() to authenticated;

-- ---------- 10) Toko: border yang file-nya hilang dari GitHub tidak dijual lagi, tapi tetap tampil untuk pemiliknya ----------
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
                       where (b.active and b.file_missing_at is null)
                          or exists (select 1 from public.avatar_border_owned o where o.user_id = me and o.border_id = b.id)), '[]'::jsonb));
end; $$;
revoke all on function public.border_shop() from public, anon;
grant execute on function public.border_shop() to authenticated;
