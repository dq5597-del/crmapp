-- ============================================================
-- 網路訂單（av-shop.com / WooCommerce 訂單同步 + 電子發票人工開立）
-- 前置：schema.sql（clients）
-- 執行位置：Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists public.web_orders (
  id                    uuid primary key default gen_random_uuid(),

  -- WooCommerce 來源
  wc_order_id           text unique not null,               -- Woo 的 order id
  order_no              text,                               -- Woo 的訂單編號（顯示用）
  order_date            timestamptz,
  wc_status             text,                               -- pending/processing/completed/cancelled...
  order_key             text,
  permalink             text,                               -- 後台訂單編輯連結

  -- 客戶
  client_id             uuid references public.clients(id) on delete set null,
  customer_name         text,
  customer_company      text,
  customer_email        text,
  customer_phone        text,
  shipping_address      text,

  -- 金額與品項
  total                 numeric(12,2) default 0,
  item_count            integer default 0,
  items                 jsonb default '[]'::jsonb,          -- [{name, sku, qty, price, subtotal}]

  -- 物流
  shipping_method       text,                               -- 黑貓宅配 / 7-11 交貨便 / 自取…
  tracking_no           text,                               -- 宅配單號
  shipping_status       text default '待出貨',               -- 待出貨/已出貨/已送達
  shipped_date          date,

  -- 客戶結帳時填的發票資料（由官網帶入）
  invoice_type          text,                               -- personal / company
  invoice_tax_id        text,
  invoice_title         text,
  invoice_carrier_type  text,                               -- member/mobile/certificate/donate
  invoice_carrier       text,
  invoice_donate        text,

  -- 人工開立後回填
  invoice_status        text not null default '未開立',      -- 未開立/已開立/已作廢
  invoice_no            text,                               -- 例：AB12345678
  invoice_date          date,
  invoice_pdf_url       text,                               -- Supabase Storage 公開網址
  invoice_notes         text,
  invoice_issued_by     uuid references auth.users(id) on delete set null,
  invoice_issued_at     timestamptz,

  raw                   jsonb,                              -- 原始 Woo 訂單，備查
  synced_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_web_orders_wc        on public.web_orders(wc_order_id);
create index if not exists idx_web_orders_client    on public.web_orders(client_id);
create index if not exists idx_web_orders_invoice   on public.web_orders(invoice_status);
create index if not exists idx_web_orders_shipping  on public.web_orders(shipping_status);
create index if not exists idx_web_orders_date      on public.web_orders(order_date desc);

-- updated_at
drop trigger if exists trg_web_orders_touch on public.web_orders;
create trigger trg_web_orders_touch before update on public.web_orders
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
alter table public.web_orders enable row level security;

drop policy if exists "web_orders_auth_all" on public.web_orders;
create policy "web_orders_auth_all" on public.web_orders
  for all to authenticated using (true) with check (true);

-- 注意：不開放 anon 讀取，訂單含客戶個資。
-- 同步與回寫一律由 API route 以 service role 執行。

notify pgrst, 'reload schema';

-- ============================================================
-- Storage：發票 PDF
-- 請另在 Supabase Dashboard → Storage 建立 bucket：
--   名稱：invoice-pdfs
--   Public：是（客戶端需能下載；檔名帶 uuid，不可猜）
-- ============================================================
