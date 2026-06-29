-- ============================================================
-- 光輝 CRM — 補充 Schema（廠商建檔 / 庫存管理 / 應收帳款）
-- 請在執行完 schema.sql 之後，再執行此檔案
-- ============================================================

-- ============================================================
-- A. 廠商建檔 (Vendors)
-- ============================================================
create table vendors (
  id              uuid primary key default uuid_generate_v4(),
  vendor_code     text unique,             -- 廠商代碼（可自訂，例 V001）
  company_name    text not null,
  contact_name    text,
  phone           text,
  fax             text,
  email           text,
  address         text,
  bank_name       text,
  bank_account    text,
  bank_account_name text,
  payment_terms   text,                    -- 付款條件（例：月結30天）
  tax_id          text,                    -- 統一編號
  category        text,                    -- 廠商類別（代理商/維修商/工程商）
  notes           text,
  is_active       boolean default true,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_vendors_name on vendors(company_name);
create index idx_vendors_active on vendors(is_active);

alter table vendors enable row level security;
create policy "authenticated users can do all" on vendors
  for all to authenticated using (true) with check (true);

create trigger t_vendors_updated before update on vendors
  for each row execute function set_updated_at();

-- 訂購單關聯廠商（新增 vendor_id 欄位，舊資料 vendor_name 保留）
alter table purchase_orders
  add column if not exists vendor_id uuid references vendors(id) on delete set null;

create index idx_purchase_orders_vendor_id on purchase_orders(vendor_id);

-- ============================================================
-- B. 庫存異動記錄 (Inventory Transactions)
-- ============================================================
create table inventory_transactions (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid not null references products(id) on delete cascade,
  type            text not null
                    check (type in ('入庫','出庫','盤盈','盤虧','退貨入庫','報廢')),
  quantity        numeric(10,2) not null,  -- 正數：增加庫存；負數：減少庫存
  quantity_before numeric(10,2) not null default 0,  -- 異動前庫存
  quantity_after  numeric(10,2) not null default 0,  -- 異動後庫存
  unit_cost       numeric(12,2),           -- 本次入庫單價（選填）
  reference_type  text,                    -- 關聯單據類型（sales_order / purchase_order / manual）
  reference_id    uuid,                    -- 關聯單據 ID
  reference_no    text,                    -- 關聯單據號碼（顯示用）
  vendor_id       uuid references vendors(id) on delete set null,  -- 入庫廠商
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now()
);

create index idx_inv_transactions_product on inventory_transactions(product_id);
create index idx_inv_transactions_type on inventory_transactions(type);
create index idx_inv_transactions_date on inventory_transactions(created_at desc);
create index idx_inv_transactions_ref on inventory_transactions(reference_type, reference_id);

alter table inventory_transactions enable row level security;
create policy "authenticated users can do all" on inventory_transactions
  for all to authenticated using (true) with check (true);

-- Trigger：每次新增庫存異動，自動更新 products.stock_qty
create or replace function update_product_stock()
returns trigger language plpgsql as $$
begin
  -- 取得異動前庫存
  select stock_qty into new.quantity_before from products where id = new.product_id;

  -- 計算異動後庫存
  new.quantity_after := new.quantity_before + new.quantity;

  -- 更新產品庫存
  update products set stock_qty = new.quantity_after, updated_at = now()
  where id = new.product_id;

  return new;
end;
$$;

create trigger t_inventory_update_stock
  before insert on inventory_transactions
  for each row execute function update_product_stock();

-- ============================================================
-- C. 應收帳款 (Receivables)
-- ============================================================
create table receivables (
  id              uuid primary key default uuid_generate_v4(),
  receivable_no   text unique not null,    -- AR-YYMMDD-001
  sales_order_id  uuid references sales_orders(id) on delete set null,
  client_id       uuid references clients(id) on delete set null,
  invoice_no      text,                    -- 發票號碼
  invoice_date    date,                    -- 開立日期
  due_date        date,                    -- 應收日期
  amount          numeric(14,2) not null default 0,  -- 應收金額
  received_amount numeric(14,2) not null default 0,  -- 已收金額
  balance         numeric(14,2) generated always as (amount - received_amount) stored,  -- 未收餘額
  status          text not null default '未收'
                    check (status in ('未收','部分收款','已收清','壞帳','已開立發票')),
  payment_method  text,                    -- 付款方式（現金/匯款/票期）
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_receivables_client on receivables(client_id);
create index idx_receivables_status on receivables(status);
create index idx_receivables_due on receivables(due_date);
create index idx_receivables_order on receivables(sales_order_id);

alter table receivables enable row level security;
create policy "authenticated users can do all" on receivables
  for all to authenticated using (true) with check (true);

create trigger t_receivables_updated before update on receivables
  for each row execute function set_updated_at();

-- ============================================================
-- D. 收款明細 (Payment Records)
-- ============================================================
create table payment_records (
  id              uuid primary key default uuid_generate_v4(),
  receivable_id   uuid not null references receivables(id) on delete cascade,
  payment_date    date not null default current_date,
  amount          numeric(14,2) not null,
  payment_method  text,                    -- 現金/匯款/票期/信用卡
  bank_ref        text,                    -- 匯款帳號末5碼 or 票據號碼
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now()
);

create index idx_payments_receivable on payment_records(receivable_id);

alter table payment_records enable row level security;
create policy "authenticated users can do all" on payment_records
  for all to authenticated using (true) with check (true);

-- Trigger：新增收款後自動更新應收帳款 received_amount 與 status
create or replace function update_receivable_on_payment()
returns trigger language plpgsql as $$
declare
  total_received numeric;
  total_amount   numeric;
  new_status     text;
begin
  -- 加總所有收款
  select coalesce(sum(amount), 0) into total_received
    from payment_records where receivable_id = new.receivable_id;

  select amount into total_amount from receivables where id = new.receivable_id;

  -- 決定狀態
  if total_received >= total_amount then
    new_status := '已收清';
  elsif total_received > 0 then
    new_status := '部分收款';
  else
    new_status := '未收';
  end if;

  update receivables
    set received_amount = total_received, status = new_status, updated_at = now()
    where id = new.receivable_id;

  return new;
end;
$$;

create trigger t_payment_update_receivable
  after insert or update or delete on payment_records
  for each row execute function update_receivable_on_payment();

-- ============================================================
-- END OF ADDITIONS
-- ============================================================
