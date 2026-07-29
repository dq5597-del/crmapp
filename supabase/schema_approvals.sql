-- ============================================================
-- 光輝 CRM — 通用簽核引擎（Approval Engine）
-- 請在執行完 schema.sql 之後執行此檔案
--
-- 設計：多型關聯（doc_type + doc_id）掛到任何單據
-- v1：單關卡核准；表結構已相容未來多關卡串簽
-- 試點：應付帳款（payable）
-- ============================================================

-- ============================================================
-- A. 列舉型別
-- ============================================================
do $$ begin
  create type approval_status_t as enum ('draft','pending','approved','rejected','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_action_t as enum ('submit','approve','reject','cancel');
exception when duplicate_object then null; end $$;

-- ============================================================
-- B. 簽核流程範本（哪種單、什麼條件、走哪條流程）
-- ============================================================
create table if not exists approval_flows (
  id            uuid primary key default uuid_generate_v4(),
  doc_type      text not null,             -- 'payable' | 'quote' | 'price_batch' | 'repair_quote' | 'service_fee'
  name          text not null,             -- 流程名稱，如「應付帳款付款簽核」
  amount_gte    numeric,                   -- 金額 >= 此值才需簽核；NULL = 一律需簽
  is_active     boolean not null default true,
  priority      int not null default 100,  -- 多條流程時，數字小者優先命中
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_approval_flows_doc_type
  on approval_flows(doc_type, is_active, priority);

create trigger t_approval_flows_updated before update on approval_flows
  for each row execute function set_updated_at();

-- ============================================================
-- C. 流程關卡（v1 每條流程一列；未來加列即成多關卡串簽）
-- ============================================================
create table if not exists approval_flow_steps (
  id               uuid primary key default uuid_generate_v4(),
  flow_id          uuid not null references approval_flows(id) on delete cascade,
  step_order       int not null,           -- 1, 2, 3...（v1 只有 1）
  approver_type    text not null check (approver_type in ('user','role')),
  approver_user_id uuid references user_profiles(id) on delete set null,
  approver_role    text,                   -- 'manager' | 'admin' 等（對應 user_profiles.role）
  created_at       timestamptz default now(),
  unique (flow_id, step_order)
);

-- ============================================================
-- D. 簽呈實例（一張單據對應一筆）
-- ============================================================
create table if not exists approval_instances (
  id             uuid primary key default uuid_generate_v4(),
  doc_type       text not null,
  doc_id         uuid not null,
  doc_no         text,                     -- 冗餘存單號，方便列表顯示
  flow_id        uuid references approval_flows(id) on delete set null,
  status         approval_status_t not null default 'pending',
  current_step   int not null default 1,
  submitted_by   uuid references user_profiles(id) on delete set null,
  submitted_at   timestamptz,
  finished_at    timestamptz,
  content_hash   text,                     -- 送簽當下單據內容 SHA-256，防竄改
  amount         numeric,                  -- 冗餘存金額，方便稽核與列表
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (doc_type, doc_id)                -- 一張單同時間只有一筆簽呈
);

create index if not exists idx_approval_instances_status
  on approval_instances(status, current_step);
create index if not exists idx_approval_instances_submitter
  on approval_instances(submitted_by);

create trigger t_approval_instances_updated before update on approval_instances
  for each row execute function set_updated_at();

-- ============================================================
-- E. 簽核紀錄（append-only 稽核軌跡，不可修改/刪除）
-- ============================================================
create table if not exists approval_records (
  id             uuid primary key default uuid_generate_v4(),
  instance_id    uuid not null references approval_instances(id) on delete cascade,
  step_order     int not null default 1,
  action         approval_action_t not null,
  actor_id       uuid references user_profiles(id) on delete set null,
  actor_name     text not null,            -- 冗餘存姓名，人員異動後仍可追溯
  comment        text,
  created_at     timestamptz default now()
);

create index if not exists idx_approval_records_instance
  on approval_records(instance_id, created_at);

-- ============================================================
-- F. RLS：登入者可讀；寫入一律走 API（service role），前端不可直寫
-- ============================================================
alter table approval_flows      enable row level security;
alter table approval_flow_steps enable row level security;
alter table approval_instances  enable row level security;
alter table approval_records    enable row level security;

create policy "authenticated can read flows" on approval_flows
  for select to authenticated using (true);
create policy "authenticated can read steps" on approval_flow_steps
  for select to authenticated using (true);
create policy "authenticated can read instances" on approval_instances
  for select to authenticated using (true);
create policy "authenticated can read records" on approval_records
  for select to authenticated using (true);

-- 沒有 insert/update/delete policy = 前端無法寫入（僅 service role API 可寫）
-- 稽核軌跡再上一道保險：
revoke update, delete on approval_records from authenticated;
revoke update, delete on approval_records from anon;

-- ============================================================
-- G. 業務表掛簽核狀態欄（試點：應付帳款）
--    NULL = 尚未送簽（相容既有資料，不影響現行流程）
-- ============================================================
alter table payables add column if not exists approval_status text
  check (approval_status in ('pending','approved','rejected','cancelled'));

-- 預先為報價單加欄（尚未啟用流程；要啟用時 insert 一條 doc_type='quote' 的 flow 即可）
alter table quotes add column if not exists approval_status text
  check (approval_status in ('pending','approved','rejected','cancelled'));

-- ============================================================
-- H. 預設流程 Seed：應付帳款一律需主管（manager）簽核
--    要改門檻：update approval_flows set amount_gte = 50000 where doc_type='payable';
--    （設 50000 後，未達 5 萬的應付單免簽自動核准）
-- ============================================================
insert into approval_flows (doc_type, name, amount_gte, priority)
select 'payable', '應付帳款付款簽核', null, 100
where not exists (select 1 from approval_flows where doc_type = 'payable');

insert into approval_flow_steps (flow_id, step_order, approver_type, approver_role)
select f.id, 1, 'role', 'manager'
from approval_flows f
where f.doc_type = 'payable'
  and not exists (select 1 from approval_flow_steps s where s.flow_id = f.id);

-- ============================================================
-- END OF APPROVALS SCHEMA
-- ============================================================
