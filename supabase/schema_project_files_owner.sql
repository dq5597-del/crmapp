-- ============================================================
-- 業主提供的檔案：project_files 新增 category 欄位
-- 'client' = 客戶提供的檔案（既有資料預設值）
-- 'owner'  = 業主提供的檔案（新區塊）
-- 在 Supabase Dashboard → SQL Editor 執行此檔
-- ============================================================

alter table project_files
  add column if not exists category text not null default 'client';

-- 既有資料補值（保險，理論上 default 已處理）
update project_files set category = 'client' where category is null;

create index if not exists idx_project_files_project_category
  on project_files(project_id, category);

-- 讓 PostgREST 立刻看到新欄位
notify pgrst, 'reload schema';
