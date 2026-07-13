-- ============================================================
-- 報價單品項顯示品牌：quote_items 新增 brand
-- 顯示格式：【品牌】產品名稱
-- 在 Supabase Dashboard → SQL Editor 執行此檔
-- ============================================================

alter table quote_items
  add column if not exists brand text;

-- 既有品項：能對到 products 的，回填品牌
update quote_items qi
set brand = p.brand
from products p
where qi.product_id = p.id
  and qi.brand is null
  and p.brand is not null;

-- 讓 PostgREST 立刻看到新欄位
notify pgrst, 'reload schema';
