-- ============================================================
-- 單據分享用 Storage bucket（shared-docs）
-- 在 Supabase Dashboard → SQL Editor 執行此檔
-- ============================================================
-- 用途：
--   桌機版 LINE 不接受檔案分享（LINE for Windows 未註冊 file share target），
--   因此改為把 PDF 上傳到此 bucket，再產生 7 天限時簽章連結傳給客戶。
--
-- ⚠ 與 project-files 不同，此 bucket 必須是 **private**：
--   單據含報價、成本與客戶資訊，只能透過簽章連結存取，不可公開列舉。
-- ============================================================

-- 1. 建立 Storage bucket（private）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shared-docs',
  'shared-docs',
  false,                        -- ⚠ 必須 false，靠簽章連結授權
  20971520,                     -- 20 MB per file
  array['application/pdf']      -- 只允許 PDF
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = 20971520,
      allowed_mime_types = array['application/pdf'];

-- 2. Storage RLS 政策
--    只有登入同仁可以上傳與簽章；未登入的客戶靠簽章連結讀取（不走 RLS）。

drop policy if exists "auth upload shared-docs" on storage.objects;
create policy "auth upload shared-docs"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'shared-docs');

-- createSignedUrl 需要呼叫者對該物件有 select 權限
drop policy if exists "auth read shared-docs" on storage.objects;
create policy "auth read shared-docs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'shared-docs');

drop policy if exists "auth delete shared-docs" on storage.objects;
create policy "auth delete shared-docs"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'shared-docs');

-- ⚠ 刻意「不」建立 anon 的 select 政策 —— 未登入者只能靠簽章連結存取。

-- ============================================================
-- 3. 定期清理（建議）
-- ============================================================
-- 簽章連結 7 天到期，但檔案本身會一直留著佔空間。
-- 建議在 Supabase Dashboard → Database → Cron 建立每週排程清掉 30 天前的檔案：
--
--   select
--     net.http_delete(
--       url := current_setting('app.settings.supabase_url') || '/storage/v1/object/shared-docs/' || name,
--       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_key'))
--     )
--   from storage.objects
--   where bucket_id = 'shared-docs'
--     and created_at < now() - interval '30 days';
--
-- 或更簡單：在 Dashboard → Storage → shared-docs 手動定期清理。
