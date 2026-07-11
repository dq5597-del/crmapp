-- ============================================================
-- 人資管理 第2階段：出勤與請假
-- 前置：已執行 supabase/schema_hr.sql（含 is_hr() 與 hr_employees）
-- 執行位置：Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 出勤紀錄 ────────────────────────────────────────────────
create table if not exists public.hr_attendance (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.hr_employees(id) on delete cascade,
  work_date      date not null,
  clock_in       time,
  clock_out      time,
  work_hours     numeric(5,2),          -- 工作時數
  overtime_hours numeric(5,2) default 0,-- 加班時數
  status         text not null default '正常', -- 正常/遲到/早退/請假/出差/曠職/休假
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index if not exists idx_hr_attendance_date on public.hr_attendance(work_date desc);

-- ── 請假申請 ────────────────────────────────────────────────
create table if not exists public.hr_leaves (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.hr_employees(id) on delete cascade,
  leave_type    text not null,          -- 特休/事假/病假/公假/婚假/喪假/產假/陪產假/生理假/補休
  start_date    date not null,
  end_date      date not null,
  hours         numeric(6,2) not null default 8,  -- 請假時數
  reason        text,
  status        text not null default '待審核',   -- 待審核/已核准/已駁回/已取消
  approver_id   uuid references auth.users(id) on delete set null,
  approved_at   timestamptz,
  reject_reason text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_hr_leaves_emp    on public.hr_leaves(employee_id);
create index if not exists idx_hr_leaves_status on public.hr_leaves(status);

-- ── 特休額度（每人每年）────────────────────────────────────
create table if not exists public.hr_leave_balances (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.hr_employees(id) on delete cascade,
  year         integer not null,
  annual_hours numeric(6,2) not null default 0,  -- 年度特休總時數（例：7天=56小時）
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (employee_id, year)
);

-- updated_at 自動更新
drop trigger if exists trg_hr_attendance_touch on public.hr_attendance;
create trigger trg_hr_attendance_touch before update on public.hr_attendance
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_hr_leaves_touch on public.hr_leaves;
create trigger trg_hr_leaves_touch before update on public.hr_leaves
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_hr_leave_balances_touch on public.hr_leave_balances;
create trigger trg_hr_leave_balances_touch before update on public.hr_leave_balances
  for each row execute function public.touch_updated_at();

-- ── RLS：僅管理員/主管可存取 ────────────────────────────────
alter table public.hr_attendance      enable row level security;
alter table public.hr_leaves          enable row level security;
alter table public.hr_leave_balances  enable row level security;

drop policy if exists "hr_attendance_all" on public.hr_attendance;
create policy "hr_attendance_all" on public.hr_attendance
  for all using (public.is_hr()) with check (public.is_hr());

drop policy if exists "hr_leaves_all" on public.hr_leaves;
create policy "hr_leaves_all" on public.hr_leaves
  for all using (public.is_hr()) with check (public.is_hr());

drop policy if exists "hr_leave_balances_all" on public.hr_leave_balances;
create policy "hr_leave_balances_all" on public.hr_leave_balances
  for all using (public.is_hr()) with check (public.is_hr());

notify pgrst, 'reload schema';
