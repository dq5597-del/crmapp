-- ============================================================
-- 專案照片 project_photos
-- 在 Supabase Dashboard → SQL Editor 執行此檔
-- ============================================================

-- 1. 建立照片記錄表
create table if not exists project_photos (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid not null references projects(id) on delete cascade,
  category      smallint not null default 1 check (category in (1, 2, 3)),
  -- 1=施工前  2=施工中  3=完工
  storage_path  text not null,   -- Supabase Storage 路徑
  notes         text default '',
  created_at    timestamptz default now()
);

create index if not exists idx_project_photos_project
  on project_photos(project_id);

alter table project_photos enable row level security;

create policy "auth users all on project_photos"
  on project_photos for all
  to authenticated
  using (true) with check (true);

-- 2. 建立 Storage bucket（public = 直接顯示圖片網址，不需簽名）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-photos',
  'project-photos',
  true,
  10485760,  -- 10 MB per file
  array['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do nothing;

-- 3. Storage RLS 政策
create policy "auth upload project-photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'project-photos');

create policy "auth read project-photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'project-photos');

create policy "auth delete project-photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'project-photos');

-- 也允許公開讀取（因為 bucket 是 public）
create policy "public read project-photos"
  on storage.objects for select
  to anon
  using (bucket_id = 'project-photos');
