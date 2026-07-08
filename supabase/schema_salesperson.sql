-- 業務員欄位：quotes / sales_orders / purchase_orders 各自標示承辦業務員
-- 業務員名單來源：user_profiles（系統登入帳號），只套用未來新建單據，既有資料不補值

alter table quotes add column if not exists salesperson_id uuid references user_profiles(id) on delete set null;
alter table sales_orders add column if not exists salesperson_id uuid references user_profiles(id) on delete set null;
alter table purchase_orders add column if not exists salesperson_id uuid references user_profiles(id) on delete set null;

create index if not exists idx_quotes_salesperson on quotes(salesperson_id);
create index if not exists idx_sales_orders_salesperson on sales_orders(salesperson_id);
create index if not exists idx_purchase_orders_salesperson on purchase_orders(salesperson_id);
