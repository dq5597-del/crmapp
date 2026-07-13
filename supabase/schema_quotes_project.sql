-- ============================================================
-- 報價單綁定專案：quotes 新增 project_id
-- 在 Supabase Dashboard → SQL Editor 執行此檔
-- ============================================================

alter table quotes
  add column if not exists project_id uuid references projects(id) on delete set null;

create index if not exists idx_quotes_project on quotes(project_id);

-- 讓 PostgREST 立刻看到新欄位
notify pgrst, 'reload schema';
