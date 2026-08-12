-- 產品的官網分類與進銷存分類分開儲存，並允許一個產品套用多個官網分類。
alter table public.products
  add column if not exists web_categories text[] not null default '{}';

-- 將既有單一官網分類搬入陣列，保留 web_category 供舊版程式相容。
update public.products
set web_categories = array[trim(web_category)]
where coalesce(array_length(web_categories, 1), 0) = 0
  and nullif(trim(web_category), '') is not null;

comment on column public.products.web_categories is
  '官網商品分類（可多選），與進銷存 product_categories/category_id 完全分開';
