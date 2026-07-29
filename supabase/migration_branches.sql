-- 2026-07-21 通訊處（人員分區）
-- 在 Supabase SQL Editor 執行（可重複執行）

create table if not exists branches (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  created_at  timestamptz default now()
);

alter table user_profiles
  add column if not exists branch_id uuid references branches(id) on delete set null;

alter table branches enable row level security;
drop policy if exists "authenticated users can do all" on branches;
create policy "authenticated users can do all" on branches
  for all to authenticated using (true) with check (true);
