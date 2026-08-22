-- CRM 商品變體：每個可販售型號仍是一筆 products，透過系列代碼聚合成 WooCommerce variable product。
alter table public.products
  add column if not exists variant_group_code text,
  add column if not exists variant_attribute_name text not null default '顏色',
  add column if not exists variant_value text,
  add column if not exists variant_is_primary boolean not null default false,
  add column if not exists web_variation_id text;

comment on column public.products.variant_group_code is '同系列商品共用代碼；有值時同步為同一個 WooCommerce variable product';
comment on column public.products.variant_attribute_name is 'WooCommerce 變體屬性名稱，例如顏色';
comment on column public.products.variant_value is '此 SKU 的變體選項，例如黑色';
comment on column public.products.variant_is_primary is '系列主商品；父商品名稱、介紹、分類與共用圖文以此列為準';
comment on column public.products.web_variation_id is 'WooCommerce variation ID；web_product_id 保存父商品 ID';

create index if not exists idx_products_variant_group_code
  on public.products (variant_group_code)
  where variant_group_code is not null and btrim(variant_group_code) <> '';

create unique index if not exists uq_products_variant_group_value
  on public.products (lower(btrim(variant_group_code)), lower(btrim(variant_value)))
  where variant_group_code is not null and btrim(variant_group_code) <> ''
    and variant_value is not null and btrim(variant_value) <> '';

create unique index if not exists uq_products_variant_group_primary
  on public.products (lower(btrim(variant_group_code)))
  where variant_group_code is not null and btrim(variant_group_code) <> ''
    and variant_is_primary = true;
