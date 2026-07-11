-- ============================================================
-- 人資管理 第1階段：員工資料卡 + 協力廠商/臨時工
-- 執行位置：Supabase Dashboard → SQL Editor
-- ⚠ 含身分證字號/銀行帳戶/薪資等敏感資料 → RLS 僅限管理員與主管
-- ============================================================

-- 權限判斷（SECURITY DEFINER 繞過 RLS，避免政策自我遞迴）
create or replace function public.is_hr()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role in ('admin', 'manager')
  );
$$;

-- ── 員工資料卡 ──────────────────────────────────────────────
create table if not exists public.hr_employees (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete set null, -- 綁定登入帳號(選填)
  employee_no       text,
  full_name         text not null,
  id_number         text,          -- 身分證字號（敏感）
  gender            text,          -- 男/女/其他
  birth_date        date,
  phone             text,
  email             text,
  address           text,
  department        text,
  title             text,
  employment_type   text default '正職',   -- 正職/兼職/工讀/約聘
  hire_date         date,
  resign_date       date,
  status            text default '在職',   -- 在職/留停/離職
  bank_name         text,
  bank_account      text,          -- 銀行帳戶（敏感）
  base_salary       numeric,       -- 月薪（敏感）
  labor_insurance_no  text,        -- 勞保證號
  health_insurance_no text,        -- 健保證號
  emergency_contact  text,
  emergency_phone    text,
  emergency_relation text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists uq_hr_employees_no
  on public.hr_employees(employee_no) where employee_no is not null;
create index if not exists idx_hr_employees_status on public.hr_employees(status);

-- ── 協力廠商 / 臨時工 ───────────────────────────────────────
create table if not exists public.hr_contractors (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default '臨時工',   -- 協力廠商 / 臨時工
  name          text not null,                    -- 個人姓名或公司名
  company_name  text,
  tax_id        text,
  contact_name  text,
  phone         text,
  email         text,
  address       text,
  skill         text,        -- 工種／專長（如：木工、音響安裝）
  day_rate      numeric,     -- 日薪／工資
  id_number     text,        -- 身分證字號（臨時工報稅用，敏感）
  bank_name     text,
  bank_account  text,        -- 敏感
  is_active     boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_hr_contractors_kind on public.hr_contractors(kind);

-- updated_at 自動更新
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_hr_employees_touch on public.hr_employees;
create trigger trg_hr_employees_touch before update on public.hr_employees
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_hr_contractors_touch on public.hr_contractors;
create trigger trg_hr_contractors_touch before update on public.hr_contractors
  for each row execute function public.touch_updated_at();

-- ── RLS：僅管理員/主管可存取（一般員工完全看不到）──────────
alter table public.hr_employees   enable row level security;
alter table public.hr_contractors enable row level security;

drop policy if exists "hr_employees_all" on public.hr_employees;
create policy "hr_employees_all" on public.hr_employees
  for all using (public.is_hr()) with check (public.is_hr());

drop policy if exists "hr_contractors_all" on public.hr_contractors;
create policy "hr_contractors_all" on public.hr_contractors
  for all using (public.is_hr()) with check (public.is_hr());

notify pgrst, 'reload schema';
