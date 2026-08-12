create table if not exists public.ai_work_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  owner text not null check (owner in ('codex', 'hermes', 'gemini', 'claude', 'xiaoji')),
  status text not null default 'backlog' check (status in ('backlog', 'in_progress', 'waiting_user', 'review', 'done', 'blocked')),
  progress integer not null default 0 check (progress between 0 and 100),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  blocker text,
  user_input_needed text,
  next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_work_items_status_updated_at_idx
  on public.ai_work_items (status, updated_at desc);
create index if not exists ai_work_items_owner_idx
  on public.ai_work_items (owner);

alter table public.ai_work_items enable row level security;

revoke all on table public.ai_work_items from anon;
revoke all on table public.ai_work_items from authenticated;
grant select, insert, update, delete on table public.ai_work_items to authenticated;

drop policy if exists "ai_work_items_admin_select" on public.ai_work_items;
create policy "ai_work_items_admin_select"
  on public.ai_work_items for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_profiles.id = (select auth.uid())
        and user_profiles.role in ('admin', '管理員')
    )
  );

drop policy if exists "ai_work_items_admin_insert" on public.ai_work_items;
create policy "ai_work_items_admin_insert"
  on public.ai_work_items for insert to authenticated
  with check (
    exists (
      select 1 from public.user_profiles
      where user_profiles.id = (select auth.uid())
        and user_profiles.role in ('admin', '管理員')
    )
  );

drop policy if exists "ai_work_items_admin_update" on public.ai_work_items;
create policy "ai_work_items_admin_update"
  on public.ai_work_items for update to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_profiles.id = (select auth.uid())
        and user_profiles.role in ('admin', '管理員')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where user_profiles.id = (select auth.uid())
        and user_profiles.role in ('admin', '管理員')
    )
  );

drop policy if exists "ai_work_items_admin_delete" on public.ai_work_items;
create policy "ai_work_items_admin_delete"
  on public.ai_work_items for delete to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_profiles.id = (select auth.uid())
        and user_profiles.role in ('admin', '管理員')
    )
  );

create or replace function public.set_ai_work_items_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_ai_work_items_updated_at() from public, anon, authenticated;

drop trigger if exists set_ai_work_items_updated_at on public.ai_work_items;
create trigger set_ai_work_items_updated_at
  before update on public.ai_work_items
  for each row execute function public.set_ai_work_items_updated_at();
