-- ============================================================
-- 銷貨單／訂購單「單據日期」2026-08
--   與報價單相同：列印優先使用 doc_date，沒有才退回 created_at。
--   單號仍由系統依建檔當天產生，可據此看出是否為補開。
-- 可重複執行（idempotent）
-- ============================================================

alter table public.sales_orders    add column if not exists doc_date date;
alter table public.purchase_orders add column if not exists doc_date date;

-- 既有單據以建檔日期回填，列印結果不會因為這次異動而改變
update public.sales_orders
   set doc_date = (created_at at time zone 'Asia/Taipei')::date
 where doc_date is null;

update public.purchase_orders
   set doc_date = (created_at at time zone 'Asia/Taipei')::date
 where doc_date is null;

notify pgrst, 'reload schema';

-- 驗收：兩個都應為 0
select
  (select count(*) from public.sales_orders    where doc_date is null) as 銷貨單尚未回填,
  (select count(*) from public.purchase_orders where doc_date is null) as 訂購單尚未回填;
