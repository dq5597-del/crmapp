-- 設備清單新增「後續追蹤」欄位：跟叫修單分開，用來記錄「還沒發生問題、但排定要回訪／保養」的提醒。
-- 叫修單負責追蹤「已經發生的問題」（故障、報修、送修），這兩個欄位負責追蹤「主動安排的回訪」。

alter table equipment add column if not exists next_follow_up_date date;
alter table equipment add column if not exists follow_up_notes text;

notify pgrst, 'reload schema';
