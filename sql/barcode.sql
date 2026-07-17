-- 產品條碼欄位（EAN-13 / UPC 等一般國際條碼）
-- 於 Supabase SQL Editor 執行一次即可
alter table products add column if not exists barcode text;
create index if not exists idx_products_barcode on products(barcode);
