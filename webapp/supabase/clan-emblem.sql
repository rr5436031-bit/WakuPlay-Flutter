-- ============================================================================================
-- EMBLEM CLAN - gacha emblem (gambar kecil di sisi kiri badge clan), dipakai lewat Shop Clan
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH wakugames-clan.sql, clan-role.sql, clan-v2.sql, dan clan-pengaturan.sql.
--
-- ATURAN (semua dijaga SERVER):
--  * Rarity emblem: common, epic, legend, mythic.
--  * Spin x1 dan x5 memakai XPGold clan (harga & peluang ada di tabel clan_config, bisa diubah).
--  * Emblem yang sudah dimiliki BOLEH keluar lagi (spin x1 maupun x5), tidak ada batas "sisa emblem".
--  * Peluang rarity TETAP: Common 70, Epic 20, Legend 8, Mythic 2 (bobot, bisa diubah di clan_config).
--    Punya banyak emblem tidak membuat Epic / Legend / Mythic jadi lebih mudah.
--  * Hanya Leader & Vice Leader yang bisa spin dan memilih emblem (sama seperti gacha warna).
--  * Hanya DEVELOPER yang bisa menambah / mengubah / menghapus emblem (Panel Developer > Emblem).
--  * Gambar emblem disimpan di GitHub, folder Emblem/ (lewat Edge Function border-gif).
-- ============================================================================================

-- ---------- Tabel ----------
create table if not exists public.clan_emblems (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 1 and 40),
  rarity     text not null check (rarity in ('common', 'epic', 'legend', 'mythic')),
  image_url  text not null check (char_length(image_url) <= 500),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.clan_emblem_owned (
  clan_id     bigint not null references public.clans(id) on delete cascade,
  emblem_id   bigint not null references public.clan_emblems(id) on delete cascade,
  obtained_at timestamptz not null default now(),
  primary key (clan_id, emblem_id)
);
create index if not exists clan_emblem_owned_emblem on public.clan_emblem_owned (emblem_id);
alter table public.clans add column if not exists emblem_id bigint references public.clan_emblems(id) on delete set null;

do $$ declare t text; begin
  foreach t in array array['clan_emblems', 'clan_emblem_owned'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------- Harga & peluang (ubah di tabel clan_config kalau perlu) ----------
insert into public.clan_config (key, value) values
  ('emblem_spin_cost', 500),        -- 1x spin emblem (XPGold)
  ('emblem_spin5_cost', 2250),      -- 5x spin emblem (lebih murah dari 5 x 500)
  ('emblem_odds_common', 70),       -- bobot peluang per rarity (total tidak harus 100)
  ('emblem_odds_epic', 20),
  ('emblem_odds_legend', 8),
  ('emblem_odds_mythic', 2)
on conflict (key) do nothing;
-- Kalau sebelumnya sudah memakai bawaan lama (60/28/10/2) dan belum pernah kamu ubah, jadikan lebih susah:
update public.clan_config set value = case key when 'emblem_odds_common' then 70 when 'emblem_odds_epic' then 20 when 'emblem_odds_legend' then 8 else value end
 where (key, value) in (('emblem_odds_common', 60), ('emblem_odds_epic', 28), ('emblem_odds_legend', 10));

-- ---------- Pembantu ----------
create or replace function public.clan_emblem_json(p_id bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when p_id is null then null else
    (select jsonb_build_object('id', id, 'name', name, 'rarity', rarity, 'image_url', image_url) from public.clan_emblems where id = p_id) end
$$;
revoke all on function public.clan_emblem_json(bigint) from public, anon, authenticated;

-- ---------- Daftar emblem untuk sebuah clan (gambar & nama emblem yang belum dimiliki disembunyikan) ----------
drop function if exists public.clan_emblems_list(bigint);
create or replace function public.clan_emblems_list(p_clan bigint)
returns table (id bigint, name text, rarity text, image_url text, owned boolean, selected boolean, active boolean)
language sql stable security definer set search_path = public as $$
  select e.id,
         case when o.emblem_id is null then null else e.name end,
         e.rarity,
         case when o.emblem_id is null then null else e.image_url end,
         o.emblem_id is not null,
         coalesce(c.emblem_id = e.id, false),
         e.active
    from public.clan_emblems e
    left join public.clan_emblem_owned o on o.clan_id = p_clan and o.emblem_id = e.id
    left join public.clans c on c.id = p_clan
   where auth.uid() is not null and (e.active or o.emblem_id is not null)
   order by case e.rarity when 'mythic' then 4 when 'legend' then 3 when 'epic' then 2 else 1 end desc, e.id;
$$;
revoke all on function public.clan_emblems_list(bigint) from public, anon;
grant execute on function public.clan_emblems_list(bigint) to authenticated;

-- ---------- SPIN EMBLEM (p_count = 1 atau 5). Hasil diundi di server. Emblem yang sudah dimiliki BOLEH keluar lagi ----------
-- Peluang tiap rarity TETAP (tidak berubah walau clan sudah punya banyak emblem), jadi Epic / Legend / Mythic tetap susah didapat.
-- Hanya rarity yang belum punya emblem aktif sama sekali yang dilewati.
create or replace function public.clan_emblem_spin(p_req uuid, p_count int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid; c public.clans; cost bigint; total int; i int; tot numeric; roll numeric; rar text; had boolean;
  pick public.clan_emblems; res jsonb := '[]'::jsonb;
  w_c numeric := coalesce(public.clan_cfg('emblem_odds_common'), 70);
  w_e numeric := coalesce(public.clan_cfg('emblem_odds_epic'), 20);
  w_l numeric := coalesce(public.clan_cfg('emblem_odds_legend'), 8);
  w_m numeric := coalesce(public.clan_cfg('emblem_odds_mythic'), 2);
begin
  if p_count is null or p_count not in (1, 5) then raise exception 'Jumlah spin tidak valid'; end if;
  me := public.clan_op_begin(p_req);
  c := public.clan_lock_as_leader(me);                       -- Leader & Vice Leader; baris clan dikunci selama transaksi

  cost := (case p_count when 1 then coalesce(public.clan_cfg('emblem_spin_cost'), 500) else coalesce(public.clan_cfg('emblem_spin5_cost'), 2250) end)::bigint;

  select count(*) into total from public.clan_emblems where active;
  if total = 0 then raise exception 'Belum ada emblem di gacha'; end if;
  if c.xp_available < cost then raise exception 'XPGold belum cukup'; end if;

  for i in 1..p_count loop
    -- total bobot hanya dari rarity yang punya emblem aktif (kepemilikan clan TIDAK memengaruhi peluang)
    select coalesce(sum(r.w), 0) into tot
      from (values ('common', w_c), ('epic', w_e), ('legend', w_l), ('mythic', w_m)) r(rarity, w)
     where r.w > 0 and exists (select 1 from public.clan_emblems e where e.active and e.rarity = r.rarity);
    rar := null;
    if tot > 0 then
      roll := random() * tot;
      select x.rarity into rar from (
        select r.rarity, sum(r.w) over (order by r.ord) as cum
          from (values (1, 'common', w_c), (2, 'epic', w_e), (3, 'legend', w_l), (4, 'mythic', w_m)) r(ord, rarity, w)
         where r.w > 0 and exists (select 1 from public.clan_emblems e where e.active and e.rarity = r.rarity)
      ) x where x.cum > roll order by x.cum limit 1;
    end if;                                                  -- tot = 0 (semua peluang 0): pilih acak dari semua emblem aktif

    select * into pick from public.clan_emblems e where e.active and (rar is null or e.rarity = rar) order by random() limit 1;
    if not found then raise exception 'Data emblem belum tersedia'; end if;

    select exists (select 1 from public.clan_emblem_owned o where o.clan_id = c.id and o.emblem_id = pick.id) into had;
    if not had then insert into public.clan_emblem_owned (clan_id, emblem_id) values (c.id, pick.id); end if;
    res := res || jsonb_build_array(jsonb_build_object('emblem', jsonb_build_object('id', pick.id, 'name', pick.name, 'rarity', pick.rarity, 'image_url', pick.image_url), 'dupe', had));
  end loop;

  update public.clans set xp_available = xp_available - cost where id = c.id returning * into c;
  insert into public.clan_xp_log (clan_id, delta, kind, note, by_user) values (c.id, -cost, 'spin', 'Spin emblem x' || p_count, me);

  return jsonb_build_object('results', res, 'spent', cost, 'xp_available', c.xp_available);
end; $$;
revoke all on function public.clan_emblem_spin(uuid, int) from public, anon;
grant execute on function public.clan_emblem_spin(uuid, int) to authenticated;

-- ---------- Pakai / lepas emblem (null = tanpa emblem) ----------
create or replace function public.clan_set_emblem(p_emblem bigint) returns void
language plpgsql security definer set search_path = public as $$
declare c public.clans;
begin
  c := public.clan_lock_as_leader(auth.uid());
  if p_emblem is not null and not exists (select 1 from public.clan_emblem_owned where clan_id = c.id and emblem_id = p_emblem) then
    raise exception 'Emblem belum dimiliki clan';
  end if;
  update public.clans set emblem_id = p_emblem where id = c.id;
end; $$;
revoke all on function public.clan_set_emblem(bigint) from public, anon;
grant execute on function public.clan_set_emblem(bigint) to authenticated;

-- ---------- Badge clan (komentar, chat, profil) sekarang membawa emblem. Aplikasi lama mengabaikan kolom baru ----------
drop function if exists public.clan_badges(uuid[]);
create or replace function public.clan_badges(p_uids uuid[])
returns table (user_id uuid, clan_id bigint, tag text, tier int, c1 text, c2 text, c3 text, rarity text, emblem text)
language sql stable security definer set search_path = public as $$
  select m.user_id, c.id, c.tag, c.tier, col.c1, col.c2, col.c3, col.rarity, em.image_url
    from public.clan_members m
    join public.clans c on c.id = m.clan_id and c.disbanded_at is null
    left join public.clan_colors col on col.id = c.color_id
    left join public.clan_emblems em on em.id = c.emblem_id
   where auth.uid() is not null and m.user_id = any (p_uids[1:100]);
$$;
revoke all on function public.clan_badges(uuid[]) from public, anon;
grant execute on function public.clan_badges(uuid[]) to authenticated;

-- ---------- Detail clan (sama seperti clan-pengaturan.sql, ditambah 'emblem') ----------
create or replace function public.clan_detail(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.clans; tx numeric; lv int; n int; mine text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into c from public.clans where id = p_id and disbanded_at is null;
  if not found then return null; end if;
  tx := public.clan_total_xp(c.id); lv := public.clan_level(tx);
  select count(*) into n from public.clan_members where clan_id = c.id;
  select role into mine from public.clan_members where clan_id = c.id and user_id = me;
  return jsonb_build_object(
    'id', c.id, 'tag', c.tag, 'name', c.name, 'tier', c.tier, 'color', public.clan_color_json(c.color_id),
    'emblem', public.clan_emblem_json(c.emblem_id),
    'slots', c.slots, 'members', n, 'xp_available', c.xp_available, 'total_xp', tx,
    'level', lv, 'lvl_start', 50 * lv * (lv - 1), 'lvl_next', 50 * (lv + 1) * lv, 'join_mode', c.join_mode, 'leader', c.leader,
    'banner', c.banner_url,
    'my_role', mine,
    'my_clan', public.clan_my_id(me),
    'my_request', exists (select 1 from public.clan_requests where clan_id = c.id and user_id = me),
    'pending', case when mine is not null and public.clan_rank(mine) >= 2 then (select count(*) from public.clan_requests where clan_id = c.id) else 0 end);
end; $$;
revoke all on function public.clan_detail(bigint) from public, anon;
grant execute on function public.clan_detail(bigint) to authenticated;

-- ---------- Top Clans (sama seperti clan-pengaturan.sql, ditambah kolom emblem di akhir) ----------
drop function if exists public.clan_top(text, int);
create or replace function public.clan_top(p_q text default null, p_limit int default 50)
returns table (rk bigint, id bigint, tag text, name text, tier int, c1 text, c2 text, c3 text, rarity text, level int, members int, slots int, total_xp numeric, join_mode text, banner text, emblem text)
language sql stable security definer set search_path = public as $$
  with t as (
    select c.*, public.clan_total_xp(c.id) tx, (select count(*)::int from public.clan_members m where m.clan_id = c.id) mc
      from public.clans c where c.disbanded_at is null),
  r as (select t.*, row_number() over (order by tx desc, created_at asc, id asc) pos from t)
  select r.pos, r.id, r.tag, r.name, r.tier, col.c1, col.c2, col.c3, col.rarity, public.clan_level(r.tx), r.mc, r.slots, r.tx, r.join_mode, r.banner_url, em.image_url
    from r left join public.clan_colors col on col.id = r.color_id
           left join public.clan_emblems em on em.id = r.emblem_id
   where auth.uid() is not null
     and (p_q is null or btrim(p_q) = '' or position(lower(btrim(p_q)) in lower(r.tag)) > 0 or position(lower(btrim(p_q)) in lower(r.name)) > 0)
   order by r.pos limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;
revoke all on function public.clan_top(text, int) from public, anon;
grant execute on function public.clan_top(text, int) to authenticated;

-- ---------- Panel Developer: daftar clan (sama seperti clan-v2.sql, ditambah kolom emblem di akhir) ----------
drop function if exists public.dev_clan_list(text, int);
create or replace function public.dev_clan_list(p_q text default null, p_limit int default 100)
returns table (id bigint, tag text, name text, tier int, members int, slots int, xp_available bigint, total_xp numeric, level int, leader_name text, leader_seq bigint, c1 text, c2 text, c3 text, rarity text, emblem text)
language sql stable security definer set search_path = public as $$
  select c.id, c.tag, c.name, c.tier, (select count(*)::int from public.clan_members m where m.clan_id = c.id), c.slots, c.xp_available,
         public.clan_total_xp(c.id), public.clan_level(public.clan_total_xp(c.id)), public.wp_name(c.leader), p.seq, col.c1, col.c2, col.c3, col.rarity, em.image_url
    from public.clans c
    left join public.profiles p on p.user_id = c.leader
    left join public.clan_colors col on col.id = c.color_id
    left join public.clan_emblems em on em.id = c.emblem_id
   where public.is_developer() and c.disbanded_at is null
     and (p_q is null or btrim(p_q) = '' or position(lower(btrim(p_q)) in lower(c.tag)) > 0 or position(lower(btrim(p_q)) in lower(c.name)) > 0)
   order by 8 desc, c.id
   limit least(greatest(coalesce(p_limit, 100), 1), 300);
$$;
revoke all on function public.dev_clan_list(text, int) from public, anon;
grant execute on function public.dev_clan_list(text, int) to authenticated;

-- ---------- PANEL DEVELOPER: kelola emblem ----------
create or replace function public.clan_emblem_dev_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'rarity', e.rarity, 'image_url', e.image_url, 'active', e.active,
           'owners', (select count(*) from public.clan_emblem_owned o where o.emblem_id = e.id))
           order by e.id desc) from public.clan_emblems e), '[]'::jsonb);
end; $$;
revoke all on function public.clan_emblem_dev_list() from public, anon;
grant execute on function public.clan_emblem_dev_list() to authenticated;

create or replace function public.clan_emblem_dev_save(p_id bigint, p_name text, p_rarity text, p_url text, p_active boolean default true) returns bigint
language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(p_name, '')); u text := btrim(coalesce(p_url, '')); rid bigint;
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  if char_length(nm) < 1 or char_length(nm) > 40 then raise exception 'Nama wajib diisi (maks 40 huruf)'; end if;
  if p_rarity is null or p_rarity not in ('common', 'epic', 'legend', 'mythic') then raise exception 'Rarity tidak valid'; end if;
  if u !~* '^https://[^[:space:]]+$' or char_length(u) > 500 then raise exception 'Link gambar harus https dan maks 500 karakter'; end if;
  if u !~* '\.(gif|jpe?g|png|webp)([?#].*)?$' then raise exception 'Link harus berupa gambar .png / .webp / .gif / .jpg'; end if;
  if p_id is null then
    insert into public.clan_emblems (name, rarity, image_url, active) values (nm, p_rarity, u, coalesce(p_active, true)) returning id into rid;
  else
    update public.clan_emblems set name = nm, rarity = p_rarity, image_url = u, active = coalesce(p_active, true) where id = p_id returning id into rid;
    if rid is null then raise exception 'Emblem tidak ditemukan'; end if;
  end if;
  return rid;
end; $$;
revoke all on function public.clan_emblem_dev_save(bigint, text, text, text, boolean) from public, anon;
grant execute on function public.clan_emblem_dev_save(bigint, text, text, text, boolean) to authenticated;

create or replace function public.clan_emblem_dev_delete(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_developer() then raise exception 'Khusus developer'; end if;
  delete from public.clan_emblems where id = p_id;      -- kepemilikan clan ikut terhapus; clan yang memakainya kembali tanpa emblem
end; $$;
revoke all on function public.clan_emblem_dev_delete(bigint) from public, anon;
grant execute on function public.clan_emblem_dev_delete(bigint) to authenticated;
