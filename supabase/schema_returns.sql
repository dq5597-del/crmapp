-- ============================================================
-- 光輝 CRM — 退貨管理 Schema
-- 請在執行完 schema_payables.sql 之後，再執行此檔案
-- ============================================================

-- ============================================================
-- G. 退貨單 (Returns)
-- ============================================================
create table returns (
  id                uuid primary key default uuid_generate_v4(),
  return_no         text unique not null,        -- CR-YYMMDD-001（客戶退貨）/ SR-YYMMDD-001（供應商退貨）
  return_type       text not null
                      check (return_type in ('客戶退貨','供應商退貨')),
  ref_doc_type      text
                      check (ref_doc_type in ('sales_order','purchase_order') or ref_doc_type is null),
  ref_doc_id        uuid,                        -- 關聯銷貨單/訂購單 id（跨表，不設外鍵）
  ref_doc_no        text,                        -- 關聯單號（顯示用）
  client_id         uuid references clients(id) on delete set null,  -- 客戶退貨才會有
  vendor_id         uuid references vendors(id) on delete set null,  -- 供應商退貨才會有
  return_date       date not null default current_date,
  return_reason     text,                        -- 瑕疵 / 規格不符 / 多叫貨 / 客訴 / 到期報廢 / 其他
  item_condition    text default '良品'
                      check (item_condition in ('良品','瑕疵品')),
  settlement_method text default '沖抵帳款'
                      check (settlement_method in ('沖抵帳款','退款','換貨')),
  status            text not null default '待審核'
                      check (status in ('待審核','已入庫','已結算','作廢')),
  subtotal          numeric(14,2) default 0,
  tax_amount        numeric(14,2) default 0,
  total_amount      numeric(14,2) default 0,
  notes             text,
  settled_at        timestamptz,                 -- 結算時間
  settled_ref_type  text,                        -- 沖抵寫入哪個表：payment_record / payable_payment
  settled_ref_id    uuid,                         -- 沖抵寫入的紀錄 id
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index idx_returns_type   on returns(return_type);
create index idx_returns_status on returns(status);
create index idx_returns_client on returns(client_id);
create index idx_returns_vendor on returns(vendor_id);
create index idx_returns_ref    on returns(ref_doc_type, ref_doc_id);
create index idx_returns_no     on returns(return_no);

alter table returns enable row level security;
create policy "authenticated users can do all" on returns
  for all to authenticated using (true) with check (true);

create trigger t_returns_updated before update on returns
  for each row execute function set_updated_at();

-- ============================================================
-- H. 退貨品項 (Return Items)
-- ============================================================
create table return_items (
  id              uuid primary key default uuid_generate_v4(),
  return_id       uuid not null references returns(id) on delete cascade,
  seq_no          integer not null default 1,
  product_id      uuid references products(id) on delete set null,
  product_name    text not null,
  model           text,
  unit            text default '台',
  quantity        numeric(10,2) not null default 1,
  unit_price      numeric(12,2) not null default 0,
  amount          numeric(14,2) generated always as (quantity * unit_price) stored,
  item_condition  text default '良品'
                    check (item_condition in ('良品','瑕疵品')),
  reason          text,
  notes           text,
  created_at      timestamptz default now()
);

create index idx_return_items_return on return_items(return_id);

alter table return_items enable row level security;
create policy "authenticated users can do all" on return_items
  for all to authenticated using (true) with check (true);

-- ============================================================
-- I. 擴充庫存異動類型：加入「供應商退貨出庫」
-- ============================================================
alter table inventory_transactions drop constraint if exists inventory_transactions_type_check;
alter table inventory_transactions add constraint inventory_transactions_type_check
  check (type in ('入庫','出庫','盤盈','盤虧','退貨入庫','供應商退貨出庫','報廢'));

-- ============================================================
-- END OF RETURNS SCHEMA
-- ============================================================
