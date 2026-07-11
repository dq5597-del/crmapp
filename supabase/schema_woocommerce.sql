-- ============================================================
-- 官網（av-shop.com / WooCommerce）商品同步
-- 執行位置：Supabase Dashboard → SQL Editor
-- ============================================================

alter table public.products
  add column if not exists web_synced_at   timestamptz,   -- 最後一次推送成功時間
  add column if not exists web_sync_status text;          -- 官網上的狀態：draft / publish

-- web_product_id / web_product_url 若尚未存在也補上（相容舊版）
alter table public.products
  add column if not exists web_product_id  text,
  add column if not exists web_product_url text;

create index if not exists idx_products_web_id on public.products(web_product_id);

notify pgrst, 'reload schema';
