-- ============================================================
-- 統一角色制度：帳號管理 ←→ 權限管理 使用同一份角色
--
-- 問題：user_profiles.role 原本寫死只允許 admin/manager/user，
--       但權限管理（app_roles）另有 sales/tech/accountant/hr/viewer。
--       導致業務、會計等角色永遠指派不到人身上。
--
-- 解法（非破壞式）：
--   ① 把「一般使用者(user)」也登記進 app_roles，兩邊一致。
--   ② 移除寫死三種的 CHECK，改用觸發器對照 app_roles 驗證
--      （比外鍵安全：不會因既有髒資料而一次性失敗；未來新增角色也自動支援）。
--   既有帳號不受影響，管理員可之後再逐一改派為正確角色。
--
-- 依賴：schema.sql、schema_permissions.sql（app_roles）
-- 執行位置：Supabase Dashboard → SQL Editor
-- 本檔可重複執行（idempotent）
-- ============================================================

-- ① 讓「一般使用者」成為權限系統認得的角色
insert into public.app_roles (key, name, description, is_system, sort_order) values
  ('user', '一般使用者', '基本帳號，權限由管理員在「權限管理」逐項指派', true, 95)
on conflict (key) do nothing;

-- ② 移除原本寫死三種的 CHECK 限制
alter table public.user_profiles drop constraint if exists user_profiles_role_check;

-- ③ 改用觸發器：role 必須是 app_roles 裡存在的角色
create or replace function public.validate_user_role()
returns trigger language plpgsql as $$
begin
  if new.role is null then new.role := 'user'; end if;
  if not exists (select 1 from public.app_roles where key = new.role) then
    raise exception '未知角色：%（請先在權限管理建立此角色）', new.role;
  end if;
  return new;
end $$;

drop trigger if exists t_user_profiles_role_valid on public.user_profiles;
create trigger t_user_profiles_role_valid
  before insert or update of role on public.user_profiles
  for each row execute function public.validate_user_role();

notify pgrst, 'reload schema';

-- ============================================================
-- 執行後：
--   1. 到「帳號管理」把每位業務改派為「業務」、會計改派「會計」…等。
--   2. 改派後，先前的 schema_case_visibility.sql（案件只看自己的）
--      才會真正對業務生效。
-- ============================================================
