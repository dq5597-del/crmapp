-- ============================================================
-- 現金流量表（間接法）cash_flow_accounts + cash_flow_settings
-- 在 Supabase Dashboard → SQL Editor 執行此檔
-- ============================================================
--
-- 採用間接法：
--   營業活動之現金流量：本期淨利（系統自動帶入，來自損益表）+ 使用者自訂調整項目
--                        （如：應收帳款增減、應付帳款增減、存貨增減、折舊費用等）
--   投資活動之現金流量：使用者自訂項目（如：購置設備、出售資產等）
--   籌資活動之現金流量：使用者自訂項目（如：股東增資、借款收付、發放股利等）
--
-- 本期現金增減淨額 = 三大活動現金流量合計
-- 期末現金餘額 = 期初現金餘額 + 本期現金增減淨額
--
-- system_key='net_income' 的列為系統自動帶入（每個年度各一筆，由 API 自動 upsert），
-- 金額不可手動修改；其餘列都是使用者自訂，可自由新增/編輯/刪除。

create table if not exists cash_flow_accounts (
  id            uuid primary key default uuid_generate_v4(),
  year          integer not null,
  section       text not null check (section in ('operating', 'investing', 'financing')),
  name          text not null,
  amount        numeric(14,2) not null default 0,
  is_system     boolean not null default false,
  system_key    text check (system_key in ('net_income')),
  sort_order    integer not null default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create unique index if not exists idx_cash_flow_accounts_year_system_key
  on cash_flow_accounts(year, system_key) where system_key is not null;

alter table cash_flow_accounts enable row level security;

create policy "auth users all on cash_flow_accounts"
  on cash_flow_accounts for all
  to authenticated
  using (true) with check (true);

create trigger t_cash_flow_accounts_updated before update on cash_flow_accounts
  for each row execute function set_updated_at();

-- 每年度的期初現金餘額（使用者手動輸入）
create table if not exists cash_flow_settings (
  year            integer primary key,
  beginning_cash  numeric(14,2) not null default 0,
  updated_at      timestamptz default now()
);

alter table cash_flow_settings enable row level security;

create policy "auth users all on cash_flow_settings"
  on cash_flow_settings for all
  to authenticated
  using (true) with check (true);

create trigger t_cash_flow_settings_updated before update on cash_flow_settings
  for each row execute function set_updated_at();
