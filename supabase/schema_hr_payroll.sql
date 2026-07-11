-- ============================================================
-- 人資管理 第3階段：薪資與勞健保
-- 前置：schema_hr.sql（is_hr, hr_employees）、schema_hr_attendance.sql
-- 執行位置：Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 費率設定（單列；可於畫面調整）──────────────────────────
create table if not exists public.hr_payroll_settings (
  id                    uuid primary key default gen_random_uuid(),
  labor_rate            numeric(6,4) not null default 0.1200, -- 勞保普通事故費率
  employment_rate       numeric(6,4) not null default 0.0100, -- 就業保險費率
  labor_employee_share  numeric(6,4) not null default 0.2000, -- 勞保/就保 員工負擔比例
  labor_employer_share  numeric(6,4) not null default 0.7000, -- 雇主負擔比例
  health_rate           numeric(6,4) not null default 0.0517, -- 健保費率
  health_employee_share numeric(6,4) not null default 0.3000, -- 健保 本人負擔比例
  health_employer_share numeric(6,4) not null default 0.6000, -- 健保 雇主負擔比例
  pension_rate          numeric(6,4) not null default 0.0600, -- 勞退雇主提繳率
  overtime_multiplier   numeric(6,4) not null default 1.3400, -- 加班費倍率
  monthly_hours         numeric(6,2) not null default 240,    -- 月工時基數(用於時薪換算)
  notes                 text,
  updated_at            timestamptz not null default now()
);

-- ── 薪資單 ──────────────────────────────────────────────────
create table if not exists public.hr_payrolls (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.hr_employees(id) on delete cascade,
  period            text not null,               -- YYYY-MM
  insurance_salary  numeric(12,2) default 0,     -- 投保薪資
  dependents        integer default 0,           -- 健保眷屬人數

  -- 應發
  base_salary       numeric(12,2) default 0,
  overtime_hours    numeric(6,2)  default 0,
  overtime_pay      numeric(12,2) default 0,
  allowance         numeric(12,2) default 0,     -- 津貼
  bonus             numeric(12,2) default 0,     -- 獎金
  other_add         numeric(12,2) default 0,

  -- 應扣（員工負擔）
  labor_insurance   numeric(12,2) default 0,     -- 勞保+就保 自付
  health_insurance  numeric(12,2) default 0,     -- 健保 自付
  leave_deduction   numeric(12,2) default 0,     -- 請假扣款
  tax               numeric(12,2) default 0,     -- 代扣所得稅
  other_deduct      numeric(12,2) default 0,

  -- 雇主負擔（公司成本，不從薪水扣）
  employer_labor    numeric(12,2) default 0,
  employer_health   numeric(12,2) default 0,
  employer_pension  numeric(12,2) default 0,     -- 勞退提繳 6%

  gross_pay         numeric(12,2) default 0,     -- 應發合計
  total_deduction   numeric(12,2) default 0,     -- 應扣合計
  net_pay           numeric(12,2) default 0,     -- 實發

  status            text not null default '草稿', -- 草稿/已確認/已發放
  pay_date          date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (employee_id, period)
);
create index if not exists idx_hr_payrolls_period on public.hr_payrolls(period);

drop trigger if exists trg_hr_payrolls_touch on public.hr_payrolls;
create trigger trg_hr_payrolls_touch before update on public.hr_payrolls
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_hr_payroll_settings_touch on public.hr_payroll_settings;
create trigger trg_hr_payroll_settings_touch before update on public.hr_payroll_settings
  for each row execute function public.touch_updated_at();

-- 預設一列費率設定
insert into public.hr_payroll_settings (notes)
select '預設費率，請依當年度公告調整'
where not exists (select 1 from public.hr_payroll_settings);

-- ── RLS：僅管理員/主管 ──────────────────────────────────────
alter table public.hr_payrolls         enable row level security;
alter table public.hr_payroll_settings enable row level security;

drop policy if exists "hr_payrolls_all" on public.hr_payrolls;
create policy "hr_payrolls_all" on public.hr_payrolls
  for all using (public.is_hr()) with check (public.is_hr());

drop policy if exists "hr_payroll_settings_all" on public.hr_payroll_settings;
create policy "hr_payroll_settings_all" on public.hr_payroll_settings
  for all using (public.is_hr()) with check (public.is_hr());

notify pgrst, 'reload schema';
