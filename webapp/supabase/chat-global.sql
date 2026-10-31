-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
create table if not exists public.global_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  user_name   text,
  user_avatar text,
  user_seq    bigint,
  body        text not null check (char_length(body) between 1 and 500),
  reply_to    bigint,
  reply_name  text,
  reply_body  text,
  created_at  timestamptz not null default now()
);
create index if not exists global_messages_created on public.global_messages (created_at desc);

alter table public.global_messages enable row level security;
drop policy if exists "gchat read" on public.global_messages;
drop policy if exists "gchat insert own" on public.global_messages;
drop policy if exists "gchat delete own" on public.global_messages;
create policy "gchat read" on public.global_messages for select to authenticated using (true);
create policy "gchat insert own" on public.global_messages for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "gchat delete own" on public.global_messages for delete to authenticated using ((select auth.uid()) = user_id);

-- Realtime (pesan baru muncul langsung tanpa refresh)
do $$ begin
  alter publication supabase_realtime add table public.global_messages;
exception when duplicate_object then null; end $$;
alter table public.global_messages replica identity full;
