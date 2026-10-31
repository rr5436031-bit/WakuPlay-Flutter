-- Border: batas impor 500 -> 700, dan nama file GitHub boleh berisi tanda — – ( ) & , ' dll.
-- Sebelumnya file seperti "Akuma Bundle — Discord avatar decoration.gif" gagal sinkronisasi karena nama hanya boleh huruf/angka/spasi/./-/_.
-- Yang masih ditolak (merusak path / link): / \ ? # % @ < > " | * : dan karakter kontrol.
-- Jalankan di Supabase -> SQL Editor -> Run (aman diulang). Prasyarat: avatar-border-github.sql sudah pernah dijalankan.
-- Setelah ini, deploy ulang Edge Function:  supabase functions deploy border-gif

-- 1) Aturan path yang tersimpan (repo_path) dilonggarkan
alter table public.avatar_borders drop constraint if exists avatar_borders_repo_path_check;
alter table public.avatar_borders add constraint avatar_borders_repo_path_check check (
  repo_path is null or (id ~ '^u' and repo_path ~* '^Border/(basic|standard|premium)/[^/\\?#%@<>"|*:[:cntrl:]]{1,120}\.gif$'));

-- 2) Pembantu: decode link (%20, %E2%80%94, dst) supaya bisa dibandingkan dengan path
create or replace function public.border_url_decode(t text) returns text
language sql immutable set search_path = public as $$
  select convert_from(coalesce(string_agg(
           case when m.g[1] is not null then decode(substr(m.g[1], 2), 'hex') else convert_to(m.g[2], 'UTF8') end,
           ''::bytea order by m.n), ''::bytea), 'UTF8')
    from regexp_matches(coalesce(t, ''), '(%[0-9A-Fa-f]{2})|([^%]+|%)', 'g') with ordinality as m(g, n);
$$;

-- 3) Impor dari Panel: path bebas + pencocokan link memakai decode
create or replace function public.dev_border_import(p_name text, p_rarity text, p_url text, p_price bigint default null, p_path text default null) returns text
language plpgsql security definer set search_path = public as $$
declare nid text;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  perform pg_advisory_xact_lock(hashtextextended('avatar_border_import', 5));
  if p_path is not null then
    if p_path !~* '^Border/(basic|standard|premium)/[^/\\?#%@<>"|*:[:cntrl:]]{1,120}\.gif$' then raise exception 'Path file GitHub tidak valid'; end if;
    if lower(split_part(p_path, '/', 2)) <> p_rarity then raise exception 'Folder file tidak sama dengan rarity'; end if;
    if right(public.border_url_decode(p_url), char_length(p_path)) <> p_path then raise exception 'Link tidak cocok dengan path file'; end if;
  end if;
  nid := public.avatar_border_register(p_name, p_rarity, p_url, p_path, case when p_path is null then 'link' else 'panel' end, p_price);
  return nid;
exception when unique_violation then raise exception 'Nama atau link .gif sudah dipakai';
end; $$;
revoke all on function public.dev_border_import(text, text, text, bigint, text) from public, anon;
grant execute on function public.dev_border_import(text, text, text, bigint, text) to authenticated;

-- 4) Batas border impor: 700
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

-- Cek cepat (opsional): select public.border_url_decode('Border/standard/Akuma%20Bundle%20%E2%80%94%20x.gif');
