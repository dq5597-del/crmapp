-- ============================================================
-- 還原：撤銷 schema_case_visibility.sql，恢復「所有登入者皆可讀寫」
-- 用途：若案件可見度上線後有異常，一鍵還原到原狀。
-- 執行位置：Supabase Dashboard → SQL Editor
-- 註：不會刪除 case_restricted() / can_see_case() 函式（留著無害），
--     只還原各表的 RLS 政策。訂購單的「只有管理員可刪」restrictive 政策維持不動。
-- ============================================================

-- 移除新政策
drop policy if exists "quotes_select"        on quotes;
drop policy if exists "quotes_write_insert"  on quotes;
drop policy if exists "quotes_write_update"  on quotes;
drop policy if exists "quotes_write_delete"  on quotes;

drop policy if exists "quote_items_select"        on quote_items;
drop policy if exists "quote_items_write_insert"  on quote_items;
drop policy if exists "quote_items_write_update"  on quote_items;
drop policy if exists "quote_items_write_delete"  on quote_items;

drop policy if exists "sales_orders_select"        on sales_orders;
drop policy if exists "sales_orders_write_insert"  on sales_orders;
drop policy if exists "sales_orders_write_update"  on sales_orders;
drop policy if exists "sales_orders_write_delete"  on sales_orders;

drop policy if exists "sales_order_items_select"        on sales_order_items;
drop policy if exists "sales_order_items_write_insert"  on sales_order_items;
drop policy if exists "sales_order_items_write_update"  on sales_order_items;
drop policy if exists "sales_order_items_write_delete"  on sales_order_items;

drop policy if exists "purchase_orders_select"        on purchase_orders;
drop policy if exists "purchase_orders_write_insert"  on purchase_orders;
drop policy if exists "purchase_orders_write_update"  on purchase_orders;
drop policy if exists "purchase_orders_write_delete"  on purchase_orders;

drop policy if exists "purchase_order_items_select"        on purchase_order_items;
drop policy if exists "purchase_order_items_write_insert"  on purchase_order_items;
drop policy if exists "purchase_order_items_write_update"  on purchase_order_items;
drop policy if exists "purchase_order_items_write_delete"  on purchase_order_items;

-- 還原原始「所有登入者皆可讀寫」政策
create policy "authenticated users can do all" on quotes                for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on quote_items           for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on sales_orders          for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on sales_order_items     for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on purchase_orders       for all to authenticated using (true) with check (true);
create policy "authenticated users can do all" on purchase_order_items  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
