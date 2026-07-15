-- ============================================================
-- 案件可見度：報價單／銷貨單／訂購單「只看自己的」
--
-- 規則（經確認）：
--   第一線業務（role 在下方「受限清單」）→ 只看得到自己承辦＋自己團隊的案子。
--   其他所有角色（會計、進銷存／庫管、管理員…）→ 看得到全部。
--   主管透過組織階層 subordinates_of() 看到團隊。
--
-- 安全設計：採「白名單受限」——只有明確列在受限清單的角色會被限制，
--   其餘角色一律看得到全部，避免誤把會計／庫管等跨部門角色鎖在外面。
--
-- 範圍：quotes / sales_orders / purchase_orders 及其品項表
--   （價格藏在品項表，必須一起鎖，否則可繞過主檔直接讀品項）。
--   本檔「只改可見度（SELECT）」，不動 新增／修改／刪除，避免影響既有流程。
--   訂購單既有的「只有管理員可刪」restrictive 政策不受影響（不 drop）。
--
-- 依賴：schema.sql、schema_salesperson.sql（salesperson_id）、
--        schema_ownership.sql（subordinates_of）、schema_permissions.sql（is_admin）
-- 執行位置：Supabase Dashboard → SQL Editor
-- 本檔可重複執行（idempotent）
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- ① 判斷「目前使用者是否為受限的第一線業務」
--    ★ 受限角色清單在這裡調整 ★
--      預設只限制 'sales' / '業務'。若日後要把主管也限制成只看團隊，
--      把 'manager' / '主管' 加進來即可（他們仍會透過 subordinates 看到團隊）。
-- ────────────────────────────────────────────────────────────
create or replace function public.case_restricted()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_profiles
    where id = auth.uid()
      and role in ('sales', '業務', '業務員', 'salesperson')   -- ← 受限角色清單，可自行增減
  );
$$;
grant execute on function public.case_restricted() to authenticated;


-- ────────────────────────────────────────────────────────────
-- ② 判斷「我可否看到這筆案件」
--    承辦人 sp 由呼叫端帶入 coalesce(salesperson_id, created_by)。
-- ────────────────────────────────────────────────────────────
create or replace function public.can_see_case(sp uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    not public.case_restricted()                                   -- 非受限角色 → 看全部
    or sp = auth.uid()                                             -- 自己承辦
    or sp in (select user_id from public.subordinates_of(auth.uid()));  -- 團隊（主管視角）
$$;
grant execute on function public.can_see_case(uuid) to authenticated;


-- ────────────────────────────────────────────────────────────
-- ③ 報價單 quotes：拆分政策，僅 SELECT 受限
-- ────────────────────────────────────────────────────────────
drop policy if exists "authenticated users can do all" on quotes;
drop policy if exists "quotes_select" on quotes;
drop policy if exists "quotes_write_insert" on quotes;
drop policy if exists "quotes_write_update" on quotes;
drop policy if exists "quotes_write_delete" on quotes;

create policy "quotes_select" on quotes for select to authenticated
  using ( public.can_see_case(coalesce(salesperson_id, created_by)) );
create policy "quotes_write_insert" on quotes for insert to authenticated with check (true);
create policy "quotes_write_update" on quotes for update to authenticated using (true) with check (true);
create policy "quotes_write_delete" on quotes for delete to authenticated using (true);

-- 報價品項 quote_items：跟隨母單可見度
drop policy if exists "authenticated users can do all" on quote_items;
drop policy if exists "quote_items_select" on quote_items;
drop policy if exists "quote_items_write_insert" on quote_items;
drop policy if exists "quote_items_write_update" on quote_items;
drop policy if exists "quote_items_write_delete" on quote_items;

create policy "quote_items_select" on quote_items for select to authenticated
  using ( exists (
    select 1 from quotes q
    where q.id = quote_items.quote_id
      and public.can_see_case(coalesce(q.salesperson_id, q.created_by))
  ) );
create policy "quote_items_write_insert" on quote_items for insert to authenticated with check (true);
create policy "quote_items_write_update" on quote_items for update to authenticated using (true) with check (true);
create policy "quote_items_write_delete" on quote_items for delete to authenticated using (true);


-- ────────────────────────────────────────────────────────────
-- ④ 銷貨單 sales_orders
-- ────────────────────────────────────────────────────────────
drop policy if exists "authenticated users can do all" on sales_orders;
drop policy if exists "sales_orders_select" on sales_orders;
drop policy if exists "sales_orders_write_insert" on sales_orders;
drop policy if exists "sales_orders_write_update" on sales_orders;
drop policy if exists "sales_orders_write_delete" on sales_orders;

create policy "sales_orders_select" on sales_orders for select to authenticated
  using ( public.can_see_case(coalesce(salesperson_id, created_by)) );
create policy "sales_orders_write_insert" on sales_orders for insert to authenticated with check (true);
create policy "sales_orders_write_update" on sales_orders for update to authenticated using (true) with check (true);
create policy "sales_orders_write_delete" on sales_orders for delete to authenticated using (true);

drop policy if exists "authenticated users can do all" on sales_order_items;
drop policy if exists "sales_order_items_select" on sales_order_items;
drop policy if exists "sales_order_items_write_insert" on sales_order_items;
drop policy if exists "sales_order_items_write_update" on sales_order_items;
drop policy if exists "sales_order_items_write_delete" on sales_order_items;

create policy "sales_order_items_select" on sales_order_items for select to authenticated
  using ( exists (
    select 1 from sales_orders o
    where o.id = sales_order_items.order_id
      and public.can_see_case(coalesce(o.salesperson_id, o.created_by))
  ) );
create policy "sales_order_items_write_insert" on sales_order_items for insert to authenticated with check (true);
create policy "sales_order_items_write_update" on sales_order_items for update to authenticated using (true) with check (true);
create policy "sales_order_items_write_delete" on sales_order_items for delete to authenticated using (true);


-- ────────────────────────────────────────────────────────────
-- ⑤ 訂購單 purchase_orders
--    注意：既有 restrictive 政策「only admin can delete purchase orders」
--    不 drop、不動 —— 它會與下方 permissive delete 用 AND 運算，維持只有管理員可刪。
-- ────────────────────────────────────────────────────────────
drop policy if exists "authenticated users can do all" on purchase_orders;
drop policy if exists "purchase_orders_select" on purchase_orders;
drop policy if exists "purchase_orders_write_insert" on purchase_orders;
drop policy if exists "purchase_orders_write_update" on purchase_orders;
drop policy if exists "purchase_orders_write_delete" on purchase_orders;

create policy "purchase_orders_select" on purchase_orders for select to authenticated
  using ( public.can_see_case(coalesce(salesperson_id, created_by)) );
create policy "purchase_orders_write_insert" on purchase_orders for insert to authenticated with check (true);
create policy "purchase_orders_write_update" on purchase_orders for update to authenticated using (true) with check (true);
create policy "purchase_orders_write_delete" on purchase_orders for delete to authenticated using (true);

drop policy if exists "authenticated users can do all" on purchase_order_items;
drop policy if exists "purchase_order_items_select" on purchase_order_items;
drop policy if exists "purchase_order_items_write_insert" on purchase_order_items;
drop policy if exists "purchase_order_items_write_update" on purchase_order_items;
drop policy if exists "purchase_order_items_write_delete" on purchase_order_items;

create policy "purchase_order_items_select" on purchase_order_items for select to authenticated
  using ( exists (
    select 1 from purchase_orders o
    where o.id = purchase_order_items.order_id
      and public.can_see_case(coalesce(o.salesperson_id, o.created_by))
  ) );
create policy "purchase_order_items_write_insert" on purchase_order_items for insert to authenticated with check (true);
create policy "purchase_order_items_write_update" on purchase_order_items for update to authenticated using (true) with check (true);
create policy "purchase_order_items_write_delete" on purchase_order_items for delete to authenticated using (true);


notify pgrst, 'reload schema';

-- ============================================================
-- 上線前務必測試（見 rollback_case_visibility.sql 可一鍵還原）：
--   1. 用「業務A」登入 → 只看得到自己的報價／銷貨／訂購。
--   2. 用「業務B」登入 → 看不到業務A的案子。
--   3. 用「會計」登入 → 看得到全部單據（對帳正常）。
--   4. 用「主管」登入 → 看得到自己團隊的案子。
--   5. 戰情室、應收應付、列印等既有畫面沒有變空白或報錯。
-- 若任何一項異常，執行 rollback 還原後再回報。
-- ============================================================
