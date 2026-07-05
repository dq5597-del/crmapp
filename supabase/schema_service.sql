-- ============================================================
-- 叫修管理模組 Schema
-- 執行前確認 schema.sql 與 schema_additions.sql 已執行完畢
-- ============================================================

-- ============================================================
-- 1. 叫修單（主表）
-- ============================================================
create table service_requests (
  id                uuid primary key default uuid_generate_v4(),
  service_no        text unique not null,       -- SVC-YYMMDD-001
  track_token       uuid unique default uuid_generate_v4(), -- 公開追蹤用

  -- 客戶資訊
  client_id         uuid references clients(id) on delete set null,
  contact_name      text,
  phone             text,

  -- 設備資訊
  equipment_name    text not null,
  equipment_model   text,
  serial_no         text,
  issue_description text,

  -- 保固
  warranty_status   text not null default '非保固'
                      check (warranty_status in ('保固內','保固外','非保固')),
  warranty_expiry   date,

  -- 維修方式
  service_type      text not null default '到府維修'
                      check (service_type in ('到府維修','送廠維修')),
  assigned_to       text,

  -- 狀態
  status            text not null default '待處理'
                      check (status in ('待處理','處理中','報價中','等待客戶確認','維修中','已完成','收費中','已結案')),
  reported_date     date not null default current_date,

  -- 結案資訊
  closed_date       date,
  actual_repair_cost numeric(12,2),
  payment_confirmed boolean default false,
  pickup_confirmed  boolean default false,
  close_notes       text,
  is_closed         boolean default false,

  notes             text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index idx_service_requests_client on service_requests(client_id);
create index idx_service_requests_status on service_requests(status);
create index idx_service_requests_no on service_requests(service_no);
create index idx_service_requests_token on service_requests(track_token);
create index idx_service_requests_created on service_requests(created_at desc);

-- ============================================================
-- 2. 送廠維修子流程
-- ============================================================
create table service_vendor_repairs (
  id                      uuid primary key default uuid_generate_v4(),
  service_request_id      uuid not null references service_requests(id) on delete cascade,
  vendor_id               uuid references vendors(id) on delete set null,

  -- 廠商維修部資訊（auto-fill 後可手改）
  repair_contact          text,
  repair_phone            text,
  repair_email            text,
  repair_address          text,

  -- 客戶資訊（送廠時帶入，供廠商參考）
  client_name             text,
  client_contact          text,
  client_phone            text,
  client_email            text,
  equipment_serial_no     text,
  condition_note          text,   -- 送修外觀說明

  -- 廠商回報
  vendor_repair_no        text,   -- 廠商維修單號
  vendor_diagnosis        text,   -- 廠商診斷說明
  vendor_quote_amount     numeric(12,2),  -- 廠商報價金額
  estimated_done_date     date,
  returned_date           date,

  sent_date               date,
  notes                   text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

create index idx_svc_vendor_repairs_request on service_vendor_repairs(service_request_id);

-- ============================================================
-- 3. 維修報價單
-- ============================================================
create table service_repair_quotes (
  id                    uuid primary key default uuid_generate_v4(),
  service_request_id    uuid not null references service_requests(id) on delete cascade,
  repair_quote_no       text unique not null,   -- SVQYYMMDD001

  -- 客戶資訊
  client_id             uuid references clients(id) on delete set null,
  contact_name          text,
  client_phone          text,

  -- 設備
  equipment_name        text,
  equipment_model       text,
  serial_no             text,

  -- 金額
  subtotal              numeric(14,2) default 0,
  tax_amount            numeric(14,2) default 0,
  total_amount          numeric(14,2) default 0,

  diagnosis_note        text,   -- 廠商診斷描述
  estimated_days        integer,
  notes                 text,

  -- 客戶回覆
  customer_decision     text check (customer_decision in ('確認維修','放棄維修') or customer_decision is null),
  decision_date         date,

  pdf_url               text,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index idx_svc_repair_quotes_request on service_repair_quotes(service_request_id);
create index idx_svc_repair_quotes_no on service_repair_quotes(repair_quote_no);

-- ============================================================
-- 4. 維修報價單品項
-- ============================================================
create table service_repair_quote_items (
  id              uuid primary key default uuid_generate_v4(),
  repair_quote_id uuid not null references service_repair_quotes(id) on delete cascade,
  seq_no          integer not null default 1,
  description     text not null,   -- 維修項目描述
  unit            text default '項',
  quantity        numeric(10,2) not null default 1,
  unit_price      numeric(12,2) not null default 0,
  amount          numeric(14,2) generated always as (quantity * unit_price) stored,
  notes           text,
  created_at      timestamptz default now()
);

create index idx_svc_repair_items_quote on service_repair_quote_items(repair_quote_id);

-- ============================================================
-- 5. 檢測費 / 運費（客戶不修時收取）
-- ============================================================
create table service_fees (
  id                    uuid primary key default uuid_generate_v4(),
  service_request_id    uuid not null references service_requests(id) on delete cascade,
  inspection_fee        numeric(12,2) default 0,
  shipping_fee          numeric(12,2) default 0,
  total_fee             numeric(12,2) generated always as (inspection_fee + shipping_fee) stored,
  invoice_no            text,
  receivable_id         uuid,   -- 連結到應收帳款（建立後填入）
  quote_id              uuid,   -- 連結到報價單（建立後填入）
  notes                 text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index idx_svc_fees_request on service_fees(service_request_id);

-- 若資料表已存在（舊版本未包含 quote_id），補上此欄位
alter table service_fees add column if not exists quote_id uuid;

-- ============================================================
-- TRIGGERS
-- ============================================================
create trigger t_service_requests_updated before update on service_requests
  for each row execute function set_updated_at();
create trigger t_svc_vendor_repairs_updated before update on service_vendor_repairs
  for each row execute function set_updated_at();
create trigger t_svc_repair_quotes_updated before update on service_repair_quotes
  for each row execute function set_updated_at();
create trigger t_svc_fees_updated before update on service_fees
  for each row execute function set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table service_requests enable row level security;
alter table service_vendor_repairs enable row level security;
alter table service_repair_quotes enable row level security;
alter table service_repair_quote_items enable row level security;
alter table service_fees enable row level security;

create policy "authenticated users can do all" on service_requests
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on service_vendor_repairs
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on service_repair_quotes
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on service_repair_quote_items
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on service_fees
  for all to authenticated using (true) with check (true);

-- 公開追蹤頁：允許匿名透過 token 查詢叫修單
create policy "public can view by token" on service_requests
  for select to anon
  using (true);  -- 實際限制由 API route 以 token 篩選，不暴露全表

-- ============================================================
-- Storage bucket（需在 Supabase Dashboard 手動建立）
-- ============================================================
-- bucket: card-images   → 名片照片（private）
-- bucket: repair-docs   → 送修單 PDF、維修報價單 PDF（private）

-- ============================================================
-- Vendors 補充欄位 migration（若尚未執行）
-- ============================================================
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS payment_day SMALLINT,
  ADD COLUMN IF NOT EXISTS repair_contact TEXT,
  ADD COLUMN IF NOT EXISTS repair_phone TEXT,
  ADD COLUMN IF NOT EXISTS repair_email TEXT,
  ADD COLUMN IF NOT EXISTS repair_address TEXT,
  ADD COLUMN IF NOT EXISTS brand_names TEXT[];

-- Contacts 補充欄位
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS line_id TEXT;
