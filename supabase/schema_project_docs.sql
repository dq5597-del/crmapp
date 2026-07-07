-- ============================================================
-- 專案文件 PDF ＋ 三方簽名 ＋ 照片分類修復
-- 在 Supabase Dashboard → SQL Editor 執行此檔（一次全部執行）
-- ============================================================

-- 1. 修復照片分類約束：原本只允許 1-3（施工前/中/完工），
--    放寬到 1-13（空間/電力/環境/施工照片、控制台/機櫃/現場設備的舊有與新設）
alter table project_photos drop constraint if exists project_photos_category_check;
alter table project_photos add constraint project_photos_category_check
  check (category between 1 and 13);

-- 2. 文件簽名表（場勘報告 / 驗收單 / 報價單 共用）
create table if not exists document_signatures (
  id             uuid primary key default uuid_generate_v4(),
  doc_type       text not null check (doc_type in ('survey', 'acceptance', 'diagram', 'quote')),
  ref_id         uuid not null,          -- project_id 或 quote_id
  role           text not null check (role in ('customer', 'engineer', 'sales')),
  signer_name    text default '',
  signature_data text not null,          -- PNG data URL（觸控簽名圖）
  signed_at      timestamptz default now(),
  unique (doc_type, ref_id, role)
);

create index if not exists idx_document_signatures_ref
  on document_signatures(doc_type, ref_id);

alter table document_signatures enable row level security;

drop policy if exists "auth users all on document_signatures" on document_signatures;
create policy "auth users all on document_signatures"
  on document_signatures for all
  to authenticated
  using (true) with check (true);
