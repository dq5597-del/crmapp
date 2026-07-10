-- 訂購單廠商簽名欄位
-- 用途：訂購單送出給廠商後，列印/交付給廠商時可留下簽名欄，
-- 業務收到廠商簽回確認的單子後，把簽署人姓名與日期登錄回系統，作為留存紀錄。
-- 執行方式：到 Supabase Dashboard → SQL Editor 貼上執行一次即可。

alter table purchase_orders add column if not exists signer_name text;
alter table purchase_orders add column if not exists signed_date date;
