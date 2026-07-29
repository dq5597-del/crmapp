-- ============================================================
-- 售價折扣（整張單，直接填折扣金額）2026-07-24
-- 報價單 / 銷貨單 / 訂購單 各加一個「折扣金額」欄位。
--   discount_amount = 折扣金額（NT$），折後含稅 = 原價 − 折扣金額
--   既有單據自動帶 0（不打折），不影響原本金額。
-- 執行位置：Supabase Dashboard → SQL Editor（可重複執行）
-- ============================================================

alter table quotes
  add column if not exists discount_amount numeric(14,2) not null default 0;

alter table sales_orders
  add column if not exists discount_amount numeric(14,2) not null default 0;

alter table purchase_orders
  add column if not exists discount_amount numeric(14,2) not null default 0;

notify pgrst, 'reload schema';
