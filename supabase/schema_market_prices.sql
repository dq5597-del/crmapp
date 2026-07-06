-- ============================================================
-- 光輝 CRM — 市場行情快取（蝦皮 / PChome / momo）
-- 供產品管理頁顯示與未來批次調整 av-shop 網站售價使用
-- ============================================================

create table if not exists market_prices (
  id            uuid primary key default uuid_generate_v4(),
  product_id    uuid not null references products(id) on delete cascade,
  platform      text not null check (platform in ('shopee','pchome','momo')),
  min_price     numeric(12,2),
  mid_price     numeric(12,2),
  max_price     numeric(12,2),
  result_count  integer default 0,
  search_url    text,
  ok            boolean default true,     -- false = 該平台查詢失敗
  fetched_at    timestamptz default now(),
  unique (product_id, platform)
);

create index if not exists idx_market_prices_product on market_prices(product_id);

alter table market_prices enable row level security;
create policy "authenticated users can do all" on market_prices
  for all to authenticated using (true) with check (true);
