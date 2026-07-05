-- ============================================================
-- 光輝 CRM — 廠商詢價單 (RFQ) Schema
-- 請在執行完 schema.sql / schema_additions.sql 之後執行
-- 執行方式: Supabase Dashboard > SQL Editor > 貼上執行
-- ============================================================

-- ============================================================
-- A. 廠商銷售類別（存 product_categories.main_category 值）
-- ============================================================
alter table vendors
  add column if not exists sales_categories text[];

-- ============================================================
-- B. 詢價單主檔 (Inquiries)
-- ============================================================
create table if not exists inquiries (
  id              uuid primary key default uuid_generate_v4(),
  inquiry_no      text unique not null,              -- RFQ-YYMMDD-001
  vendor_id       uuid references vendors(id) on delete set null,
  vendor_name     text,                              -- snapshot（公開填價頁顯示用）
  contact_name    text,                              -- auto-fill 自 vendors，可手改
  phone           text,
  email           text,
  inquiry_date    date default current_date,
  reply_deadline  date,
  status          text not null default '草稿'
                    check (status in ('草稿','已送出','已回覆','已結案')),
  fill_token      uuid unique default uuid_generate_v4(),  -- 公開填價連結 token
  token_locked    boolean default false,             -- 廠商送出後鎖定
  replied_at      timestamptz,                       -- 廠商回覆時間
  reply_source    text,                              -- link / manual / ai
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_inquiries_vendor on inquiries(vendor_id);
create index if not exists idx_inquiries_status on inquiries(status);
create index if not exists idx_inquiries_token on inquiries(fill_token);
create index if not exists idx_inquiries_date on inquiries(inquiry_date desc);

-- ============================================================
-- C. 詢價品項 (Inquiry Items)
-- ============================================================
create table if not exists inquiry_items (
  id              uuid primary key default uuid_generate_v4(),
  inquiry_id      uuid not null references inquiries(id) on delete cascade,
  product_id      uuid references products(id) on delete set null,
  product_name    text not null,                     -- snapshot
  model           text,                              -- snapshot
  unit            text default '台',
  quantity        numeric(10,2) default 1,
  current_cost    numeric(12,2) default 0,           -- 詢價當下成本 snapshot（公開頁不顯示）
  vendor_price    numeric(12,2),                     -- 廠商回覆單價
  lead_time_days  integer,                           -- 廠商回覆交期（天）
  item_notes      text,
  cost_synced     boolean default false,             -- 已回寫 products.cost_price
  sort_order      integer default 0,
  created_at      timestamptz default now()
);

create index if not exists idx_inquiry_items_inquiry on inquiry_items(inquiry_id);
create index if not exists idx_inquiry_items_product on inquiry_items(product_id);

-- ============================================================
-- D. RLS
-- ============================================================
alter table inquiries enable row level security;
alter table inquiry_items enable row level security;

create policy "authenticated users can do all" on inquiries
  for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on inquiry_items
  for all to authenticated using (true) with check (true);

-- 公開填價頁：允許匿名透過 token 查詢/回填
-- （實際限制由 API route 以 fill_token + token_locked 篩選，不暴露全表）
create policy "public can view by token" on inquiries
  for select to anon using (true);
create policy "public can reply by token" on inquiries
  for update to anon using (true) with check (true);
create policy "public can view items by token" on inquiry_items
  for select to anon using (true);
create policy "public can fill items by token" on inquiry_items
  for update to anon using (true) with check (true);

-- ============================================================
-- E. updated_at trigger
-- ============================================================
create trigger t_inquiries_updated before update on inquiries
  for each row execute function set_updated_at();
