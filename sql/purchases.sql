-- 進貨單模組（向廠商進貨：已確認→自動應付、已到貨→自動入庫）
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_no text not null,
  vendor_id uuid references vendors(id) on delete set null,
  vendor_name text,
  purchase_date date default current_date,
  status text not null default '已確認',   -- 草稿 / 已確認 / 已到貨 / 取消
  subtotal numeric default 0,
  tax_amount numeric default 0,
  total_amount numeric default 0,
  payment_terms text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid references purchases(id) on delete cascade,
  seq_no int,
  product_id uuid references products(id) on delete set null,
  brand text,
  product_name text not null,
  model text,
  unit text default '台',
  quantity numeric default 1,
  unit_price numeric default 0,
  item_notes text,
  created_at timestamptz default now()
);

alter table payables add column if not exists purchase_id uuid references purchases(id) on delete set null;

alter table purchases enable row level security;
alter table purchase_items enable row level security;
create policy "purchases_all" on purchases for all to authenticated using (true) with check (true);
create policy "purchase_items_all" on purchase_items for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
