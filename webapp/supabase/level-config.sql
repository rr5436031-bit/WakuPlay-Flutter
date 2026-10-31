-- ============================================================================================
-- RUMUS LEVEL & TIER DIPINDAH KE SERVER (tidak ada lagi angka XP / syarat level di kode aplikasi)
-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run  (aman dijalankan berulang)
-- Jalankan SETELAH keamanan-6-panel-developer.sql (butuh is_developer dan dev_audit).
--
--  * base_cost : XP dasar per level      * growth : pertambahan biaya per level (kuadrat)
--  * tiers     : 10 angka = level awal tiap tier (Batu Bara ... Bedrock). Harus naik terus, angka pertama selalu 1.
--  * Semua orang boleh MEMBACA (untuk menampilkan level). Hanya DEVELOPER yang bisa MENGUBAH, dicek di server dan dicatat di dev_audit.
--  * Mengubah angka ini hanya mengubah cara level DIHITUNG dari total XP. XP asli (user_xp) tidak berubah.
-- ============================================================================================

create table if not exists public.level_config (
  id        boolean primary key default true check (id),
  base_cost numeric not null default 2000 check (base_cost between 100 and 1000000),
  growth    numeric not null default 0.0008 check (growth >= 0 and growth <= 10),
  tiers     jsonb not null default '[1,25,70,180,360,720,1400,2400,4200,7200]'::jsonb
);
insert into public.level_config (id) values (true) on conflict (id) do nothing;
alter table public.level_config enable row level security;
revoke all on public.level_config from anon, authenticated;

create or replace function public.level_config_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('base_cost', c.base_cost, 'growth', c.growth, 'tiers', c.tiers) from public.level_config c where c.id;
$$;
revoke all on function public.level_config_get() from public;
grant execute on function public.level_config_get() to anon, authenticated;

create or replace function public.dev_level_config_set(p_base numeric, p_growth numeric, p_tiers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i int; prev numeric := 0; cur numeric; old jsonb;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_base is null or p_base < 100 or p_base > 1000000 then raise exception 'XP dasar harus 100 sampai 1.000.000'; end if;
  if p_growth is null or p_growth < 0 or p_growth > 10 then raise exception 'Pertumbuhan harus 0 sampai 10'; end if;
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) <> 10 then raise exception 'Tier harus 10 angka'; end if;
  for i in 0 .. 9 loop
    begin cur := (p_tiers ->> i)::numeric; exception when others then raise exception 'Tier % bukan angka', i + 1; end;
    if cur is null or cur <> trunc(cur) or cur > 1000000 then raise exception 'Tier % harus bilangan bulat maks 1.000.000', i + 1; end if;
    if i = 0 and cur <> 1 then raise exception 'Tier pertama harus mulai di level 1'; end if;
    if i > 0 and cur <= prev then raise exception 'Level awal tier harus naik terus (tier % <= tier %)', i + 1, i; end if;
    prev := cur;
  end loop;
  old := public.level_config_get();
  update public.level_config set base_cost = p_base, growth = p_growth, tiers = p_tiers where id;
  insert into public.dev_audit (actor, target, field, old_value, new_value) values (auth.uid(), null, 'level_config', left(old::text, 500), left(public.level_config_get()::text, 500));
  return public.level_config_get();
end; $$;
revoke all on function public.dev_level_config_set(numeric, numeric, jsonb) from public, anon;
grant execute on function public.dev_level_config_set(numeric, numeric, jsonb) to authenticated;

-- Cek cepat (opsional): select public.level_config_get();

notify pgrst, 'reload schema';
