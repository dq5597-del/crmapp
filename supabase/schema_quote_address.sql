-- 報價單客戶地址欄位
-- 用途：報價單編輯頁新增「客戶地址」欄位（從客戶資料帶入，可個別修改，與聯絡人/電話同邏輯）。
-- 執行方式：到 Supabase Dashboard → SQL Editor 貼上執行一次即可。

alter table quotes
  add column if not exists client_address text;
