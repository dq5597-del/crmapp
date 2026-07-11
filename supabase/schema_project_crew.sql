-- ============================================================
-- 專案施工團隊（工頭 + 工班人員：員工／協力廠商／臨時工）
-- 前置：schema.sql（projects）、schema_hr.sql（hr_employees, hr_contractors, touch_updated_at）
-- 執行位置：Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists public.project_crew (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,

  member_kind   text not null default '員工',      -- 員工 / 協力廠商 / 臨時工
  employee_id   uuid references public.hr_employees(id)   on delete set null,
  contractor_id uuid references public.hr_contractors(id) on delete set null,
  name          text not null,                     -- 顯示姓名（由員工/廠商帶入，或手動輸入）
  phone         text,

  role          text not null default '工班人員',   -- 工頭 / 技師 / 工班人員 / 助手
  is_leader     boolean not null default false,    -- 是否為本專案工頭

  start_date    date,
  end_date      date,
  days          numeric(6,2) default 0,            -- 工作天數
  daily_rate    numeric(12,2) default 0,           -- 日薪／日工資
  cost          numeric(12,2) default 0,           -- 人工成本（可自動 = days × daily_rate）
  notes         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_project_crew_project on public.project_crew(project_id);
create index if not exists idx_project_crew_leader  on public.project_crew(project_id) where is_leader;

drop trigger if exists trg_project_crew_touch on public.project_crew;
create trigger trg_project_crew_touch before update on public.project_crew
  for each row execute function public.touch_updated_at();

-- RLS：與 projects 一致（登入者可讀寫）
alter table public.project_crew enable row level security;
drop policy if exists "project_crew_all" on public.project_crew;
create policy "project_crew_all" on public.project_crew
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── 人員名冊 View ───────────────────────────────────────────
-- hr_employees / hr_contractors 受 is_hr() RLS 保護，一般業務員讀不到，
-- 但排工班時需要挑人。這裡開一個「只含非敏感欄位」的名冊 view，
-- 不含身分證、銀行帳戶、月薪，讓所有登入者都能選人。
create or replace view public.hr_roster as
  select e.id,
         '員工'::text            as kind,
         e.full_name             as name,
         e.phone                 as phone,
         e.title                 as skill,
         0::numeric              as day_rate
  from public.hr_employees e
  where coalesce(e.status, '在職') = '在職'
  union all
  select c.id,
         coalesce(c.kind, '臨時工') as kind,
         coalesce(nullif(c.company_name, ''), c.contact_name, '未命名') as name,
         c.phone                 as phone,
         c.skill                 as skill,
         coalesce(c.day_rate, 0) as day_rate
  from public.hr_contractors c
  where coalesce(c.is_active, true);

grant select on public.hr_roster to authenticated;

notify pgrst, 'reload schema';
