-- ============================================================
-- 光輝 CRM — 修復「產品編輯儲存失敗（400 PGRST204）」
-- 2026-07-25
--
-- 根本原因（已用瀏覽器實測確認）：
--   前端儲存產品時，payload 包含 web_tab 等欄位，
--   但正式 Supabase 的 products 表缺少該欄位，
--   PostgREST 回傳 400：
--   "Could not find the 'web_tab' column of 'products' in the schema cache"
--   → 整筆 UPDATE 失敗，產品分類等所有修改都存不進去。
--
-- 執行方式：Supabase Dashboard → SQL Editor → 貼上全部 → Run
-- 全部使用 if not exists，重複執行安全（冪等）。
-- ============================================================

-- 1. 補齊 products 表所有前端表單會送出的欄位
alter table products
  add column if not exists barcode              text,
  add column if not exists safe_stock           integer     default 0,
  add column if not exists width_cm             numeric(8,1) default 0,
  add column if not exists depth_cm             numeric(8,1) default 0,
  add column if not exists height_cm            numeric(8,1) default 0,
  add column if not exists web_sku              text,
  add column if not exists web_category         text,
  add column if not exists web_categories       text[] not null default '{}',
  add column if not exists web_description      text,
  add column if not exists web_main_image_url   text,
  add column if not exists web_sale_price       numeric(12,2),
  add column if not exists web_allow_backorder  boolean     default false,
  add column if not exists web_bsmi_no          text,
  add column if not exists web_ncc_no           text,
  add column if not exists web_publish          boolean     default false,
  add column if not exists web_product_id       text,
  add column if not exists web_product_url      text,
  add column if not exists web_promo_price      numeric(12,2),
  add column if not exists web_promo_price_from timestamptz,
  add column if not exists web_promo_price_to   timestamptz,
  add column if not exists web_tab              text        default 'none',
  add column if not exists web_spec_html        text,
  add column if not exists web_synced_at        timestamptz,
  add column if not exists web_sync_status      text;

-- 2. 順帶修復：market_prices 表不存在（產品頁批次查行情 404）
create table if not exists market_prices (
  id            uuid primary key default uuid_generate_v4(),
  product_id    uuid not null references products(id) on delete cascade,
  platform      text not null check (platform in ('shopee','pchome','momo')),
  min_price     numeric(12,2),
  mid_price     numeric(12,2),
  max_price     numeric(12,2),
  result_count  integer default 0,
  search_url    text,
  ok            boolean default true,
  fetched_at    timestamptz default now(),
  unique (product_id, platform)
);

create index if not exists idx_market_prices_product on market_prices(product_id);

alter table market_prices enable row level security;

do $$ begin
  create policy "authenticated users can do all" on market_prices
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- 3. 讓 PostgREST 立即重載 schema cache（否則要等它自動刷新）
notify pgrst, 'reload schema';
