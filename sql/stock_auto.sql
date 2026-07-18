-- 庫存自動連動 + 安全庫存
alter table sales_order_items add column if not exists product_id uuid references products(id) on delete set null;
alter table purchase_order_items add column if not exists product_id uuid references products(id) on delete set null;
alter table products add column if not exists safe_stock numeric default 0;
