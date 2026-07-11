-- ============================================================
-- 人資管理 第4階段：考績與教育訓練
-- 前置：schema_hr.sql（is_hr, hr_employees, touch_updated_at）
-- 執行位置：Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 績效考評（平衡計分卡四構面）────────────────────────────
create table if not exists public.hr_reviews (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.hr_employees(id) on delete cascade,
  period          text not null,                  -- 2026-H1 / 2026-Q1 / 2026
  review_type     text not null default '年度考評',  -- 年度考評/半年考評/季考評/試用期考評
  reviewer        text,                           -- 考評主管
  review_date     date,

  -- BSC 四構面（0~100 分）
  score_financial   numeric(5,2) default 0,       -- 財務：營收/毛利/成本達成
  score_customer    numeric(5,2) default 0,       -- 顧客：客戶滿意度/回購/新客
  score_process     numeric(5,2) default 0,       -- 內部流程：交期/品質/錯誤率
  score_learning    numeric(5,2) default 0,       -- 學習成長：技能/證照/知識分享

  -- 權重（合計建議 100）
  weight_financial  numeric(5,2) default 30,
  weight_customer   numeric(5,2) default 30,
  weight_process    numeric(5,2) default 20,
  weight_learning   numeric(5,2) default 20,

  total_score     numeric(5,2) default 0,         -- 加權總分
  grade           text,                           -- S/A/B/C/D
  goals           text,                           -- 下期目標（MBO）
  strengths       text,                           -- 優勢
  improvements    text,                           -- 待改善
  employee_comment text,                          -- 員工自評/回覆
  status          text not null default '草稿',    -- 草稿/已完成
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (employee_id, period, review_type)
);
create index if not exists idx_hr_reviews_period on public.hr_reviews(period);

-- ── 教育訓練與證照 ──────────────────────────────────────────
create table if not exists public.hr_trainings (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.hr_employees(id) on delete cascade,
  title           text not null,                  -- 課程/證照名稱
  category        text default '外訓',             -- 內訓/外訓/線上課程/研討會/證照
  provider        text,                           -- 主辦單位/發證機構
  start_date      date,
  end_date        date,
  hours           numeric(6,2) default 0,         -- 訓練時數
  cost            numeric(12,2) default 0,        -- 費用
  score           text,                           -- 成績/結訓評語
  status          text not null default '規劃中',   -- 規劃中/進行中/已完成/未通過
  certificate_no  text,                           -- 證照編號
  cert_issue_date  date,                          -- 發證日
  cert_expiry_date date,                          -- 證照到期日（提醒用）
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_hr_trainings_emp on public.hr_trainings(employee_id);
create index if not exists idx_hr_trainings_expiry on public.hr_trainings(cert_expiry_date);

-- ── updated_at 觸發器 ───────────────────────────────────────
drop trigger if exists trg_hr_reviews_touch on public.hr_reviews;
create trigger trg_hr_reviews_touch before update on public.hr_reviews
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_hr_trainings_touch on public.hr_trainings;
create trigger trg_hr_trainings_touch before update on public.hr_trainings
  for each row execute function public.touch_updated_at();

-- ── RLS：僅管理員/主管 ──────────────────────────────────────
alter table public.hr_reviews   enable row level security;
alter table public.hr_trainings enable row level security;

drop policy if exists "hr_reviews_all" on public.hr_reviews;
create policy "hr_reviews_all" on public.hr_reviews
  for all using (public.is_hr()) with check (public.is_hr());

drop policy if exists "hr_trainings_all" on public.hr_trainings;
create policy "hr_trainings_all" on public.hr_trainings
  for all using (public.is_hr()) with check (public.is_hr());

notify pgrst, 'reload schema';
