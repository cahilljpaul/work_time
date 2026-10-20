-- Run once in Supabase SQL Editor (after schema.sql). Task sharing, view only.
-- A share is a read-only snapshot of one task, addressed to an email.
-- Owner: can create, update and delete. Recipient: can only read and remove it from their list.

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null,
  recipient_email text not null,
  task_id text not null,
  task jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, recipient_email, task_id),
  constraint recipient_fmt check (recipient_email = lower(recipient_email) and recipient_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(recipient_email) <= 254),
  constraint not_self check (recipient_email <> lower(owner_email)),
  constraint task_size check (pg_column_size(task) < 2000),
  constraint task_id_len check (length(task_id) <= 64)
);

create index if not exists shares_recipient_idx on public.shares (recipient_email);

-- Cap shares per owner to limit abuse.
create or replace function public.shares_limit() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if (select count(*) from public.shares where owner_id = new.owner_id) >= 100 then
    raise exception 'Share limit reached';
  end if;
  return new;
end $$;
drop trigger if exists shares_limit_trg on public.shares;
create trigger shares_limit_trg before insert on public.shares for each row execute function public.shares_limit();

alter table public.shares enable row level security;
alter table public.shares force row level security;

drop policy if exists "shares select" on public.shares;
drop policy if exists "shares insert" on public.shares;
drop policy if exists "shares update" on public.shares;
drop policy if exists "shares delete" on public.shares;

create policy "shares select" on public.shares for select to authenticated
  using (owner_id = (select auth.uid()) or recipient_email = lower((select auth.jwt() ->> 'email')));
create policy "shares insert" on public.shares for insert to authenticated
  with check (owner_id = (select auth.uid()) and owner_email = lower((select auth.jwt() ->> 'email')));
create policy "shares update" on public.shares for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and owner_email = lower((select auth.jwt() ->> 'email')));
create policy "shares delete" on public.shares for delete to authenticated
  using (owner_id = (select auth.uid()) or recipient_email = lower((select auth.jwt() ->> 'email')));

revoke all on public.shares from anon;
