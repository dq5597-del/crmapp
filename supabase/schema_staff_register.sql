-- 員工註冊：公司註冊碼欄位
-- 執行位置：Supabase Dashboard → SQL Editor
alter table public.system_settings
  add column if not exists staff_register_code text;

notify pgrst, 'reload schema';

-- 使用說明：
-- 1. 到 CRM「系統設定 → 公司設定」填入「員工註冊碼」並儲存。
-- 2. Vercel 需設定 SUPABASE_SERVICE_ROLE_KEY（僅伺服器端，勿加 NEXT_PUBLIC_）。
-- 3. 建議到 Supabase → Authentication → Providers → Email，
--    關閉「Allow new users to sign up」，讓帳號只能經由本系統的註冊 API 建立。
