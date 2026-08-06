-- ============================================================
-- 專案施工進度追蹤（工項清單 + 範本化）
--   整案完成率 = Σ(工項權重 × 完成率) ÷ Σ(工項權重)
--   前置：schema.sql（projects）
-- 可重複執行（idempotent）
-- ============================================================

-- ── 1. 工項範本主檔 ────────────────────────────────────────
create table if not exists public.project_task_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                    -- 影音設備工程範本
  category    text,                             -- 工程類別（會議室／禮堂／教室…）
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.project_task_template_items (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.project_task_templates(id) on delete cascade,
  seq_no       int not null default 1,
  task_name    text not null,
  weight       numeric(5,2) not null default 0,  -- 權重 %
  default_days int default 1,                    -- 預估工期（天），套用時自動排預定日
  notes        text
);

create index if not exists idx_tpl_items_template on public.project_task_template_items(template_id, seq_no);

-- ── 2. 專案工項 ────────────────────────────────────────────
create table if not exists public.project_tasks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  seq_no         int not null default 1,
  task_name      text not null,
  weight         numeric(5,2) not null default 0,   -- 權重 %
  progress_pct   numeric(5,2) not null default 0
                   check (progress_pct >= 0 and progress_pct <= 100),
  planned_start  date,
  planned_end    date,
  actual_start   date,
  actual_end     date,
  assignee       text,                              -- 負責人／工班
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_project_tasks on public.project_tasks(project_id, seq_no);

-- 進度 0→有值時自動記實際開工日；達 100% 記完工日；退回未滿 100 清掉完工日
create or replace function public.touch_project_task()
returns trigger language plpgsql as $$
begin
  if new.progress_pct > 0 and new.actual_start is null then
    new.actual_start := current_date;
  end if;
  if new.progress_pct >= 100 and new.actual_end is null then
    new.actual_end := current_date;
  elsif new.progress_pct < 100 then
    new.actual_end := null;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_project_tasks_touch on public.project_tasks;
create trigger trg_project_tasks_touch before insert or update on public.project_tasks
  for each row execute function public.touch_project_task();

-- ── 3. RLS ─────────────────────────────────────────────────
alter table public.project_tasks                enable row level security;
alter table public.project_task_templates       enable row level security;
alter table public.project_task_template_items  enable row level security;

drop policy if exists "project_tasks_all" on public.project_tasks;
create policy "project_tasks_all" on public.project_tasks
  for all to authenticated using (true) with check (true);

drop policy if exists "task_templates_all" on public.project_task_templates;
create policy "task_templates_all" on public.project_task_templates
  for all to authenticated using (true) with check (true);

drop policy if exists "task_template_items_all" on public.project_task_template_items;
create policy "task_template_items_all" on public.project_task_template_items
  for all to authenticated using (true) with check (true);

-- ── 4. 整案進度 View ───────────────────────────────────────
--   權重加總不一定剛好 100，改用加權平均，避免權重沒填滿時完成率被低估
create or replace view public.v_project_progress as
  select
    project_id,
    count(*)                                                          as task_count,
    count(*) filter (where progress_pct >= 100)                       as done_count,
    count(*) filter (where progress_pct < 100
                       and planned_end is not null
                       and planned_end < current_date)                as delayed_count,
    sum(weight)                                                       as weight_total,
    case when sum(weight) > 0
         then round(sum(weight * progress_pct) / sum(weight), 1)
         else 0 end                                                   as progress_pct
  from public.project_tasks
  group by project_id;

grant select on public.v_project_progress to authenticated;

-- ── 5. 套用範本 ────────────────────────────────────────────
--   p_start_date 為起始日，依 default_days 依序往後排預定起訖
--   已有工項的專案預設不覆蓋，需 p_replace = true 才清空重建
create or replace function public.apply_task_template(
  p_project_id  uuid,
  p_template_id uuid,
  p_start_date  date default current_date,
  p_replace     boolean default false
) returns int language plpgsql security definer as $$
declare
  existing int;
  cur      date := coalesce(p_start_date, current_date);
  rec      record;
  inserted int := 0;
begin
  select count(*) into existing from public.project_tasks where project_id = p_project_id;
  if existing > 0 then
    if not p_replace then
      raise exception '此專案已有 % 筆工項，如要以範本重建請勾選覆蓋', existing;
    end if;
    delete from public.project_tasks where project_id = p_project_id;
  end if;

  for rec in
    select * from public.project_task_template_items
    where template_id = p_template_id
    order by seq_no
  loop
    insert into public.project_tasks
      (project_id, seq_no, task_name, weight, planned_start, planned_end, notes)
    values
      (p_project_id, rec.seq_no, rec.task_name, rec.weight,
       cur, cur + (greatest(coalesce(rec.default_days, 1), 1) - 1), rec.notes);
    cur := cur + greatest(coalesce(rec.default_days, 1), 1);
    inserted := inserted + 1;
  end loop;

  return inserted;
end $$;

grant execute on function public.apply_task_template(uuid, uuid, date, boolean) to authenticated;

-- ── 6. 預載：影音設備工程範本 ──────────────────────────────
insert into public.project_task_templates (name, category, description)
select '影音設備工程範本', '影音整合', '光輝影音標準施工流程，權重合計 100%'
where not exists (
  select 1 from public.project_task_templates where name = '影音設備工程範本'
);

insert into public.project_task_template_items (template_id, seq_no, task_name, weight, default_days)
select t.id, v.seq, v.nm, v.w, v.d
from public.project_task_templates t
cross join (values
  (1, '現場拉線與管路',        20::numeric, 3),
  (2, '壁掛架／吊架施作',      20::numeric, 2),
  (3, '機櫃與設備上架安裝',    30::numeric, 3),
  (4, '系統調音／訊號測試',    20::numeric, 2),
  (5, '教育訓練與交付驗收',    10::numeric, 1)
) as v(seq, nm, w, d)
where t.name = '影音設備工程範本'
  and not exists (
    select 1 from public.project_task_template_items i where i.template_id = t.id
  );

notify pgrst, 'reload schema';
