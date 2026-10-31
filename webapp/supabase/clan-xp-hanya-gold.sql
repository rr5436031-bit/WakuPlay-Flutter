-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- PERBAIKAN: XP clan (Top Clans) sekarang HANYA bertambah lewat setoran WakuGold.
-- Sebelumnya XP nonton anggota ikut dihitung sebagai XP clan. Sekarang tidak lagi.
-- XP nonton tetap hanya untuk level user.

create or replace function public.clan_total_xp(p_clan bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select c.bank_total::numeric from public.clans c where c.id = p_clan;
$$;
revoke all on function public.clan_total_xp(bigint) from public, anon, authenticated;

-- Daftar anggota: kontribusi = XP hasil setoran Gold saja (bukan XP nonton)
create or replace function public.clan_members_list(p_clan bigint, p_q text default null)
returns table (user_id uuid, name text, avatar text, seq bigint, role text, xp numeric, contrib numeric, donated_gold bigint, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, public.wp_name(m.user_id), u.raw_user_meta_data->>'avatar_url', p.seq, m.role,
         coalesce(x.xp, 0), m.donated_xp::numeric, m.donated_gold, m.joined_at
    from public.clan_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    left join public.user_xp x on x.user_id = m.user_id
   where auth.uid() is not null and m.clan_id = p_clan
     and (p_q is null or btrim(p_q) = ''
          or position(lower(btrim(p_q)) in lower(public.wp_name(m.user_id))) > 0
          or p.seq::text = regexp_replace(btrim(p_q), '^#', ''))
   order by (m.role = 'leader') desc, 7 desc, m.joined_at asc
   limit 200;
$$;
revoke all on function public.clan_members_list(bigint, text) from public, anon;
grant execute on function public.clan_members_list(bigint, text) to authenticated;

-- Anggota keluar: tidak ada lagi XP nonton yang dipindah ke clan
create or replace function public.clan_remove_member(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.clan_members where user_id = p_uid;
end; $$;
revoke all on function public.clan_remove_member(uuid) from public, anon, authenticated;

-- Nerf XP nonton: 1 menit = 200 XP (batas harian 10 jam = 120.000; iframe 3 jam = 36.000)
-- -> jalankan ulang xp-aman.sql (sudah diperbarui) setelah file ini.
