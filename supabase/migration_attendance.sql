-- 2026-07-21 上班/下班打卡
-- 在 Supabase SQL Editor 執行（可重複執行）

create table if not exists attendance_records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  work_date   date not null default current_date,
  clock_in    timestamptz,
  clock_out   timestamptz,
  notes       text,
  created_at  timestamptz default now(),
  unique (user_id, work_date)
);

create index if not exists idx_attendance_user_date on attendance_records(user_id, work_date);

alter table attendance_records enable row level security;

drop policy if exists "authenticated users can do all" on attendance_records;
create policy "authenticated users can do all" on attendance_records
  for all to authenticated using (true) with check (true);
