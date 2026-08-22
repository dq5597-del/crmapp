-- 個人任務清單：任務與目標只能由建立者存取。
-- 舊資料沒有記錄建立者，保留於資料庫但不向任何一般帳號顯示，待管理者確認後再認領。

alter table public.todos
  alter column created_by set default auth.uid();

alter table public.goals
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.goals
  alter column created_by set default auth.uid();

create index if not exists todos_created_by_idx on public.todos(created_by);
create index if not exists goals_created_by_idx on public.goals(created_by);

alter table public.todos enable row level security;
alter table public.goals enable row level security;

drop policy if exists todos_all_authenticated on public.todos;
drop policy if exists todos_select on public.todos;
drop policy if exists todos_insert on public.todos;
drop policy if exists todos_update on public.todos;
drop policy if exists todos_delete on public.todos;

create policy todos_select on public.todos
  for select to authenticated
  using (created_by = (select auth.uid()));
create policy todos_insert on public.todos
  for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy todos_update on public.todos
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));
create policy todos_delete on public.todos
  for delete to authenticated
  using (created_by = (select auth.uid()));

drop policy if exists goals_all_authenticated on public.goals;
drop policy if exists goals_select on public.goals;
drop policy if exists goals_insert on public.goals;
drop policy if exists goals_update on public.goals;
drop policy if exists goals_delete on public.goals;

create policy goals_select on public.goals
  for select to authenticated
  using (created_by = (select auth.uid()));
create policy goals_insert on public.goals
  for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy goals_update on public.goals
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));
create policy goals_delete on public.goals
  for delete to authenticated
  using (created_by = (select auth.uid()));

