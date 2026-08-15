-- 銷貨單開立時記錄二聯式／三聯式發票種類。
alter table public.sales_orders
  add column if not exists invoice_type text;

alter table public.sales_orders
  drop constraint if exists sales_orders_invoice_type_check;

alter table public.sales_orders
  add constraint sales_orders_invoice_type_check
  check (invoice_type is null or invoice_type in ('二聯式', '三聯式'));

comment on column public.sales_orders.invoice_type is
  '銷貨單預計開立的發票種類：二聯式或三聯式；舊資料可為 null';
