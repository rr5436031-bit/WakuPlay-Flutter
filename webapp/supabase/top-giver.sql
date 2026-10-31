-- ============================================================================================
-- TOP GIVER (slide ke-3 banner Home + halaman Top Giver) — peringkat 1 sampai 100
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH giveaway-premium.sql.
--
-- Top Giver = orang yang giveaway Premium di Chat Global. Yang dihitung = TOTAL HARI yang benar-benar diterima orang lain.
--   Contoh: giveaway 3 hari x 2 orang, keduanya klaim -> 6 hari. Kalau baru 1 yang klaim -> 3 hari.
--
-- ATURAN KETAT (semuanya dijaga SERVER, aplikasi hanya menampilkan):
--   1. Hanya hari dari giveaway Chat Global yang SUDAH DIKLAIM orang lain. Hadiah tidak terklaim (dikembalikan) tidak dihitung.
--   2. Gift langsung ke satu orang, tambahan dari Developer, dan pembelian Premium TIDAK dihitung.
--   3. Klaim oleh pembuatnya sendiri tidak dihitung.
--   4. Anti tukar-tukar akun: satu penerima dihitung maksimal 60 hari per pemberi per bulan (WIB).
--   5. Akun yang sedang diblokir tidak tampil, dan klaim dari akun yang diblokir tidak dihitung.
--   6. Urutan: hari terbanyak -> penerima berbeda lebih banyak -> yang lebih dulu mencapai angka itu.
--   7. Dihitung langsung dari catatan klaim permanen (tidak ada angka tersimpan yang bisa tidak sinkron / diubah dari aplikasi).
--
-- File ini HANYA membaca data. Tidak mengubah giveaway_create / giveaway_claim / Premium siapa pun.
-- ============================================================================================

create index if not exists giveaway_claims_time on public.giveaway_claims (created_at);

-- Awal periode (WIB): 'weekly' = Senin, 'monthly' = tanggal 1, selain itu = semua waktu
create or replace function public.top_giver_from(p_period text) returns timestamptz
language sql stable set search_path = public as $$
  select case p_period
    when 'weekly'  then date_trunc('week',  now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'
    when 'monthly' then date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'
    else '-infinity'::timestamptz end;
$$;
revoke all on function public.top_giver_from(text) from public, anon, authenticated;

-- Total hari per pemberi (internal; dipakai dua fungsi di bawah supaya hitungannya selalu sama)
create or replace function public.top_giver_totals(p_from timestamptz)
returns table (giver uuid, days bigint, people bigint, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  with pair as (
    select g.creator as giver, c.user_id as taker,
           least(sum(c.days), 60)::bigint as d,                      -- aturan 4: maks 60 hari per penerima per pemberi per bulan
           max(c.created_at) as last_at
      from public.giveaway_claims c
      join public.giveaways g on g.id = c.giveaway_id
     where c.user_id <> g.creator                                    -- aturan 3
       and c.created_at >= p_from
     group by g.creator, c.user_id, date_trunc('month', c.created_at at time zone 'Asia/Jakarta')
  )
  select p.giver, sum(p.d)::bigint, count(distinct p.taker)::bigint, max(p.last_at)
    from pair p
   where not public.is_banned(p.giver) and not public.is_banned(p.taker)   -- aturan 5
   group by p.giver
  having sum(p.d) > 0;
$$;
revoke all on function public.top_giver_totals(timestamptz) from public, anon, authenticated;

-- Top 1..100 : 'weekly' | 'monthly' | 'all'
create or replace function public.get_top_givers(p_period text default 'all', p_limit int default 100)
returns table (rank bigint, user_id uuid, name text, avatar text, seq bigint, role text, days bigint, people bigint, total_xp numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare lim int := least(greatest(coalesce(p_limit, 100), 1), 100);
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return query
  select q.rk, q.giver,
         coalesce(u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'full_name',
                  u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'User') as nm,
         u.raw_user_meta_data->>'avatar_url' as av,
         pr.seq, coalesce(pr.role, 'user') as rl, q.days, q.people, coalesce(x.xp, 0) as txp
    from (select row_number() over (order by t.days desc, t.people desc, t.last_at asc, t.giver) as rk,
                 t.giver, t.days, t.people
            from public.top_giver_totals(public.top_giver_from(p_period)) t) q
    join auth.users u on u.id = q.giver
    left join public.profiles pr on pr.user_id = q.giver
    left join public.user_xp x on x.user_id = q.giver
   where q.rk <= lim
   order by q.rk;
end; $$;
revoke all on function public.get_top_givers(text, int) from public, anon;
grant execute on function public.get_top_givers(text, int) to authenticated;

-- Peringkat & total hari milik sendiri (untuk yang belum masuk 100 besar). rank = null kalau belum pernah ada yang klaim.
create or replace function public.get_my_top_giver(p_period text default 'all')
returns table (rank bigint, days bigint, people bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
  select q.rk, q.days, q.people
    from (select row_number() over (order by t.days desc, t.people desc, t.last_at asc, t.giver) as rk,
                 t.giver, t.days, t.people
            from public.top_giver_totals(public.top_giver_from(p_period)) t) q
   where q.giver = me;
  if not found then return query select null::bigint, 0::bigint, 0::bigint; end if;
end; $$;
revoke all on function public.get_my_top_giver(text) from public, anon;
grant execute on function public.get_my_top_giver(text) to authenticated;
