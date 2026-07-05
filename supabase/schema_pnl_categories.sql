-- ============================================================
-- 損益表科目分類（區分營業/營業外/成本/費用/所得稅）+ 流通股數
-- 在 Supabase Dashboard → SQL Editor 執行此檔
-- ============================================================

-- 0. accounting_income_categories 表原本就不存在於資料庫（與 accounting_expense_categories
--    不同，從未被建立過），這裡先補上，結構比照 accounting_expense_categories。
create table if not exists accounting_income_categories (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  sort_order  integer not null default 0,
  kind        text not null default 'revenue'
);

alter table accounting_income_categories enable row level security;

drop policy if exists "auth users all on accounting_income_categories" on accounting_income_categories;
create policy "auth users all on accounting_income_categories"
  on accounting_income_categories for all
  to authenticated
  using (true) with check (true);

-- 1. 收入科目：區分「營業收入」與「營業外收入」
alter table accounting_income_categories
  add column if not exists kind text not null default 'revenue';

alter table accounting_income_categories
  drop constraint if exists accounting_income_categories_kind_check;

alter table accounting_income_categories
  add constraint accounting_income_categories_kind_check
  check (kind in ('revenue', 'nonop_income'));

-- 2. 支出科目：區分「營業成本」「營業費用」「營業外支出」「所得稅費用」
alter table accounting_expense_categories
  add column if not exists kind text not null default 'opex';

alter table accounting_expense_categories
  drop constraint if exists accounting_expense_categories_kind_check;

alter table accounting_expense_categories
  add constraint accounting_expense_categories_kind_check
  check (kind in ('cogs', 'opex', 'nonop_expense', 'tax'));

-- 3. 系統設定新增「流通股數」，供損益表計算每股盈餘（EPS）使用
alter table system_settings
  add column if not exists shares_outstanding numeric;
