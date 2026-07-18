-- 數值目標自動連動銷貨金額
alter table goals add column if not exists auto_source text default 'none'; -- 'none' | 'sales_orders'
alter table goals add column if not exists start_date date;                 -- 自動累計起算日
