-- 訂購單刪除權限限制：僅「最高管理者」（role = 'admin'）可刪除訂購單
-- 說明：purchase_orders 目前有一個寬鬆的 "authenticated users can do all" permissive
-- policy（涵蓋 select/insert/update/delete）。這裡新增一個 RESTRICTIVE policy，
-- 只針對 DELETE 動作，會跟既有 permissive policy 用 AND 運算，
-- 因此即使原本的 permissive policy 允許所有已登入使用者，
-- 加上這個 restrictive policy 後，只有 role = 'admin' 的使用者才能真的執行刪除。
--
-- 執行方式：到 Supabase Dashboard → SQL Editor 貼上執行一次即可。

drop policy if exists "only admin can delete purchase orders" on purchase_orders;

create policy "only admin can delete purchase orders" on purchase_orders
  as restrictive
  for delete
  to authenticated
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );
