-- EIP（公告制度專區）、Workflow 簽核引擎、管理循環／內部控制、員工報銷整合
-- 重建自 2026-09-13 的建置產物（原始檔遺失），內容以冪等方式撰寫，可重複套用。

-- ---------------------------------------------------------------------------
-- 0. 共用輔助函式
-- ---------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.current_profile_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(p.role, 'viewer')
  from public.user_profiles p
  where p.id = (select auth.uid())
  limit 1
$$;
revoke execute on function private.current_profile_role() from public, anon;
grant execute on function private.current_profile_role() to authenticated;

-- EIP 文件的維護權：管理員、主管、HR
create or replace function private.can_manage_eip()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select coalesce(p.role, '') in ('admin', '管理員', 'manager', 'hr')
     from public.user_profiles p
     where p.id = (select auth.uid()) and coalesce(p.is_active, true)),
    false
  )
$$;
revoke execute on function private.can_manage_eip() from public, anon;
grant execute on function private.can_manage_eip() to authenticated;

-- 功能權限判斷。20260910001047 會以 create or replace 換成強化版（含個人例外），
-- 這裡先建立同名函式，讓本檔案的 policy 能夠成立，順序才不會相依錯誤。
create or replace function private.has_feature_permission(p_feature text, p_action text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with me as (
    select id, coalesce(role, 'viewer') role_key
    from public.user_profiles
    where id = (select auth.uid()) and coalesce(is_active, true)
  )
  select coalesce((select role_key in ('admin', '管理員') from me), false)
      or coalesce((
           select case p_action
             when 'view'   then rp.can_view
             when 'create' then rp.can_create
             when 'edit'   then rp.can_edit
             when 'delete' then rp.can_delete
             when 'cost'   then rp.can_cost
             else false
           end
           from public.role_permissions rp join me on rp.role_key = me.role_key
           where rp.feature_key = p_feature
         ), false)
$$;
revoke execute on function private.has_feature_permission(text, text) from public, anon;
grant execute on function private.has_feature_permission(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. EIP：公告制度專區
-- ---------------------------------------------------------------------------
create table if not exists public.eip_documents (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  category       text not null default '公司公告',
  summary        text,
  content        text,
  attachment_url text,
  status         text not null default 'draft'
                 check (status in ('draft', 'published', 'archived')),
  is_pinned      boolean not null default false,
  requires_ack   boolean not null default false,
  audience_type  text not null default 'all'
                 check (audience_type in ('all', 'role', 'department')),
  audience_value text,
  effective_date date,
  expires_at     timestamptz,
  published_at   timestamptz,
  version_no     integer not null default 1,
  created_by     uuid references public.user_profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_eip_documents_status
  on public.eip_documents(status, is_pinned desc, published_at desc);
create index if not exists idx_eip_documents_category
  on public.eip_documents(category);

-- 發布時自動蓋上發布時間；內容異動時遞增版本號，讓已讀回條綁定版本。
create or replace function private.eip_documents_touch()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status = 'published' and new.published_at is null then
      new.published_at := now();
    end if;
    return new;
  end if;
  if new.status = 'published' and old.status <> 'published' then
    new.published_at := coalesce(new.published_at, now());
  end if;
  -- 只有實質內容改變才算新版本，改狀態或置頂不算。
  if new.title is distinct from old.title
     or new.content is distinct from old.content
     or new.summary is distinct from old.summary
     or new.attachment_url is distinct from old.attachment_url then
    new.version_no := old.version_no + 1;
  end if;
  return new;
end
$$;

drop trigger if exists trg_eip_documents_touch on public.eip_documents;
create trigger trg_eip_documents_touch
before insert or update on public.eip_documents
for each row execute function private.eip_documents_touch();

create table if not exists public.eip_read_receipts (
  document_id     uuid not null references public.eip_documents(id) on delete cascade,
  user_id         uuid not null references public.user_profiles(id) on delete cascade,
  version_no      integer not null default 1,
  acknowledged_at timestamptz not null default now(),
  primary key (document_id, user_id, version_no)
);

create index if not exists idx_eip_read_receipts_user
  on public.eip_read_receipts(user_id);

alter table public.eip_documents      enable row level security;
alter table public.eip_read_receipts  enable row level security;

-- 讀取政策在 20260910001047 安全強化檔中重新定義（含分眾與生效期間判斷）。
drop policy if exists eip_documents_read on public.eip_documents;
create policy eip_documents_read on public.eip_documents
  for select to authenticated using (
    private.can_manage_eip() or status = 'published'
  );

drop policy if exists eip_documents_write on public.eip_documents;
create policy eip_documents_write on public.eip_documents
  for all to authenticated
  using (private.can_manage_eip())
  with check (private.can_manage_eip());

-- 閱讀回條只能由本人建立，也只看得到自己的；管理者可統計已讀人數。
drop policy if exists eip_read_receipts_self on public.eip_read_receipts;
create policy eip_read_receipts_self on public.eip_read_receipts
  for select to authenticated
  using (user_id = (select auth.uid()) or private.can_manage_eip());

drop policy if exists eip_read_receipts_insert on public.eip_read_receipts;
create policy eip_read_receipts_insert on public.eip_read_receipts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists eip_read_receipts_update on public.eip_read_receipts;
create policy eip_read_receipts_update on public.eip_read_receipts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Workflow：權責表與簽核引擎
-- ---------------------------------------------------------------------------
create table if not exists public.approval_flows (
  id                  uuid primary key default gen_random_uuid(),
  doc_type            text not null,
  name                text not null,
  priority            integer not null default 100,
  amount_gte          numeric,
  amount_lt           numeric,
  discount_gte        numeric,
  discount_lt         numeric,
  requester_department text,
  is_active           boolean not null default true,
  effective_from      date not null default current_date,
  effective_to        date,
  version_no          integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_approval_flows_lookup
  on public.approval_flows(doc_type, is_active, priority);

create table if not exists public.approval_flow_steps (
  id               uuid primary key default gen_random_uuid(),
  flow_id          uuid not null references public.approval_flows(id) on delete cascade,
  step_order       integer not null,
  step_name        text not null,
  approver_type    text not null
                   check (approver_type in ('user', 'role', 'direct_manager')),
  approver_user_id uuid references public.user_profiles(id) on delete set null,
  approver_role    text,
  due_hours        integer,
  created_at       timestamptz not null default now(),
  unique (flow_id, step_order)
);

create index if not exists idx_approval_flow_steps_flow
  on public.approval_flow_steps(flow_id, step_order);

create table if not exists public.approval_instances (
  id              uuid primary key default gen_random_uuid(),
  doc_type        text not null,
  doc_id          uuid not null,
  doc_no          text,
  total_amount    numeric,
  flow_id         uuid references public.approval_flows(id) on delete set null,
  -- 送簽當下的流程快照：事後改權責表不影響進行中的單據。
  flow_snapshot   jsonb,
  current_step    integer not null default 1,
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  submitted_by    uuid references public.user_profiles(id) on delete set null,
  submitted_at    timestamptz not null default now(),
  routing_user_id uuid references public.user_profiles(id) on delete set null,
  -- 送簽時的內容雜湊，核准時重新比對，防止送簽後竄改。
  content_hash    text,
  due_at          timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- 一張單同時間只能有一筆進行中的簽呈；退回後重送會留下多筆已結案紀錄，
-- 所以唯一性只能限制在 pending，不能把 status 併進普通 unique constraint。
create unique index if not exists uq_approval_instances_active
  on public.approval_instances(doc_type, doc_id)
  where status = 'pending';

create index if not exists idx_approval_instances_doc
  on public.approval_instances(doc_type, doc_id);
create index if not exists idx_approval_instances_status
  on public.approval_instances(status, current_step);
create index if not exists idx_approval_instances_routing_user
  on public.approval_instances(routing_user_id, status);

create table if not exists public.approval_records (
  id          uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.approval_instances(id) on delete cascade,
  step_order  integer not null,
  step_name   text,
  actor_id    uuid references public.user_profiles(id) on delete set null,
  actor_name  text,
  action      text not null check (action in ('submit', 'approve', 'reject', 'cancel')),
  comment     text,
  approved_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists idx_approval_records_instance
  on public.approval_records(instance_id, step_order);

alter table public.approval_flows      enable row level security;
alter table public.approval_flow_steps enable row level security;
alter table public.approval_instances  enable row level security;
alter table public.approval_records    enable row level security;

-- 權責表全員可讀（前端要顯示目前流程），但只有 service role 能寫入。
drop policy if exists approval_flows_read on public.approval_flows;
create policy approval_flows_read on public.approval_flows
  for select to authenticated using (true);

drop policy if exists approval_flow_steps_read on public.approval_flow_steps;
create policy approval_flow_steps_read on public.approval_flow_steps
  for select to authenticated using (true);

-- 簽核實例與紀錄一律透過 /api/approvals/* 以 service role 存取，
-- 不開放 authenticated 直接讀寫（見 20260910001047 的 revoke）。

-- 送簽後鎖定主檔：各業務單據加上簽核狀態欄位與保護 trigger。
do $$
declare tab text;
begin
  foreach tab in array array[
    'quotes', 'purchase_orders', 'payables',
    'employee_expense_claims', 'hr_leaves', 'hr_payrolls'
  ] loop
    if to_regclass('public.' || tab) is null then continue; end if;
    execute format(
      'alter table public.%I add column if not exists approval_status text not null default ''draft''',
      tab
    );
    execute format(
      'create index if not exists %I on public.%I(approval_status)',
      'idx_' || tab || '_approval_status', tab
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. 管理循環／內部控制台帳
-- ---------------------------------------------------------------------------
create table if not exists public.internal_control_items (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  cycle             text not null default '管理循環',
  risk_description  text,
  control_activity  text,
  control_frequency text,
  evidence_required text,
  owner_id          uuid references public.user_profiles(id) on delete set null,
  department        text,
  is_active         boolean not null default true,
  -- 缺失改善追蹤：發現缺失後填寫，完成後蓋 closed_at。
  corrective_action text,
  due_date          date,
  closed_at         timestamptz,
  created_by        uuid references public.user_profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_internal_control_items_cycle
  on public.internal_control_items(cycle, code);
create index if not exists idx_internal_control_items_open
  on public.internal_control_items(due_date)
  where closed_at is null and corrective_action is not null;

create table if not exists public.internal_control_reviews (
  id           uuid primary key default gen_random_uuid(),
  control_id   uuid not null references public.internal_control_items(id) on delete cascade,
  review_date  date not null default current_date,
  result       text not null default '有效'
               check (result in ('有效', '部分有效', '無效')),
  finding      text,
  evidence_url text,
  reviewed_by  uuid references public.user_profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_internal_control_reviews_control
  on public.internal_control_reviews(control_id, review_date desc);

alter table public.internal_control_items   enable row level security;
alter table public.internal_control_reviews enable row level security;

drop policy if exists internal_control_items_rw on public.internal_control_items;
create policy internal_control_items_rw on public.internal_control_items
  for all to authenticated
  using (private.has_feature_permission('internal-control', 'view'))
  with check (private.has_feature_permission('internal-control', 'edit'));

drop policy if exists internal_control_reviews_rw on public.internal_control_reviews;
create policy internal_control_reviews_rw on public.internal_control_reviews
  for all to authenticated
  using (private.has_feature_permission('internal-control', 'view'))
  with check (private.has_feature_permission('internal-control', 'create'));

-- ---------------------------------------------------------------------------
-- 4. 員工報銷申請
-- ---------------------------------------------------------------------------
create table if not exists public.employee_expense_claims (
  id           uuid primary key default gen_random_uuid(),
  claim_no     text unique,
  applicant_id uuid not null references public.user_profiles(id) on delete restrict,
  expense_date date not null default current_date,
  category     text not null default '交通費',
  description  text,
  amount       numeric not null default 0 check (amount >= 0),
  receipt_url  text,
  -- status 是報銷生命週期；approval_status 由簽核引擎維護，兩者分開。
  status       text not null default 'draft'
               check (status in ('draft', 'submitted', 'approved', 'rejected', 'paid', 'cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_employee_expense_claims_applicant
  on public.employee_expense_claims(applicant_id, created_at desc);
create index if not exists idx_employee_expense_claims_status
  on public.employee_expense_claims(status);

alter table public.employee_expense_claims enable row level security;

-- 本人看得到自己的；會計、HR、管理員看得到全部。
drop policy if exists employee_expense_claims_read on public.employee_expense_claims;
create policy employee_expense_claims_read on public.employee_expense_claims
  for select to authenticated using (
    applicant_id = (select auth.uid())
    or private.current_profile_role() in ('admin', '管理員', 'accountant', 'hr', 'manager')
  );

-- 只能替自己建單，且只有草稿可以改／刪（其餘由簽核鎖定 trigger 擋下）。
drop policy if exists employee_expense_claims_insert on public.employee_expense_claims;
create policy employee_expense_claims_insert on public.employee_expense_claims
  for insert to authenticated
  with check (
    applicant_id = (select auth.uid())
    or private.current_profile_role() in ('admin', '管理員', 'accountant', 'hr')
  );

drop policy if exists employee_expense_claims_update on public.employee_expense_claims;
create policy employee_expense_claims_update on public.employee_expense_claims
  for update to authenticated
  using (
    (applicant_id = (select auth.uid()) and status = 'draft')
    or private.current_profile_role() in ('admin', '管理員', 'accountant', 'hr')
  )
  with check (
    applicant_id = (select auth.uid())
    or private.current_profile_role() in ('admin', '管理員', 'accountant', 'hr')
  );

drop policy if exists employee_expense_claims_delete on public.employee_expense_claims;
create policy employee_expense_claims_delete on public.employee_expense_claims
  for delete to authenticated
  using (
    (applicant_id = (select auth.uid()) and status = 'draft')
    or private.current_profile_role() in ('admin', '管理員')
  );

-- ---------------------------------------------------------------------------
-- 5. 功能權限項目登錄（權限管理頁會自動出現）
-- ---------------------------------------------------------------------------
-- role_permissions 由更早的權限管理 migration 建立；若尚未存在就跳過，不讓本檔失敗。
do $$
begin
  if to_regclass('public.role_permissions') is null then return; end if;
  insert into public.role_permissions
    (role_key, feature_key, can_view, can_create, can_edit, can_delete, can_cost)
  select r.role_key, f.feature_key, true, true, true, false, false
  from (values ('admin'), ('管理員'), ('manager'), ('hr')) as r(role_key),
       (values ('eip'), ('internal-control'), ('expense-claims')) as f(feature_key)
  on conflict do nothing;
end $$;

notify pgrst, 'reload schema';
