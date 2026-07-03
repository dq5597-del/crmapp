-- 戰情室 KPI 目標值可設定化
-- 用途：讓「有需求客戶」「規劃中客戶」「本月營收」「報價轉換率」的目標值
-- 可以在系統設定頁面調整，不用改程式碼。
-- 執行方式：到 Supabase Dashboard → SQL Editor 貼上執行一次即可。

alter table system_settings
  add column if not exists target_needs_clients integer default 20,
  add column if not exists target_planning_clients integer default 20,
  add column if not exists target_monthly_revenue numeric default 500000,
  add column if not exists target_conversion_rate numeric default 30;
