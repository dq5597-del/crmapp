-- ============================================================
-- 資產負債表科目 balance_sheet_accounts
-- 在 Supabase Dashboard → SQL Editor 執行此檔
-- ============================================================
--
-- section 七種分類：
--   current_asset       流動資產
--   noncurrent_asset    非流動資產
--   current_liability   流動負債
--   noncurrent_liability 非流動負債
--   share_capital       股本
--   capital_surplus     資本公積
--   retained_earnings   保留盈餘
--
-- balance 為 null 代表「系統自動帶入」（僅限 system_key 有值的科目），
-- 使用者手動輸入金額後 balance 會變成非 null，之後以手動金額為準，
-- 直到使用者按「還原自動」清空為 null。

create table if not exists balance_sheet_accounts (
  id            uuid primary key default uuid_generate_v4(),
  section       text not null check (section in (
                  'current_asset', 'noncurrent_asset',
                  'current_liability', 'noncurrent_liability',
                  'share_capital', 'capital_surplus', 'retained_earnings'
                )),
  name          text not null,
  balance       numeric(14,2),
  is_system     boolean not null default false,
  system_key    text check (system_key in ('receivables', 'payables', 'inventory', 'retained_earnings')),
  sort_order    integer not null default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create unique index if not exists idx_balance_sheet_accounts_system_key
  on balance_sheet_accounts(system_key) where system_key is not null;

alter table balance_sheet_accounts enable row level security;

create policy "auth users all on balance_sheet_accounts"
  on balance_sheet_accounts for all
  to authenticated
  using (true) with check (true);

create trigger t_balance_sheet_accounts_updated before update on balance_sheet_accounts
  for each row execute function set_updated_at();

-- 預設系統科目（自動帶入應收帳款／存貨／應付帳款／累計淨利，皆可手動覆蓋）
insert into balance_sheet_accounts (section, name, balance, is_system, system_key, sort_order) values
  ('current_asset',     '應收帳款',           null, true, 'receivables',      1),
  ('current_asset',     '存貨',               null, true, 'inventory',        2),
  ('current_liability', '應付帳款',           null, true, 'payables',         1),
  ('retained_earnings', '保留盈餘（累計淨利）', null, true, 'retained_earnings', 1)
on conflict (system_key) do nothing;
