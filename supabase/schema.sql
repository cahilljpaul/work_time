-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Deny by default: row level security is on, and each policy only lets a user touch their own row.

create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint data_size check (pg_column_size(data) < 1000000)
);

alter table public.user_data enable row level security;
alter table public.user_data force row level security;

drop policy if exists "own row select" on public.user_data;
drop policy if exists "own row insert" on public.user_data;
drop policy if exists "own row update" on public.user_data;
drop policy if exists "own row delete" on public.user_data;

create policy "own row select" on public.user_data for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own row insert" on public.user_data for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own row update" on public.user_data for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own row delete" on public.user_data for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.user_data from anon;
