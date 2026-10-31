-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- Jalankan SETELAH wakugames-clan.sql (butuh tabel wallets & gold_ledger) dan keamanan-7-akses-panel.sql / blokir.sql.
-- Fitur: Panel Developer -> tab Gold: tambah / kurangi WakuGold user. Hanya akun dengan akses Panel Developer.

-- Saldo WakuGold seorang user (untuk ditampilkan setelah dicari)
create or replace function public.dev_gold_get(p_target uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare g bigint;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  select gold into g from public.wallets where user_id = p_target;
  return coalesce(g, 0);
end; $$;
revoke all on function public.dev_gold_get(uuid) from public, anon;
grant execute on function public.dev_gold_get(uuid) to authenticated;

-- Tambah ('add') atau kurangi ('sub') WakuGold. Saldo tidak boleh negatif. Tercatat di gold_ledger.
create or replace function public.dev_gold_adjust(p_target uuid, p_amount bigint, p_mode text) returns bigint
language plpgsql security definer set search_path = public as $$
declare g bigint;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_mode not in ('add', 'sub') then raise exception 'Pilih tambah atau kurangi'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000000 then raise exception 'Jumlah harus 1 sampai 1.000.000.000'; end if;
  if not exists (select 1 from public.profiles where user_id = p_target) then raise exception 'User tidak ditemukan'; end if;

  insert into public.wallets (user_id) values (p_target) on conflict do nothing;
  select gold into g from public.wallets where user_id = p_target for update;     -- kunci baris: aman dari klik ganda
  if p_mode = 'sub' and g < p_amount then raise exception 'WakuGold user hanya %, tidak bisa dikurangi %', g, p_amount; end if;
  if p_mode = 'add' and g + p_amount > 1000000000000 then raise exception 'Saldo terlalu besar'; end if;

  update public.wallets set gold = gold + case when p_mode = 'add' then p_amount else -p_amount end, updated_at = now()
   where user_id = p_target returning gold into g;
  insert into public.gold_ledger (user_id, delta, reason)
  values (p_target, case when p_mode = 'add' then p_amount else -p_amount end, 'dev_' || p_mode || ':' || auth.uid()::text);
  return g;
end; $$;
revoke all on function public.dev_gold_adjust(uuid, bigint, text) from public, anon;
grant execute on function public.dev_gold_adjust(uuid, bigint, text) to authenticated;
