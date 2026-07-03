-- SOP／教材庫
-- 用途：內部知識工作者共用的標準作業程序與教材庫（Peter Drucker「知識工作者管理」）。
-- 執行方式：到 Supabase Dashboard → SQL Editor 貼上執行一次即可。

create table if not exists knowledge_base (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  content text,
  file_url text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_base_category on knowledge_base (category);

alter table knowledge_base enable row level security;

drop policy if exists "authenticated users can do all" on knowledge_base;
create policy "authenticated users can do all" on knowledge_base
  for all to authenticated using (true) with check (true);
