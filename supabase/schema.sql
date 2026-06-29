-- ============================================================
-- 光輝影音科技 CRM 系統 — Supabase PostgreSQL Schema
-- ============================================================
-- 執行順序：直接貼到 Supabase SQL Editor 執行

-- 啟用 UUID 擴充
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. 系統設定
-- ============================================================
create table system_settings (
  id              uuid primary key default uuid_generate_v4(),
  company_name    text not null default '光輝影音科技',
  company_phone   text,
  company_address text,
  company_email   text,
  bank_name       text,
  bank_account    text,
  bank_account_name text,
  payment_terms   text default '30天月結',
  delivery_days   integer default 14,
  valid_days      integer default 30,   -- 報價有效天數
  quote_notes     text,                 -- 報價單預設備註
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 插入預設系統設定
insert into system_settings (company_name) values ('光輝影音科技');

-- ============================================================
-- 2. 產品分類
-- ============================================================
create table product_categories (
  id            uuid primary key default uuid_generate_v4(),
  main_category text not null,
  mid_category  text,
  sub_category  text not null,
  sort_order    integer default 0,
  created_at    timestamptz default now()
);

create index idx_product_categories_main on product_categories(main_category);

-- ============================================================
-- 3. 產品主檔
-- ============================================================
create table products (
  id              uuid primary key default uuid_generate_v4(),
  category_id     uuid references product_categories(id) on delete set null,
  brand           text,
  product_name    text not null,
  model           text,
  unit            text default '台',
  list_price      numeric(12,2) default 0,
  cost_price      numeric(12,2) default 0,
  stock_qty       integer default 0,
  catalog_url     text,   -- Supabase Storage URL
  manual_url      text,   -- Supabase Storage URL
  is_active       boolean default true,
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_products_brand on products(brand);
create index idx_products_name on products(product_name);
create index idx_products_active on products(is_active);

-- ============================================================
-- 4. 客戶資料
-- ============================================================
create table clients (
  id                    uuid primary key default uuid_generate_v4(),
  company_name          text not null,
  contact_name          text,
  appearance            text,         -- 長相/特徵（業務助記）
  phone                 text,
  line_id               text,
  email                 text,
  address               text,
  birthday              date,
  interest              text,
  dm_provided           boolean default false,
  status                text not null default '有需求'
                          check (status in ('有需求','規劃中','服務未完成','已完成','暫緩')),
  service_cycle_months  integer,      -- 服務週期（月）
  last_service_date     date,
  next_visit_date       date,         -- 下次應回訪日期（可手動或自動計算）
  notes                 text,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index idx_clients_status on clients(status);
create index idx_clients_company on clients(company_name);
create index idx_clients_next_visit on clients(next_visit_date);

-- ============================================================
-- 5. 聯絡人
-- ============================================================
create table contacts (
  id            uuid primary key default uuid_generate_v4(),
  client_id     uuid not null references clients(id) on delete cascade,
  seq_no        integer,
  name          text not null,
  title         text,
  phone         text,
  email         text,
  appearance    text,
  provided_info text,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_contacts_client on contacts(client_id);

-- ============================================================
-- 6. 同業資訊
-- ============================================================
create table competitor_info (
  id                uuid primary key default uuid_generate_v4(),
  client_id         uuid references clients(id) on delete set null,  -- 誰提供的情報
  company_name      text not null,
  city              text,   -- 縣市鄉鎮
  service_status    text    check (service_status in ('正常使用','老舊待汰換','已故障','已停用') or service_status is null),
  equipment_age     integer,  -- 設備使用年限（年）
  equipment_issues  text,
  notes             text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index idx_competitor_client on competitor_info(client_id);

-- ============================================================
-- 7. 專案
-- ============================================================
create table projects (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid not null references clients(id) on delete cascade,
  project_name    text not null,
  status          text default '進行中'
                    check (status in ('規劃中','進行中','施工中','完工','暫停','取消')),
  start_date      date,
  end_date        date,
  budget          numeric(14,2),
  description     text,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_projects_client on projects(client_id);
create index idx_projects_status on projects(status);

-- ============================================================
-- 8. 拜訪紀錄
-- ============================================================
create table visit_records (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid not null references clients(id) on delete cascade,
  project_id      uuid references projects(id) on delete set null,
  visit_date      date not null default current_date,
  photos          text[],   -- Supabase Storage URLs array
  progress_memo   text,
  special_notes   text,
  next_action     text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_visits_client on visit_records(client_id);
create index idx_visits_date on visit_records(visit_date desc);

-- ============================================================
-- 9. 報價單
-- ============================================================
create table quotes (
  id              uuid primary key default uuid_generate_v4(),
  quote_no        text unique not null,   -- 格式：YYMMDD + 001
  client_id       uuid references clients(id) on delete set null,
  project_id      uuid references projects(id) on delete set null,
  project_name    text,       -- 案名（獨立輸入，可同步建立專案）
  contact_name    text,       -- 姓名（從客戶帶入）
  client_phone    text,       -- 電話（從客戶帶入，可修改）
  valid_until     date,
  delivery_days   integer,    -- 交貨工期（天）
  payment_terms   text,
  bank_account    text,
  subtotal        numeric(14,2) default 0,  -- 未稅小計
  tax_amount      numeric(14,2) default 0,  -- 稅額 5%
  total_amount    numeric(14,2) default 0,  -- 含稅總計
  notes           text,
  status          text default '草稿'
                    check (status in ('草稿','已確認','已轉銷貨單','已轉訂購單','作廢')),
  pdf_url         text,   -- 產生後的 PDF 儲存路徑
  source_quote_id uuid references quotes(id) on delete set null,  -- 從哪張報價單複製而來
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_quotes_client on quotes(client_id);
create index idx_quotes_status on quotes(status);
create index idx_quotes_created on quotes(created_at desc);
create index idx_quotes_no on quotes(quote_no);

-- ============================================================
-- 10. 報價單品項
-- ============================================================
create table quote_items (
  id              uuid primary key default uuid_generate_v4(),
  quote_id        uuid not null references quotes(id) on delete cascade,
  seq_no          integer not null default 1,
  product_id      uuid references products(id) on delete set null,
  product_name    text not null,
  model           text,
  unit            text default '台',
  quantity        numeric(10,2) not null default 1,
  unit_price      numeric(12,2) not null default 0,
  amount          numeric(14,2) generated always as (quantity * unit_price) stored,
  provide_catalog boolean default false,
  provide_manual  boolean default false,
  item_notes      text,
  created_at      timestamptz default now()
);

create index idx_quote_items_quote on quote_items(quote_id);
create index idx_quote_items_seq on quote_items(quote_id, seq_no);

-- ============================================================
-- 11. 銷貨單
-- ============================================================
create table sales_orders (
  id              uuid primary key default uuid_generate_v4(),
  order_no        text unique not null,   -- SO-YYMMDD-001
  quote_id        uuid references quotes(id) on delete set null,
  client_id       uuid references clients(id) on delete set null,
  project_id      uuid references projects(id) on delete set null,
  project_name    text,
  contact_name    text,
  client_phone    text,
  delivery_date   date,
  delivery_address text,
  payment_terms   text,
  bank_account    text,
  subtotal        numeric(14,2) default 0,
  tax_amount      numeric(14,2) default 0,
  total_amount    numeric(14,2) default 0,
  notes           text,
  status          text default '草稿'
                    check (status in ('草稿','已確認','出貨中','已完成','取消')),
  pdf_url         text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_sales_orders_client on sales_orders(client_id);
create index idx_sales_orders_status on sales_orders(status);

-- ============================================================
-- 12. 銷貨單品項
-- ============================================================
create table sales_order_items (
  id              uuid primary key default uuid_generate_v4(),
  order_id        uuid not null references sales_orders(id) on delete cascade,
  seq_no          integer not null default 1,
  product_id      uuid references products(id) on delete set null,
  product_name    text not null,
  model           text,
  unit            text default '台',
  quantity        numeric(10,2) not null default 1,
  unit_price      numeric(12,2) not null default 0,
  amount          numeric(14,2) generated always as (quantity * unit_price) stored,
  item_notes      text,
  created_at      timestamptz default now()
);

create index idx_sales_items_order on sales_order_items(order_id);

-- ============================================================
-- 13. 訂購單（向廠商採購）
-- ============================================================
create table purchase_orders (
  id              uuid primary key default uuid_generate_v4(),
  order_no        text unique not null,   -- PO-YYMMDD-001
  quote_id        uuid references quotes(id) on delete set null,
  vendor_name     text not null,
  vendor_contact  text,
  vendor_phone    text,
  delivery_date   date,
  delivery_address text,
  payment_terms   text,
  subtotal        numeric(14,2) default 0,
  tax_amount      numeric(14,2) default 0,
  total_amount    numeric(14,2) default 0,
  notes           text,
  status          text default '草稿'
                    check (status in ('草稿','已送出','已確認','已到貨','取消')),
  pdf_url         text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_purchase_orders_vendor on purchase_orders(vendor_name);
create index idx_purchase_orders_status on purchase_orders(status);

-- ============================================================
-- 14. 訂購單品項
-- ============================================================
create table purchase_order_items (
  id              uuid primary key default uuid_generate_v4(),
  order_id        uuid not null references purchase_orders(id) on delete cascade,
  seq_no          integer not null default 1,
  product_id      uuid references products(id) on delete set null,
  product_name    text not null,
  model           text,
  unit            text default '台',
  quantity        numeric(10,2) not null default 1,
  unit_price      numeric(12,2) not null default 0,
  amount          numeric(14,2) generated always as (quantity * unit_price) stored,
  item_notes      text,
  created_at      timestamptz default now()
);

create index idx_purchase_items_order on purchase_order_items(order_id);

-- ============================================================
-- 15. 使用者角色擴充表
-- ============================================================
create table user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text default 'user'
                check (role in ('admin','manager','user')),
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- TRIGGERS：updated_at 自動更新
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger t_system_settings_updated before update on system_settings
  for each row execute function set_updated_at();
create trigger t_products_updated before update on products
  for each row execute function set_updated_at();
create trigger t_clients_updated before update on clients
  for each row execute function set_updated_at();
create trigger t_contacts_updated before update on contacts
  for each row execute function set_updated_at();
create trigger t_competitor_updated before update on competitor_info
  for each row execute function set_updated_at();
create trigger t_projects_updated before update on projects
  for each row execute function set_updated_at();
create trigger t_visits_updated before update on visit_records
  for each row execute function set_updated_at();
create trigger t_quotes_updated before update on quotes
  for each row execute function set_updated_at();
create trigger t_sales_orders_updated before update on sales_orders
  for each row execute function set_updated_at();
create trigger t_purchase_orders_updated before update on purchase_orders
  for each row execute function set_updated_at();
create trigger t_user_profiles_updated before update on user_profiles
  for each row execute function set_updated_at();

-- 新使用者自動建立 profile
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into user_profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY（RLS）
-- ============================================================
alter table system_settings enable row level security;
alter table product_categories enable row level security;
alter table products enable row level security;
alter table clients enable row level security;
alter table contacts enable row level security;
alter table competitor_info enable row level security;
alter table projects enable row level security;
alter table visit_records enable row level security;
alter table quotes enable row level security;
alter table quote_items enable row level security;
alter table sales_orders enable row level security;
alter table sales_order_items enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_items enable row level security;
alter table user_profiles enable row level security;

-- 所有已登入使用者可讀寫（之後可依 role 細分）
create policy "authenticated users can do all" on system_settings
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on product_categories
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on products
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on clients
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on contacts
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on competitor_info
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on projects
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on visit_records
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on quotes
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on quote_items
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on sales_orders
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on sales_order_items
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on purchase_orders
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on purchase_order_items
  for all to authenticated using (true) with check (true);

-- user_profiles：只能看自己，admin 可看全部
create policy "users can view own profile" on user_profiles
  for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from user_profiles where id = auth.uid() and role = 'admin'
  ));
create policy "users can update own profile" on user_profiles
  for update to authenticated using (id = auth.uid());
create policy "admin can manage all profiles" on user_profiles
  for all to authenticated
  using (exists (select 1 from user_profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
-- STORAGE BUCKETS（需在 Supabase Dashboard → Storage 手動建立）
-- ============================================================
-- 建立以下 buckets（全部設為 private）：
--   1. product-files    → 型錄、說明書
--   2. visit-photos     → 拜訪現場照片
--   3. quote-pdfs       → 報價單 PDF

-- ============================================================
-- END OF SCHEMA
-- ============================================================
