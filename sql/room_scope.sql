-- 戰情室分室資料：notes / schedules / goals 加 room 欄位
-- 執行位置：Supabase → SQL Editor → 新的空白查詢 → 貼上執行
-- 可重複執行；既有資料一律歸到「業務戰情室」(sales)，不會消失。

alter table public.notes     add column if not exists room text;
alter table public.schedules add column if not exists room text;
alter table public.goals     add column if not exists room text;

-- 既有資料歸屬業務戰情室（只補 null，不覆蓋已設定過的）
update public.notes     set room = 'sales' where room is null;
update public.schedules set room = 'sales' where room is null;
update public.goals     set room = 'sales' where room is null;

-- 預設值：/schedule、/notes 等既有頁面新增時不會帶 room，
-- 給預設值可避免資料變成 null 而在所有戰情室都看不到。
alter table public.notes     alter column room set default 'sales';
alter table public.schedules alter column room set default 'sales';
alter table public.goals     alter column room set default 'sales';

create index if not exists idx_notes_room     on public.notes(room);
create index if not exists idx_schedules_room on public.schedules(room, schedule_date);
create index if not exists idx_goals_room     on public.goals(room);

-- room 值對照（與路由一致）：
--   sales            業務戰情室   /
--   ceo              CEO 戰情室    /ceo
--   chairman         董事長戰情室  /chairman
--   manager          總經理戰情室  /manager
--   dept             經理戰情室    /dept
--   team             業務主任戰情室 /team
--   finance          會計戰情室    /finance
--   finance-team     會計主管戰情室 /finance-team
--   acct-staff       會計人員戰情室 /acct-staff
--   tech-team        工程師戰情室   /tech-team
--   chief-engineer   總工程師戰情室 /chief-engineer
--   senior-engineer  資深工程師戰情室 /senior-engineer
--   hr               人資戰情室    /hr
