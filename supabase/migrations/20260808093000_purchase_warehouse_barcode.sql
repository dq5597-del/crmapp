create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.warehouses (code, name)
values ('MAIN', '主倉庫')
on conflict (code) do nothing;

insert into public.warehouses (code, name) values
  ('HUALIEN', '花蓮市處倉庫'),
  ('JIAN', '吉安處倉庫')
on conflict (code) do nothing;

alter table public.purchase_items
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete restrict;

alter table public.inventory_transactions
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete restrict;

create table if not exists public.warehouse_stocks (
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, product_id)
);

create index if not exists idx_purchase_items_warehouse on public.purchase_items(warehouse_id);
create index if not exists idx_inventory_transactions_warehouse on public.inventory_transactions(warehouse_id);
create index if not exists idx_warehouse_stocks_product on public.warehouse_stocks(product_id);

create schema if not exists private;

create or replace function private.update_warehouse_stock()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.warehouse_id is not null then
    insert into public.warehouse_stocks (warehouse_id, product_id, quantity, updated_at)
    values (new.warehouse_id, new.product_id, new.quantity, now())
    on conflict (warehouse_id, product_id)
    do update set
      quantity = public.warehouse_stocks.quantity + excluded.quantity,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists t_inventory_update_warehouse_stock on public.inventory_transactions;
create trigger t_inventory_update_warehouse_stock
  after insert on public.inventory_transactions
  for each row execute function private.update_warehouse_stock();

alter table public.warehouses enable row level security;
alter table public.warehouse_stocks enable row level security;

drop policy if exists warehouses_authenticated_read on public.warehouses;
create policy warehouses_authenticated_read on public.warehouses
  for select to authenticated using (is_active = true);

revoke all on public.warehouses from anon, authenticated;
revoke all on public.warehouse_stocks from anon, authenticated;
grant select on public.warehouses to authenticated;

revoke all on function private.update_warehouse_stock() from public, anon, authenticated;

notify pgrst, 'reload schema';
