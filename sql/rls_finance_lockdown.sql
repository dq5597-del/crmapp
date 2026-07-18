-- ============================================================
-- 財務資料 RLS 收緊（選用）
-- 效果：會計模組（收入/支出/科目）與應收/應付帳款，
--       只有 admin 與 accounting 角色可以讀寫；
--       其他角色（如業務 sales）看不到也改不了。
-- 注意：
--  1. 執行前先確認 user_profiles.role 已正確設定（admin / accounting / sales…）。
--  2. 若業務日常需要看應收（催款），請把 receivables 兩行 SELECT 政策
--     換成下方註解的「全員可讀」版本。
--  3. 執行後若有頁面變空白，代表該角色被擋掉——屬預期行為。
-- ============================================================

-- 判斷目前登入者是否為財務相關角色
create or replace function public.is_finance()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from user_profiles
    where id = auth.uid() and role in ('admin', 'accounting')
  );
$$;

-- 要收緊的資料表清單
do $$
declare t text;
begin
  foreach t in array array[
    'accounting_income', 'accounting_expenses', 'accounting_expense_categories',
    'receivables', 'payment_records', 'payables', 'payable_payments'
  ] loop
    execute format('alter table %I enable row level security', t);
    -- 移除可能存在的舊寬鬆政策後建立新政策
    execute format('drop policy if exists "%s_finance_all" on %I', t, t);
    execute format(
      'create policy "%s_finance_all" on %I for all to authenticated using (public.is_finance()) with check (public.is_finance())',
      t, t
    );
  end loop;
end $$;

-- （選用）業務仍可「讀」應收帳款以便催款——需要的話取消下面註解執行
-- drop policy if exists "receivables_read_all" on receivables;
-- create policy "receivables_read_all" on receivables for select to authenticated using (true);
-- drop policy if exists "payment_records_read_all" on payment_records;
-- create policy "payment_records_read_all" on payment_records for select to authenticated using (true);

notify pgrst, 'reload schema';
