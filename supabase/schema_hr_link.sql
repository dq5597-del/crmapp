-- ============================================================
-- 人事檔案 × 系統帳號 連動（2026-07-26）
-- hr_employees.user_id ←→ user_profiles.id
-- 在 Supabase SQL Editor 執行一次即可，可重複執行。
-- ============================================================

-- 1. 確保 user_id 欄位存在（舊版 schema_hr.sql 已建立則略過）
ALTER TABLE public.hr_employees
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- 2. 外鍵：帳號被刪除時，人事檔案保留但解除綁定（人事資料依法須留存）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_employees_user_id_fkey'
  ) THEN
    ALTER TABLE public.hr_employees
      ADD CONSTRAINT hr_employees_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. 一個系統帳號只能綁一筆人事檔案（NULL 不受限，允許多筆無帳號員工）
CREATE UNIQUE INDEX IF NOT EXISTS hr_employees_user_id_uniq
  ON public.hr_employees (user_id)
  WHERE user_id IS NOT NULL;

-- 4. 查詢用索引
CREATE INDEX IF NOT EXISTS hr_employees_status_idx
  ON public.hr_employees (status);

-- ============================================================
-- 選用：把姓名完全相同、且目前都未綁定的帳號與員工自動配對。
-- 執行前請先確認沒有同名同姓的人，確認後再取消註解執行。
-- ============================================================
-- UPDATE public.hr_employees e
-- SET user_id = p.id
-- FROM public.user_profiles p
-- WHERE e.user_id IS NULL
--   AND p.full_name IS NOT NULL
--   AND btrim(e.full_name) = btrim(p.full_name)
--   AND NOT EXISTS (SELECT 1 FROM public.hr_employees x WHERE x.user_id = p.id);

-- 檢查結果
SELECT
  (SELECT count(*) FROM public.hr_employees)                        AS 員工總數,
  (SELECT count(*) FROM public.hr_employees WHERE user_id IS NOT NULL) AS 已綁定帳號,
  (SELECT count(*) FROM public.user_profiles)                       AS 帳號總數,
  (SELECT count(*) FROM public.user_profiles p
     WHERE NOT EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.user_id = p.id)) AS 尚未建人事檔案;
