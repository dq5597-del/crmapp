-- 後續追蹤欄位（next_follow_up_date / follow_up_notes）現在可以直接在設備清單上編輯，
-- 每次修改都留一筆紀錄，方便回溯是誰、什麼時候改了追蹤日期或備註。

create table if not exists equipment_followup_log (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  old_date date,
  new_date date,
  old_notes text,
  new_notes text,
  changed_by text,
  changed_at timestamptz not null default now()
);

create index if not exists idx_equipment_followup_log_equipment on equipment_followup_log(equipment_id);
create index if not exists idx_equipment_followup_log_changed_at on equipment_followup_log(changed_at desc);

alter table equipment_followup_log enable row level security;

drop policy if exists "equipment_followup_log_all" on equipment_followup_log;
create policy "equipment_followup_log_all" on equipment_followup_log
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
