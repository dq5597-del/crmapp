-- ============================================================
-- 光輝 CRM — 每日行程表 / 行事曆 / 重要日子提醒 Schema
-- 請在執行完 schema.sql 與 schema_additions.sql 之後執行此檔案
-- （2026-07-08 已於 Supabase SQL Editor 執行）
-- ============================================================

-- A. 每日行程：一筆行程同時保存「預定」與「實際」，修改實際不覆蓋預定
create table schedules (
  id              uuid primary key default uuid_generate_v4(),
  schedule_date   date not null default current_date,
  plan_start      time,
  plan_end        time,
  title           text not null,
  type            text not null default '客戶拜訪'
                    check (type in ('客戶拜訪','廠商聯絡','叫修服務','內部作業','其他')),
  plan_notes      text,
  client_id       uuid references clients(id) on delete set null,
  contact_id      uuid references contacts(id) on delete set null,
  vendor_id       uuid references vendors(id) on delete set null,
  is_gap_task     boolean default false,
  gap_due_date    date,
  is_adhoc        boolean default false,
  actual_start    time,
  actual_end      time,
  actual_result   text,
  status          text not null default '未開始'
                    check (status in ('未開始','進行中','已完成','延誤完成','改期','取消')),
  remind_email       boolean default false,
  remind_days_before integer default 0,
  reminder_sent_on   date,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_schedules_date on schedules(schedule_date);
create index idx_schedules_client on schedules(client_id);
create index idx_schedules_vendor on schedules(vendor_id);
create index idx_schedules_status on schedules(status);
create index idx_schedules_gap on schedules(is_gap_task) where is_gap_task = true;

alter table schedules enable row level security;
create policy "authenticated users can do all" on schedules
  for all to authenticated using (true) with check (true);

create trigger t_schedules_updated before update on schedules
  for each row execute function set_updated_at();

-- B. 重要日子：生日 / 週年 / 保固到期 / 合約續約 / 自訂，可每年重複
create table important_dates (
  id                 uuid primary key default uuid_generate_v4(),
  client_id          uuid not null references clients(id) on delete cascade,
  contact_id         uuid references contacts(id) on delete set null,
  title              text not null,
  date_type          text not null default '自訂'
                       check (date_type in ('生日','週年','保固到期','合約續約','自訂')),
  the_date           date not null,
  recurring          boolean default false,
  remind_days_before integer default 3,
  remind_email       boolean default true,
  reminder_sent_on   date,
  is_active          boolean default true,
  notes              text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index idx_important_dates_client on important_dates(client_id);
create index idx_important_dates_date on important_dates(the_date);
create index idx_important_dates_active on important_dates(is_active);

alter table important_dates enable row level security;
create policy "authenticated users can do all" on important_dates
  for all to authenticated using (true) with check (true);

create trigger t_important_dates_updated before update on important_dates
  for each row execute function set_updated_at();

-- C. 每日反省：順利的事 / 不順利的事 / 改善方法
create table daily_reviews (
  id           uuid primary key default uuid_generate_v4(),
  review_date  date unique not null default current_date,
  good_things  text,
  bad_things   text,
  improvements text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table daily_reviews enable row level security;
create policy "authenticated users can do all" on daily_reviews
  for all to authenticated using (true) with check (true);

create trigger t_daily_reviews_updated before update on daily_reviews
  for each row execute function set_updated_at();

-- D. 聯絡人補生日欄位（行事曆自動長出生日，每年重複）
alter table contacts add column if not exists birthday date;
