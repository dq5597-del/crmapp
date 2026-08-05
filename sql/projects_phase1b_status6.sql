-- ============================================================
-- 專案狀態調整為六值：暫停改回獨立狀態，移除 is_paused 旗標
--   草稿/報價中 → 施工中 → 完工驗收 → 結案
--   暫停 / 取消 可從任一階段進入
-- 前置：已執行 sql/projects_phase1.sql
-- 可重複執行（idempotent）
-- ============================================================

-- 1. 先放寬約束，才能寫入「暫停」
alter table public.projects drop constraint if exists projects_status_check;

-- 2. 原本被轉成旗標的暫停案，狀態改回「暫停」
update public.projects
set status = '暫停'
where is_paused is true;

-- 3. 套用六值約束
alter table public.projects
  add constraint projects_status_check
  check (status in ('草稿/報價中', '施工中', '完工驗收', '結案', '暫停', '取消'));

-- 4. 移除不再使用的旗標欄位
alter table public.projects drop column if exists is_paused;

notify pgrst, 'reload schema';
