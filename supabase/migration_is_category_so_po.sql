-- 2026-07-21 銷貨單/訂購單品項支援「分類標題列」
-- 在 Supabase 後台 → SQL Editor 貼上執行（可重複執行，不會出錯）

alter table sales_order_items
  add column if not exists is_category boolean not null default false;

alter table purchase_order_items
  add column if not exists is_category boolean not null default false;

-- 2026-07-21 訂購單品項加品牌欄位
alter table purchase_order_items
  add column if not exists brand text;
