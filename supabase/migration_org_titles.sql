-- 2026-07-21 組織層級：職稱 + 上級主管（群組樹）
-- 在 Supabase SQL Editor 執行（可重複執行）

alter table user_profiles
  add column if not exists title text default '員工',
  add column if not exists manager_id uuid references user_profiles(id) on delete set null;

create index if not exists idx_user_profiles_manager on user_profiles(manager_id);
