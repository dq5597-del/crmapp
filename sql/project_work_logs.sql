-- ============================================================
-- 專案施工工時紀錄（逐日派工）
--   前置：schema.sql（projects）、schema_project_crew.sql（project_crew, hr_roster）
--   成本由 trigger 依計價方式自動算，前端不需重算
-- 可重複執行（idempotent）
-- ============================================================

create table if not exists public.project_work_logs (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  crew_id      uuid references public.project_crew(id) on delete set null,

  work_date    date not null default current_date,
  member_kind  text not null default '員工',      -- 員工 / 協力廠商 / 臨時工
  employee_id  uuid,
  contractor_id uuid,
  name         text not null,

  hours        numeric(5,2) not null default 8,   -- 派工工時
  rate_type    text not null default '日薪'
                 check (rate_type in ('日薪','時薪','點工','外包計件')),
  rate         numeric(12,2) not null default 0,
  cost         numeric(12,2) not null default 0,  -- 由 trigger 計算

  work_item    text,                              -- 施工項目（配線／掛架／調校…）
  notes        text,

  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_work_logs_project on public.project_work_logs(project_id);
create index if not exists idx_work_logs_date    on public.project_work_logs(project_id, work_date);

-- 同一人同一天同一工項只登一筆，避免重複派工灌成本
create unique index if not exists uq_work_logs_person_day
  on public.project_work_logs(project_id, work_date, name, coalesce(work_item, ''));

-- ── 成本自動計算 ────────────────────────────────────────────
--   日薪：rate × (hours / 8)　未滿一天按比例
--   時薪：rate × hours
--   點工／外包計件：rate（一趟／一件一價，與工時無關）
create or replace function public.calc_work_log_cost()
returns trigger language plpgsql as $$
begin
  new.cost := case new.rate_type
    when '日薪' then round(coalesce(new.rate, 0) * (coalesce(new.hours, 0) / 8.0))
    when '時薪' then round(coalesce(new.rate, 0) * coalesce(new.hours, 0))
    else round(coalesce(new.rate, 0))
  end;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_work_logs_cost on public.project_work_logs;
create trigger trg_work_logs_cost before insert or update on public.project_work_logs
  for each row execute function public.calc_work_log_cost();

-- ── RLS：與專案一致 ─────────────────────────────────────────
alter table public.project_work_logs enable row level security;
drop policy if exists "work_logs_all" on public.project_work_logs;
create policy "work_logs_all" on public.project_work_logs
  for all to authenticated using (true) with check (true);

-- ── 專案人工彙總 View（供專案損益分析使用）──────────────────
--   人工成本與外包費用分開，因為兩者毛利結構不同，
--   混在一起就看不出該砍哪一邊。
create or replace view public.v_project_labor as
  select
    project_id,
    sum(hours)                                                          as total_hours,
    count(distinct work_date)                                           as work_days,
    count(distinct name)                                                as headcount,
    coalesce(sum(cost) filter (where rate_type <> '外包計件'), 0)        as labor_cost,
    coalesce(sum(cost) filter (where rate_type =  '外包計件'), 0)        as outsource_cost,
    coalesce(sum(cost), 0)                                              as total_cost
  from public.project_work_logs
  group by project_id;

grant select on public.v_project_labor to authenticated;

notify pgrst, 'reload schema';
