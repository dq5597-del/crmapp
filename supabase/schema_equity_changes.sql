-- ============================================================
-- 權益變動表 equity_changes_accounts + equity_changes_beginning
-- 在 Supabase Dashboard → SQL Editor 執行此檔
-- ============================================================
--
-- 權益種類（category）比照資產負債表的權益三分類：
--   share_capital       股本
--   capital_surplus     資本公積
--   retained_earnings   保留盈餘（未分配盈餘）
--
-- 每一列為一個「變動項目」（如：本期淨利、現金股利分派、提列法定盈餘公積、增資等），
-- 只屬於單一權益種類。system_key='net_income' 的列（僅限 retained_earnings 種類）
-- 為系統自動帶入（每年一筆，來自損益表該年度計算結果），金額不可手動修改；
-- 其餘項目皆為使用者自訂，可自由新增/編輯/刪除。
--
-- 期末餘額 = 期初餘額（見 equity_changes_beginning）+ 該權益種類所有變動項目加總。

create table if not exists equity_changes_accounts (
  id            uuid primary key default uuid_generate_v4(),
  year          integer not null,
  category      text not null check (category in ('share_capital', 'capital_surplus', 'retained_earnings')),
  name          text not null,
  amount        numeric(14,2) not null default 0,
  is_system     boolean not null default false,
  system_key    text check (system_key in ('net_income')),
  sort_order    integer not null default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create unique index if not exists idx_equity_changes_accounts_year_system_key
  on equity_changes_accounts(year, system_key) where system_key is not null;

alter table equity_changes_accounts enable row level security;

create policy "auth users all on equity_changes_accounts"
  on equity_changes_accounts for all
  to authenticated
  using (true) with check (true);

create trigger t_equity_changes_accounts_updated before update on equity_changes_accounts
  for each row execute function set_updated_at();

-- 每年度、每個權益種類的期初餘額（使用者手動輸入）
create table if not exists equity_changes_beginning (
  year                      integer primary key,
  share_capital_beginning   numeric(14,2) not null default 0,
  capital_surplus_beginning numeric(14,2) not null default 0,
  retained_earnings_beginning numeric(14,2) not null default 0,
  updated_at                timestamptz default now()
);

alter table equity_changes_beginning enable row level security;

create policy "auth users all on equity_changes_beginning"
  on equity_changes_beginning for all
  to authenticated
  using (true) with check (true);

create trigger t_equity_changes_beginning_updated before update on equity_changes_beginning
  for each row execute function set_updated_at();
