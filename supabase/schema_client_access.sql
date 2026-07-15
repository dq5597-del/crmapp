-- ============================================================
-- 客戶資料存取控制：共用可見 + 負責歸屬保護 + 軟刪除
--
-- 目的：解決「業務都要看得到客戶，但不希望被別人誤改／誤刪」。
--
-- 設計原則（目標管理 MBO）：
--   「看」與「動」分離。
--   看：全員共用 —— 利於協作、主管綜覽，也才防得了重複建檔。
--   動（改／刪）：僅「負責業務本人」＋「其主管鏈」＋「管理員」。
--   刪：一律軟刪除（deleted_at），可救回；硬刪除僅管理員。
--
-- 依賴：
--   schema.sql               （clients、created_by）
--   schema_ownership.sql     （clients.owner_id、subordinates_of()）
--   schema_permissions.sql   （public.is_admin()）
--
-- 執行位置：Supabase Dashboard → SQL Editor
-- 本檔可重複執行（idempotent）
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- ① 軟刪除 + 稽核欄位
-- ────────────────────────────────────────────────────────────
alter table clients add column if not exists deleted_at timestamptz;
alter table clients add column if not exists deleted_by uuid references user_profiles(id) on delete set null;
alter table clients add column if not exists updated_by uuid references user_profiles(id) on delete set null;

comment on column clients.deleted_at is '軟刪除時間。非 null 表示已刪除，RLS 會自動隱藏（管理員仍可見以便救回）。';
comment on column clients.deleted_by is '執行軟刪除的人。';
comment on column clients.updated_by is '最後修改人（稽核用）。';

create index if not exists idx_clients_deleted on clients(deleted_at);


-- ────────────────────────────────────────────────────────────
-- ② 新增時自動帶入負責業務 = 自己（前端未指定時）
-- ────────────────────────────────────────────────────────────
create or replace function public.clients_set_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id  is null then new.owner_id  := auth.uid(); end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;

drop trigger if exists t_clients_set_owner on clients;
create trigger t_clients_set_owner before insert on clients
  for each row execute function public.clients_set_owner();


-- ────────────────────────────────────────────────────────────
-- ③ 判斷「我可否管理這位客戶」：本人 / 主管鏈 / 管理員
--    subordinates_of(me) 已含 me 本人，故涵蓋「本人」情況。
-- ────────────────────────────────────────────────────────────
create or replace function public.can_manage_client(client_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.is_admin()
    or client_owner = auth.uid()
    or client_owner in (select user_id from public.subordinates_of(auth.uid()));
$$;
grant execute on function public.can_manage_client(uuid) to authenticated;


-- ────────────────────────────────────────────────────────────
-- ④ 重建 clients 的 RLS：把「do all」拆成 看 / 增 / 改 / 刪
-- ────────────────────────────────────────────────────────────
alter table clients enable row level security;

drop policy if exists "authenticated users can do all" on clients;
drop policy if exists "clients_select" on clients;
drop policy if exists "clients_insert" on clients;
drop policy if exists "clients_update" on clients;
drop policy if exists "clients_delete" on clients;

-- 看：全員可看「未刪除」客戶；管理員另可看已刪除（救回用）
create policy "clients_select" on clients
  for select to authenticated
  using (deleted_at is null or public.is_admin());

-- 增：任何登入者可新增（owner 由 trigger 自動帶成自己）
create policy "clients_insert" on clients
  for insert to authenticated
  with check (true);

-- 改：僅本人 / 主管鏈 / 管理員（軟刪除也是走 update 設 deleted_at）
create policy "clients_update" on clients
  for update to authenticated
  using (public.can_manage_client(owner_id))
  with check (public.can_manage_client(owner_id));

-- 硬刪除：僅管理員。一般人請改用軟刪除（update set deleted_at = now()）
create policy "clients_delete" on clients
  for delete to authenticated
  using (public.is_admin());

notify pgrst, 'reload schema';

-- ============================================================
-- 前端配套（本檔不含，需在 TSX 調整）：
--   1. 刪除鈕改為軟刪除：
--        update clients set deleted_at = now(), deleted_by = <self>, updated_by = <self> where id = ...
--      並在列表／詳情僅對 can_manage 的人顯示刪除鈕（非負責人隱藏或禁用）。
--   2. 修改客戶時一併寫 updated_by = <self>（稽核）。
--   3. 新增同名提醒（不擋）：insert 前
--        select id, company_name, owner_id from clients where company_name ilike '<輸入值>' and deleted_at is null
--      有結果就提示「已有同名客戶（負責業務：X），仍要新增？」。
--   4. 客戶詳情顯示「負責業務」欄位；允許管理員／主管在畫面上「轉派」（update owner_id）。
-- ============================================================
