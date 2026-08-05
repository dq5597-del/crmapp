-- ============================================================
-- 專案／施工模組 第一階段：主檔擴充
--   1. 專案代碼（自動編號 PRJ-YY-001）
--   2. 預估合約金額、材料預算、人工預算、外包預算
--   3. 四段狀態流程：草稿/報價中 → 施工中 → 完工驗收 → 結案
-- 可重複執行（idempotent）。在 Supabase SQL Editor 執行一次。
-- ============================================================

-- ── 1. 新欄位 ──────────────────────────────────────────────
alter table public.projects
  add column if not exists project_code     text,
  add column if not exists contract_amount  numeric(14,2),   -- 預估合約金額（含稅）
  add column if not exists budget_material  numeric(14,2),   -- 預估材料預算
  add column if not exists budget_labor     numeric(14,2),   -- 預估人工預算
  add column if not exists budget_outsource numeric(14,2),   -- 預估外包預算
  add column if not exists is_paused        boolean not null default false,  -- 暫停旗標（取代原「暫停」狀態）
  add column if not exists closed_at        date;            -- 結案日期

comment on column public.projects.contract_amount is '預估合約金額（含稅）';
comment on column public.projects.is_paused      is '暫停中：狀態維持原值，另以旗標標記';

-- ── 2. 專案代碼：自動編號 PRJ-YY-001 ────────────────────────
create or replace function public.next_project_code()
returns text language plpgsql as $$
declare
  yy     text := to_char(current_date, 'YY');
  prefix text := 'PRJ-' || yy || '-';
  seq    int;
begin
  select coalesce(max((regexp_replace(project_code, '^.*-', ''))::int), 0) + 1
    into seq
  from public.projects
  where project_code like prefix || '%';
  return prefix || lpad(seq::text, 3, '0');
end $$;

create or replace function public.set_project_code()
returns trigger language plpgsql as $$
begin
  if new.project_code is null or new.project_code = '' then
    new.project_code := public.next_project_code();
  end if;
  return new;
end $$;

drop trigger if exists trg_projects_code on public.projects;
create trigger trg_projects_code before insert on public.projects
  for each row execute function public.set_project_code();

-- 舊專案回填代碼（依建立時間排序）
with numbered as (
  select id,
         'PRJ-' || to_char(coalesce(created_at, now()), 'YY') || '-' ||
         lpad(row_number() over (
           partition by to_char(coalesce(created_at, now()), 'YY')
           order by created_at, id
         )::text, 3, '0') as code
  from public.projects
  where project_code is null or project_code = ''
)
update public.projects p
set project_code = n.code
from numbered n
where p.id = n.id;

create unique index if not exists uq_projects_code on public.projects(project_code);

-- ── 3. 狀態流程改為四段（新舊值並存，避免舊資料違反約束）────
alter table public.projects drop constraint if exists projects_status_check;

update public.projects set status = '草稿/報價中' where status in ('規劃中');
update public.projects set status = '施工中'      where status in ('進行中');
update public.projects set status = '完工驗收'    where status in ('完工');
update public.projects set is_paused = true       where status = '暫停';
update public.projects set status = '施工中'      where status = '暫停';

alter table public.projects
  add constraint projects_status_check
  check (status in ('草稿/報價中', '施工中', '完工驗收', '結案', '取消'));

alter table public.projects alter column status set default '草稿/報價中';

-- 結案時自動記錄結案日
create or replace function public.set_project_closed_at()
returns trigger language plpgsql as $$
begin
  if new.status = '結案' and (old.status is distinct from '結案') then
    new.closed_at := coalesce(new.closed_at, current_date);
  elsif new.status <> '結案' then
    new.closed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_projects_closed_at on public.projects;
create trigger trg_projects_closed_at before update on public.projects
  for each row execute function public.set_project_closed_at();

create index if not exists idx_projects_status_v2 on public.projects(status);

notify pgrst, 'reload schema';
