-- ============================================================
-- 客戶提供的檔案 project_files（掛在專案底下，任意檔案類型）
-- 在 Supabase Dashboard → SQL Editor 執行此檔
-- ============================================================

-- 1. 建立檔案記錄表
create table if not exists project_files (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid not null references projects(id) on delete cascade,
  file_name     text not null,
  storage_path  text not null,
  file_size     bigint,
  mime_type     text,
  notes         text default '',
  created_at    timestamptz default now()
);

create index if not exists idx_project_files_project
  on project_files(project_id);

alter table project_files enable row level security;

create policy "auth users all on project_files"
  on project_files for all
  to authenticated
  using (true) with check (true);

-- 2. 建立 Storage bucket（public = 直接顯示/下載檔案網址，不需簽名）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  true,
  52428800,  -- 50 MB per file
  null       -- 不限制檔案類型
)
on conflict (id) do nothing;

-- 3. Storage RLS 政策
create policy "auth upload project-files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'project-files');

create policy "auth read project-files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'project-files');

create policy "auth delete project-files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'project-files');

-- 也允許公開讀取（因為 bucket 是 public，方便分享連結）
create policy "public read project-files"
  on storage.objects for select
  to anon
  using (bucket_id = 'project-files');
