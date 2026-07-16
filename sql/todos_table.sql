-- ============================================================
-- 事情清單（待辦）資料表  todos
-- 在 Supabase → SQL Editor 貼上執行一次即可。
-- 分類（category）為自由文字，預設常用：工作 / 家庭 / 興趣，可自訂新增。
-- schedule_id 用來連結「放入行事曆」後在 schedules 建立的那筆行程。
-- ============================================================

create table if not exists public.todos (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  category     text not null default '工作',
  notes        text,
  is_done      boolean not null default false,
  done_at      timestamptz,
  due_date     date,
  schedule_id  uuid references public.schedules(id) on delete set null,
  sort_order   int  not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists todos_category_idx  on public.todos(category);
create index if not exists todos_due_date_idx   on public.todos(due_date);
create index if not exists todos_is_done_idx     on public.todos(is_done);

-- updated_at 自動更新
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists todos_set_updated_at on public.todos;
create trigger todos_set_updated_at
  before update on public.todos
  for each row execute function public.set_updated_at();

-- RLS：登入者皆可讀寫（與本系統其他資料表一致；若貴專案採更嚴格政策，請自行調整）
alter table public.todos enable row level security;

drop policy if exists todos_all_authenticated on public.todos;
create policy todos_all_authenticated on public.todos
  for all to authenticated using (true) with check (true);
