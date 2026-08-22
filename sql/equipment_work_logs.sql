-- 設備可能是好幾個點工一起裝的，原本 equipment.work_log_id 只能存一筆，
-- 改用關聯表讓一台設備可以連結多筆派工紀錄（多個點工）。
-- equipment.work_log_id 欄位保留（舊資料相容），但新增/編輯畫面之後改用這張表。

create table if not exists equipment_work_logs (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  work_log_id uuid not null references project_work_logs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (equipment_id, work_log_id)
);

create index if not exists idx_equipment_work_logs_equipment on equipment_work_logs(equipment_id);
create index if not exists idx_equipment_work_logs_worklog on equipment_work_logs(work_log_id);

alter table equipment_work_logs enable row level security;

drop policy if exists "equipment_work_logs_all" on equipment_work_logs;
create policy "equipment_work_logs_all" on equipment_work_logs
  for all to authenticated using (true) with check (true);

-- 把舊資料（equipment.work_log_id 單筆）搬進新的關聯表，之後畫面就不會漏掉既有的點工紀錄
insert into equipment_work_logs (equipment_id, work_log_id)
select id, work_log_id from equipment
where work_log_id is not null
on conflict (equipment_id, work_log_id) do nothing;

notify pgrst, 'reload schema';
