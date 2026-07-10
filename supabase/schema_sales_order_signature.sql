-- 銷貨單客戶簽名欄位
-- 用途：報價單轉銷貨單後，列印/交付給客戶時可留下簽名欄，
-- 業務收到客戶簽回的單子後，把簽署人姓名與日期登錄回系統，作為留存紀錄。
-- 執行方式：到 Supabase Dashboard → SQL Editor 貼上執行一次即可。

alter table sales_orders add column if not exists signer_name text;
alter table sales_orders add column if not exists signed_date date;
