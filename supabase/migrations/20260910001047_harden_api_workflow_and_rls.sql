-- Security hardening after EIP / Workflow integration.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.has_feature_permission(p_feature text, p_action text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with me as (
    select id, coalesce(role, 'viewer') role_key
    from public.user_profiles
    where id = (select auth.uid()) and coalesce(is_active, true)
  ),
  base as (
    select rp.*
    from public.role_permissions rp join me on rp.role_key = me.role_key
    where rp.feature_key = p_feature
  ),
  ov as (
    select up.*
    from public.user_permissions up join me on up.user_id = me.id
    where up.feature_key = p_feature
  )
  select coalesce(
    (select role_key in ('admin','管理員') from me),
    false
  ) or coalesce(
    case p_action
      when 'view' then (select coalesce(ov.can_view, base.can_view) from base full join ov using(feature_key))
      when 'create' then (select coalesce(ov.can_create, base.can_create) from base full join ov using(feature_key))
      when 'edit' then (select coalesce(ov.can_edit, base.can_edit) from base full join ov using(feature_key))
      when 'delete' then (select coalesce(ov.can_delete, base.can_delete) from base full join ov using(feature_key))
      when 'cost' then (select coalesce(ov.can_cost, base.can_cost) from base full join ov using(feature_key))
      else false
    end,
    false
  )
$$;
revoke execute on function private.has_feature_permission(text, text) from public, anon;
grant execute on function private.has_feature_permission(text, text) to authenticated;

create or replace function private.current_profile_department()
returns text
language sql stable security definer set search_path = ''
as $$
  select e.department
  from public.hr_employees e
  where e.user_id = (select auth.uid())
  limit 1
$$;
revoke execute on function private.current_profile_department() from public, anon;
grant execute on function private.current_profile_department() to authenticated;

drop policy if exists eip_documents_read on public.eip_documents;
create policy eip_documents_read on public.eip_documents for select to authenticated
using (
  private.can_manage_eip()
  or (
    status = 'published'
    and (effective_date is null or effective_date <= current_date)
    and (expires_at is null or expires_at > now())
    and (
      audience_type = 'all'
      or (audience_type = 'role' and audience_value = private.current_profile_role())
      or (audience_type = 'department' and audience_value = private.current_profile_department())
    )
  )
);

alter table if exists public.approval_instances
  add column if not exists routing_user_id uuid references public.user_profiles(id) on delete set null;
create index if not exists idx_approval_instances_routing_user
  on public.approval_instances(routing_user_id, status);

drop policy if exists "authenticated can read instances" on public.approval_instances;
drop policy if exists "authenticated can read records" on public.approval_records;
revoke all on public.approval_instances, public.approval_records from anon, authenticated;
grant select on public.approval_flows, public.approval_flow_steps to authenticated;

create or replace function private.guard_approval_locked_document()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.approval_status in ('pending','approved') and current_user <> 'service_role' then
    if tg_op = 'DELETE' then
      raise exception '此單據正在簽核或已核准，不可刪除';
    end if;
    if tg_table_name = 'hr_payrolls'
       and old.approval_status = 'approved'
       and new.approval_status is not distinct from old.approval_status
       and (to_jsonb(new) - 'status' - 'pay_date' - 'updated_at')
           = (to_jsonb(old) - 'status' - 'pay_date' - 'updated_at')
       and new.status = '已發放' then
      return new;
    end if;
    raise exception '此單據正在簽核或已核准，不可修改';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;
revoke execute on function private.guard_approval_locked_document() from public, anon, authenticated;

create or replace function private.guard_approval_locked_child()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare parent_status text;
declare old_parent_status text;
declare parent_id uuid;
begin
  if current_user = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_table_name = 'quote_items' then
    if tg_op = 'DELETE' then parent_id := old.quote_id; else parent_id := new.quote_id; end if;
    select approval_status into parent_status from public.quotes where id = parent_id;
    if tg_op = 'UPDATE' and old.quote_id is distinct from new.quote_id then
      select approval_status into old_parent_status from public.quotes where id = old.quote_id;
    end if;
  elsif tg_table_name = 'purchase_order_items' then
    if tg_op = 'DELETE' then parent_id := old.order_id; else parent_id := new.order_id; end if;
    select approval_status into parent_status from public.purchase_orders where id = parent_id;
    if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
      select approval_status into old_parent_status from public.purchase_orders where id = old.order_id;
    end if;
  else
    raise exception '不支援的簽核明細表：%', tg_table_name;
  end if;
  if parent_status in ('pending','approved') or old_parent_status in ('pending','approved') then
    raise exception '此單據正在簽核或已核准，明細不可修改';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;
revoke execute on function private.guard_approval_locked_child() from public, anon, authenticated;

drop trigger if exists trg_guard_approval_locked_child on public.quote_items;
create trigger trg_guard_approval_locked_child before insert or update or delete on public.quote_items
for each row execute function private.guard_approval_locked_child();
drop trigger if exists trg_guard_approval_locked_child on public.purchase_order_items;
create trigger trg_guard_approval_locked_child before insert or update or delete on public.purchase_order_items
for each row execute function private.guard_approval_locked_child();

-- Replace permissive policies on core business tables with feature permissions.
do $$
declare
  entry text[];
  tab text;
  feat text;
  pol record;
begin
  foreach entry slice 1 in array array[
    ['system_settings','settings'],
    ['product_categories','products'], ['products','products'], ['market_prices','products'],
    ['product_features','products'], ['product_images','products'], ['product_vendors','products'],
    ['product_filter_groups','products'], ['product_filter_options','products'],
    ['product_filter_assignments','products'], ['product_filter_numbers','products'],
    ['product_filter_templates','products'], ['product_filter_template_groups','products'],
    ['product_category_filter_templates','products'], ['product_category_filter_exclusions','products'],
    ['product_purchase_option_groups','products'], ['product_purchase_option_values','products'],
    ['product_vendor_quote_history','products'],
    ['product_catalog_shares','product-selector'], ['product_catalog_share_items','product-selector'],
    ['vendors','vendors'],
    ['clients','clients'], ['contacts','clients'], ['competitor_info','clients'], ['visit_records','clients'],
    ['projects','projects'],
    ['quotes','quotes'], ['quote_items','quotes'],
    ['sales_orders','sales-orders'], ['sales_order_items','sales-orders'],
    ['purchase_orders','purchase-orders'], ['purchase_order_items','purchase-orders'],
    ['inventory_transactions','inventory'],
    ['receivables','receivables'], ['payment_records','receivables'],
    ['payables','payables'], ['payable_payments','payables'],
    ['inquiries','inquiries'], ['inquiry_items','inquiries'],
    ['returns','returns'], ['return_items','returns'],
    ['shipments','shipments'], ['shipment_items','shipments'],
    ['service_requests','service-requests'], ['service_vendor_repairs','service-requests'],
    ['service_repair_quotes','service-requests'], ['service_repair_quote_items','service-requests'],
    ['service_fees','service-requests'],
    ['web_orders','sales-orders'],
    ['important_dates','schedule'], ['daily_reviews','schedule'],
    ['branches','settings']
  ] loop
    tab := entry[1];
    feat := entry[2];
    if to_regclass('public.' || tab) is null then continue; end if;

    execute format('alter table public.%I enable row level security', tab);
    -- 保留既有的專用 SELECT 範圍（本人、分公司等），只移除會讓寫入繞過權限的 ALL/寫入政策。
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = tab and cmd <> 'SELECT'
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, tab);
    end loop;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = tab and cmd = 'SELECT'
    ) then
      execute format('create policy %I on public.%I for select to authenticated using (private.has_feature_permission(%L, %L))', tab || '_feature_select', tab, feat, 'view');
    end if;
    execute format('create policy %I on public.%I for insert to authenticated with check (private.has_feature_permission(%L, %L))', tab || '_feature_insert', tab, feat, 'create');
    execute format('create policy %I on public.%I for update to authenticated using (private.has_feature_permission(%L, %L)) with check (private.has_feature_permission(%L, %L))', tab || '_feature_update', tab, feat, 'edit', feat, 'edit');
    execute format('create policy %I on public.%I for delete to authenticated using (private.has_feature_permission(%L, %L))', tab || '_feature_delete', tab, feat, 'delete');
  end loop;
end $$;

notify pgrst, 'reload schema';
