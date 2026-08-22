-- CRM 篩選規格與 WooCommerce 全域商品屬性的穩定對照。
-- 屬性採「商品實際使用時才建立」，避免一次在 WordPress 建立大量空 taxonomy。
alter table public.product_filter_groups
  add column if not exists woo_attribute_id integer,
  add column if not exists woo_attribute_slug text,
  add column if not exists web_sync_enabled boolean not null default true,
  add column if not exists woo_synced_at timestamptz;

comment on column public.product_filter_groups.woo_attribute_id is 'WooCommerce global product attribute ID';
comment on column public.product_filter_groups.woo_attribute_slug is 'WooCommerce attribute taxonomy slug，例如 pa_resolution';
comment on column public.product_filter_groups.web_sync_enabled is '是否將此 CRM 規格同步至官網商品屬性與篩選欄位';
comment on column public.product_filter_groups.woo_synced_at is '最近一次確認 WooCommerce 屬性對照的時間';

create index if not exists idx_product_filter_groups_woo_attribute
  on public.product_filter_groups (woo_attribute_id)
  where woo_attribute_id is not null;
