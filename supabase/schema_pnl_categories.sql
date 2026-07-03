-- ============================================================
-- 損益表科目分類（區分營業/營業外/成本/費用/所得稅）+ 流通股數
-- 在 Supabase Dashboard → SQL Editor 執行此檔
-- ============================================================

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
