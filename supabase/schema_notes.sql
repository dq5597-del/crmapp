-- ============================================================
-- 業務筆記本（團隊共用筆記，可產生公開分享連結）
-- 執行方式：到 Supabase Dashboard → SQL Editor 貼上執行一次即可。
-- 需先執行過 schema.sql（提供 set_updated_at() 函式與 user_profiles 表）。
-- ============================================================

create table if not exists notes (
  id               uuid primary key default gen_random_uuid(),
  title            text not null default '未命名筆記',
  content          text not null default '',
  pinned           boolean not null default false,
  is_public        boolean not null default false,
  share_token      uuid unique default gen_random_uuid(),
  created_by       uuid references auth.users(id) on delete set null,
  created_by_name  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_notes_updated on notes (pinned desc, updated_at desc);
create index if not exists idx_notes_token on notes (share_token);

alter table notes enable row level security;

drop policy if exists "authenticated users can do all" on notes;
create policy "authenticated users can do all" on notes
  for all to authenticated using (true) with check (true);

-- 公開分享頁：僅允許匿名讀取「已設為分享」的筆記，未分享的筆記不會外洩
drop policy if exists "public can view shared notes" on notes;
create policy "public can view shared notes" on notes
  for select to anon
  using (is_public = true);

drop trigger if exists t_notes_updated on notes;
create trigger t_notes_updated before update on notes
  for each row execute function set_updated_at();
