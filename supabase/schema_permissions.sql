-- ============================================================
-- 功能權限管理（角色為主 + 個人例外）
-- 顆粒度：可看 / 可新增 / 可修改 / 可刪除 / 可看成本毛利
-- 執行位置：Supabase Dashboard → SQL Editor
-- ============================================================

-- ① 角色
create table if not exists public.app_roles (
  key         text primary key,          -- admin / manager / sales / tech / accountant / hr / viewer
  name        text not null,
  description text,
  is_system   boolean not null default false,   -- 系統角色不可刪
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now()
);

insert into public.app_roles (key, name, description, is_system, sort_order) values
  ('admin',      '管理員',   '全部功能，含權限設定',        true,  10),
  ('manager',    '主管',     '除權限設定外的管理權限',      true,  20),
  ('sales',      '業務',     '客戶、報價、專案',            false, 30),
  ('tech',       '技術/工程','專案、叫修、庫存',            false, 40),
  ('accountant', '會計',     '會計、應收應付',              false, 50),
  ('hr',         '人資',     '人資模組',                    false, 60),
  ('viewer',     '唯讀',     '只能看，不能改',              false, 90)
on conflict (key) do nothing;

-- ② 角色權限（每個功能一列）
create table if not exists public.role_permissions (
  role_key    text not null references public.app_roles(key) on delete cascade,
  feature_key text not null,             -- 見前端 FEATURES 清單
  can_view    boolean not null default false,
  can_create  boolean not null default false,
  can_edit    boolean not null default false,
  can_delete  boolean not null default false,
  can_cost    boolean not null default false,   -- 可看成本／毛利／薪資等敏感金額
  updated_at  timestamptz not null default now(),
  primary key (role_key, feature_key)
);

-- ③ 個人例外（覆蓋角色設定；null = 沿用角色）
create table if not exists public.user_permissions (
  user_id     uuid not null references auth.users(id) on delete cascade,
  feature_key text not null,
  can_view    boolean,
  can_create  boolean,
  can_edit    boolean,
  can_delete  boolean,
  can_cost    boolean,
  updated_at  timestamptz not null default now(),
  primary key (user_id, feature_key)
);

-- ④ 讀取「我的有效權限」：角色權限 + 個人例外覆蓋
create or replace function public.my_permissions()
returns table (
  feature_key text,
  can_view boolean, can_create boolean, can_edit boolean, can_delete boolean, can_cost boolean
)
language sql stable security definer set search_path = public as $$
  with me as (
    select coalesce(up.role, 'viewer') as role_key
    from public.user_profiles up
    where up.id = auth.uid()
  ),
  base as (
    select rp.feature_key, rp.can_view, rp.can_create, rp.can_edit, rp.can_delete, rp.can_cost
    from public.role_permissions rp, me
    where rp.role_key = me.role_key
       or me.role_key in ('admin', '管理員')          -- 相容舊資料的中文角色名
  ),
  ov as (
    select * from public.user_permissions where user_id = auth.uid()
  )
  select
    coalesce(b.feature_key, o.feature_key) as feature_key,
    coalesce(o.can_view,   b.can_view,   false),
    coalesce(o.can_create, b.can_create, false),
    coalesce(o.can_edit,   b.can_edit,   false),
    coalesce(o.can_delete, b.can_delete, false),
    coalesce(o.can_cost,   b.can_cost,   false)
  from base b
  full outer join ov o on o.feature_key = b.feature_key;
$$;

grant execute on function public.my_permissions() to authenticated;

-- ⑤ RLS：只有管理員能改權限；所有人可讀自己的
alter table public.app_roles        enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;

drop policy if exists "app_roles_read"  on public.app_roles;
create policy "app_roles_read" on public.app_roles
  for select to authenticated using (true);

drop policy if exists "app_roles_admin" on public.app_roles;
create policy "app_roles_admin" on public.app_roles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "role_perms_read" on public.role_permissions;
create policy "role_perms_read" on public.role_permissions
  for select to authenticated using (true);

drop policy if exists "role_perms_admin" on public.role_permissions;
create policy "role_perms_admin" on public.role_permissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "user_perms_read" on public.user_permissions;
create policy "user_perms_read" on public.user_permissions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_perms_admin" on public.user_permissions;
create policy "user_perms_admin" on public.user_permissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ⑥ 預設權限：管理員全開
insert into public.role_permissions (role_key, feature_key, can_view, can_create, can_edit, can_delete, can_cost)
select 'admin', f, true, true, true, true, true
from unnest(array[
  'ceo','dashboard','projects','clients','vendors','quotes','sales-orders','inquiries',
  'purchase-orders','shipments','inventory','returns','products','receivables','payables',
  'accounting','service-requests','hr-employees','hr-attendance','hr-leaves','hr-payroll',
  'hr-reviews','hr-trainings','hr-contractors','notes','knowledge-base','schedule','settings','permissions'
]) as f
on conflict (role_key, feature_key) do nothing;

-- 主管：除權限設定外全開
insert into public.role_permissions (role_key, feature_key, can_view, can_create, can_edit, can_delete, can_cost)
select 'manager', f, true, true, true, true, true
from unnest(array[
  'ceo','dashboard','projects','clients','vendors','quotes','sales-orders','inquiries',
  'purchase-orders','shipments','inventory','returns','products','receivables','payables',
  'accounting','service-requests','hr-employees','hr-attendance','hr-leaves','hr-payroll',
  'hr-reviews','hr-trainings','hr-contractors','notes','knowledge-base','schedule','settings'
]) as f
on conflict (role_key, feature_key) do nothing;

-- 業務：客戶/報價/專案可寫，看不到成本
insert into public.role_permissions (role_key, feature_key, can_view, can_create, can_edit, can_delete, can_cost)
select 'sales', f, true, true, true, false, false
from unnest(array['dashboard','projects','clients','quotes','sales-orders','notes','schedule','knowledge-base']) as f
on conflict (role_key, feature_key) do nothing;

insert into public.role_permissions (role_key, feature_key, can_view, can_create, can_edit, can_delete, can_cost)
select 'sales', f, true, false, false, false, false
from unnest(array['products','inventory','service-requests','shipments']) as f
on conflict (role_key, feature_key) do nothing;

-- 唯讀角色：什麼都只能看
insert into public.role_permissions (role_key, feature_key, can_view, can_create, can_edit, can_delete, can_cost)
select 'viewer', f, true, false, false, false, false
from unnest(array['dashboard','projects','clients','quotes','products','schedule','knowledge-base']) as f
on conflict (role_key, feature_key) do nothing;

notify pgrst, 'reload schema';
