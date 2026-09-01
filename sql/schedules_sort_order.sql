-- ============================================================
-- 每日行程表：空檔任務手動排序（上下拖拉）
-- 在 Supabase → SQL Editor 貼上執行一次即可。
-- 執行後「空檔任務」清單才會記住你拖曳後的順序。
-- ============================================================

-- 1. 新增排序欄位（已存在則不動作）
alter table public.schedules
  add column if not exists sort_order int not null default 0;

-- 2. 依現有順序回填初始值（有期限的排前面，其次照建立日期）
with ranked as (
  select id,
         (row_number() over (
            order by gap_due_date nulls last, schedule_date, id
         )) * 10 as new_order
  from public.schedules
  where is_gap_task = true
)
update public.schedules s
   set sort_order = ranked.new_order
  from ranked
 where s.id = ranked.id
   and s.sort_order = 0;

-- 3. 索引（清單以 sort_order 排序）
create index if not exists schedules_sort_order_idx
  on public.schedules(sort_order);
