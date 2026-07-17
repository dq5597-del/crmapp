-- 目標清單：事情清單掛勾目標、戰情室顯示進度
-- 於 Supabase SQL Editor 執行一次即可

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  due_date date,
  metric_type text not null default 'task',   -- 'task'=任務完成率, 'number'=數值目標
  target_value numeric,                        -- 數值目標的目標值
  current_value numeric default 0,             -- 數值目標目前值
  status text not null default '進行中',        -- 進行中 / 已完成 / 暫緩
  sort_order int default 0,
  created_at timestamptz default now()
);

-- 事項掛勾目標（刪除目標時事項保留、僅解除連結）
alter table todos add column if not exists goal_id uuid references goals(id) on delete set null;

create index if not exists idx_todos_goal_id on todos(goal_id);
