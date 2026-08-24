-- ============================================================
-- 出貨管理（Shipments）
-- 前置：schema.sql（sales_orders / products / clients）
--       schema_additions.sql（inventory_transactions + update_product_stock trigger）
-- 執行位置：Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists public.shipments (
  id                uuid primary key default gen_random_uuid(),
  shipment_no       text unique not null,               -- SH-YYMMDD-001
  sales_order_id    uuid references public.sales_orders(id) on delete set null,
  client_id         uuid references public.clients(id) on delete set null,
  project_name      text,

  ship_date         date default current_date,
  status            text not null default '待出貨',      -- 待出貨/已出貨/已送達/已簽收/取消

  -- 庫存
  deduct_stock      boolean not null default true,      -- 這張單要不要扣庫存（樣品/借出可關）
  stock_deducted    boolean not null default false,     -- 是否已扣（避免重複扣）

  -- 物流
  delivery_method   text default '自送',                 -- 自送/貨運/宅配/客戶自取
  carrier           text,                                -- 貨運公司
  tracking_no       text,                                -- 託運單號
  expected_date     date,                                -- 預計到貨
  delivered_date    date,                                -- 實際到貨
  receiver_name     text,
  receiver_phone    text,
  address           text,

  -- 公開追蹤與簽收
  track_token       uuid unique default gen_random_uuid(),
  signed_at         timestamptz,
  signer_name       text,
  sign_note         text,

  notes             text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_shipments_so     on public.shipments(sales_order_id);
create index if not exists idx_shipments_client on public.shipments(client_id);
create index if not exists idx_shipments_token  on public.shipments(track_token);
create index if not exists idx_shipments_status on public.shipments(status);

create table if not exists public.shipment_items (
  id                   uuid primary key default gen_random_uuid(),
  shipment_id          uuid not null references public.shipments(id) on delete cascade,
  seq_no               integer default 1,
  sales_order_item_id  uuid,                    -- 來源銷貨單品項（分批出貨用）
  product_id           uuid references public.products(id) on delete set null,
  product_name         text not null,
  model                text,
  unit                 text,
  quantity             numeric(10,2) not null default 0,
  item_notes           text,
  created_at           timestamptz not null default now()
);
create index if not exists idx_shipment_items_shipment on public.shipment_items(shipment_id);

-- updated_at
drop trigger if exists trg_shipments_touch on public.shipments;
create trigger trg_shipments_touch before update on public.shipments
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
alter table public.shipments      enable row level security;
alter table public.shipment_items enable row level security;

drop policy if exists "shipments_auth_all" on public.shipments;
create policy "shipments_auth_all" on public.shipments
  for all to authenticated using (true) with check (true);

drop policy if exists "shipment_items_auth_all" on public.shipment_items;
create policy "shipment_items_auth_all" on public.shipment_items
  for all to authenticated using (true) with check (true);

-- 公開追蹤／簽收頁：匿名可讀（實際以 token 篩選，資料由 API route 取用）
drop policy if exists "shipments_public_view" on public.shipments;
create policy "shipments_public_view" on public.shipments
  for select to anon using (true);

drop policy if exists "shipment_items_public_view" on public.shipment_items;
create policy "shipment_items_public_view" on public.shipment_items
  for select to anon using (true);

notify pgrst, 'reload schema';
