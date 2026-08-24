-- 讓共用篩選模板可在單一產品分類中停用指定條件，
-- 不必修改模板本身而連帶影響其他分類。
create table if not exists public.product_category_filter_exclusions (
  category_id uuid not null references public.product_categories(id) on delete cascade,
  group_id uuid not null references public.product_filter_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (category_id, group_id)
);

create index if not exists idx_product_category_filter_exclusions_group
  on public.product_category_filter_exclusions(group_id);

alter table public.product_category_filter_exclusions enable row level security;

grant select, insert, update, delete
  on public.product_category_filter_exclusions to authenticated;
grant all on public.product_category_filter_exclusions to service_role;

drop policy if exists product_category_filter_exclusions_auth_all
  on public.product_category_filter_exclusions;
create policy product_category_filter_exclusions_auth_all
  on public.product_category_filter_exclusions
  for all to authenticated using (true) with check (true);

comment on table public.product_category_filter_exclusions is
  'Per-category exclusions for shared CRM/WooCommerce product filter groups.';
