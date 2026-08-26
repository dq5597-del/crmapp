-- 補齊 system_settings 缺少的欄位
-- 原因：系統設定頁面（/settings）表單早就做了「銷貨單預設值」「進貨/詢價預設備註」「業務目標」
-- 等欄位，但資料庫的 system_settings 資料表其實從未真的加上這些欄位。儲存時前端會先整包送出，
-- 失敗後自動重試並「悄悄拿掉」這些不存在的欄位再存一次，畫面上仍顯示「已儲存」，
-- 導致使用者以為存好了，實際上這些欄位從來沒有真的寫進資料庫——
-- 這就是銷貨單／報價單的「預設匯款帳號」一直帶不進去的原因。
-- 執行方式：到 Supabase Dashboard → SQL Editor 貼上整段執行一次即可，可重複執行不會出錯。

alter table system_settings
  add column if not exists staff_register_code text,
  add column if not exists sales_payment_terms text,
  add column if not exists sales_bank_account text,
  add column if not exists sales_notes text,
  add column if not exists purchase_payment_terms text,
  add column if not exists purchase_notes text,
  add column if not exists inquiry_notes text,
  add column if not exists target_needs_clients integer default 20,
  add column if not exists target_planning_clients integer default 20,
  add column if not exists target_monthly_revenue numeric default 500000,
  add column if not exists target_conversion_rate numeric default 30,
  add column if not exists product_web_fields_expanded boolean default false,
  add column if not exists default_note_items jsonb default '[]'::jsonb;

notify pgrst, 'reload schema';
