create table if not exists public.product_purchase_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text,
  selection_mode text not null default 'single'
    check (selection_mode in ('single', 'multiple')),
  is_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.product_purchase_option_values (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.product_purchase_option_groups(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 100),
  price_adjustment numeric(12,2) not null default 0
    check (price_adjustment >= 0),
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_purchase_option_groups_product
  on public.product_purchase_option_groups(product_id, sort_order);
create index if not exists idx_product_purchase_option_values_group
  on public.product_purchase_option_values(group_id, sort_order);

alter table public.product_purchase_option_groups enable row level security;
alter table public.product_purchase_option_values enable row level security;

revoke all on table public.product_purchase_option_groups from anon, authenticated;
revoke all on table public.product_purchase_option_values from anon, authenticated;
grant select, insert, update, delete on table public.product_purchase_option_groups to authenticated;
grant select, insert, update, delete on table public.product_purchase_option_values to authenticated;
grant all on table public.product_purchase_option_groups to service_role;
grant all on table public.product_purchase_option_values to service_role;

drop policy if exists product_purchase_option_groups_select on public.product_purchase_option_groups;
create policy product_purchase_option_groups_select
  on public.product_purchase_option_groups for select to authenticated using (true);
drop policy if exists product_purchase_option_groups_insert on public.product_purchase_option_groups;
create policy product_purchase_option_groups_insert
  on public.product_purchase_option_groups for insert to authenticated with check (true);
drop policy if exists product_purchase_option_groups_update on public.product_purchase_option_groups;
create policy product_purchase_option_groups_update
  on public.product_purchase_option_groups for update to authenticated using (true) with check (true);
drop policy if exists product_purchase_option_groups_delete on public.product_purchase_option_groups;
create policy product_purchase_option_groups_delete
  on public.product_purchase_option_groups for delete to authenticated using (true);

drop policy if exists product_purchase_option_values_select on public.product_purchase_option_values;
create policy product_purchase_option_values_select
  on public.product_purchase_option_values for select to authenticated using (true);
drop policy if exists product_purchase_option_values_insert on public.product_purchase_option_values;
create policy product_purchase_option_values_insert
  on public.product_purchase_option_values for insert to authenticated with check (true);
drop policy if exists product_purchase_option_values_update on public.product_purchase_option_values;
create policy product_purchase_option_values_update
  on public.product_purchase_option_values for update to authenticated using (true) with check (true);
drop policy if exists product_purchase_option_values_delete on public.product_purchase_option_values;
create policy product_purchase_option_values_delete
  on public.product_purchase_option_values for delete to authenticated using (true);

comment on table public.product_purchase_option_groups is
  'CRM 管理的商品購買前選項群組，例如移動式擴音器的麥克風類型。';
comment on column public.product_purchase_option_groups.selection_mode is
  'single 顯示單選；multiple 顯示可複選。';
comment on column public.product_purchase_option_values.price_adjustment is
  '此選項加入購物車時增加的含稅售價，0 表示不加價。';
