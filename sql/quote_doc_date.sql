-- ============================================================
-- 報價單「單據日期」2026-08
--   原本列印的日期直接取 created_at（實際建檔時間），無法調整。
--   新增 doc_date 讓使用者自行指定，列印優先使用它。
--   單號不受影響，仍由系統依建檔當天產生。
-- 可重複執行（idempotent）
-- ============================================================

alter table public.quotes add column if not exists doc_date date;

-- 既有報價單以建檔日期回填，列印結果不會因為這次異動而改變
update public.quotes
   set doc_date = (created_at at time zone 'Asia/Taipei')::date
 where doc_date is null;

notify pgrst, 'reload schema';

-- 驗收：應為 0 筆
select count(*) as 尚未回填 from public.quotes where doc_date is null;
