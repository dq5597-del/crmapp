-- ============================================================
-- 修改：實際開工／完工日 改用工項自己的「起迄日」(planned_start/planned_end)
--       不再用「今天」current_date
-- 可重複執行（idempotent）
-- ============================================================

create or replace function public.touch_project_task()
returns trigger language plpgsql as $$
begin
  -- 進度 0→有值時：實際開工日改用「預定起」，若未填預定起才退回今天
  if new.progress_pct > 0 and new.actual_start is null then
    new.actual_start := coalesce(new.planned_start, current_date);
  end if;

  -- 達 100%：完工日改用「預定迄」（沒有的話用預定起，都沒有才用今天）
  if new.progress_pct >= 100 and new.actual_end is null then
    new.actual_end := coalesce(new.planned_end, new.planned_start, current_date);
  elsif new.progress_pct < 100 then
    new.actual_end := null;
  end if;

  new.updated_at := now();
  return new;
end $$;

-- trigger 本身不用重建（function 已用 or replace 更新），但保險起見重掛一次
drop trigger if exists trg_project_tasks_touch on public.project_tasks;
create trigger trg_project_tasks_touch before insert or update on public.project_tasks
  for each row execute function public.touch_project_task();

-- ── 回填既有資料 ────────────────────────────────────────────
-- 已存在、進度>0 的工項，把實際開工／完工日重新對齊成該工項自己的起迄日
update public.project_tasks
set actual_start = coalesce(planned_start, actual_start)
where progress_pct > 0;

update public.project_tasks
set actual_end = coalesce(planned_end, planned_start, actual_end)
where progress_pct >= 100;

notify pgrst, 'reload schema';

