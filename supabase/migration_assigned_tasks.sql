-- 2026-07-21 交辦任務（主管派工，支線可見）
-- 在 Supabase SQL Editor 執行（可重複執行）

create table if not exists assigned_tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  notes         text,
  assigned_by   uuid not null references user_profiles(id) on delete cascade,
  assigned_to   uuid not null references user_profiles(id) on delete cascade,
  due_date      date,
  status        text not null default '待處理'
                  check (status in ('待處理','進行中','已完成')),
  created_at    timestamptz default now(),
  completed_at  timestamptz
);

create index if not exists idx_assigned_tasks_to on assigned_tasks(assigned_to, status);
create index if not exists idx_assigned_tasks_by on assigned_tasks(assigned_by);

alter table assigned_tasks enable row level security;
drop policy if exists "authenticated users can do all" on assigned_tasks;
create policy "authenticated users can do all" on assigned_tasks
  for all to authenticated using (true) with check (true);
