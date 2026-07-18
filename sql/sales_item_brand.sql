-- 銷貨單品項加品牌欄（比照報價單）
alter table sales_order_items add column if not exists brand text;
