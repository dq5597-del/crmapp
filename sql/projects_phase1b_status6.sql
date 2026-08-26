-- ============================================================
-- 專案狀態調整為六值：暫停改回獨立狀態，移除 is_paused 旗標
--   草稿/報價中 → 施工中 → 完工驗收 → 結案
--   暫停 / 取消 可從任一階段進入
-- 修正版：原本第 2 步假設一定有 is_paused 欄位，但這個資料庫目前沒有
-- 這個欄位（可能從沒建立過，或先前已被移除），導致直接執行會報錯。
-- 這版改成先檢查欄位是否存在，存在才搬資料，不存在就跳過，可放心重複執行。
-- ============================================================

-- 1. 先放寬約束，才能寫入「暫停」
alter table public.projects drop constraint if exists projects_status_check;

-- 2. 若還有舊的 is_paused 旗標欄位，把被標記暫停的案子狀態改回「暫停」；
--    沒有這個欄位（本資料庫目前的狀況）就直接跳過
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'is_paused'
  ) then
    update public.projects set status = '暫停' where is_paused is true;
  end if;
end $$;

-- 3. 套用六值約束
alter table public.projects
  add constraint projects_status_check
  check (status in ('草稿/報價中', '施工中', '完工驗收', '結案', '暫停', '取消'));

-- 4. 移除不再使用的旗標欄位（若存在）
alter table public.projects drop column if exists is_paused;

notify pgrst, 'reload schema';
