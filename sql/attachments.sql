-- 附件欄位：任務清單（todos）與交辦任務（assigned_tasks）
-- 執行位置：Supabase → SQL Editor → New query → 貼上執行
-- 可重複執行（IF NOT EXISTS），不會影響既有資料。

alter table public.todos
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.assigned_tasks
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- attachments 結構（前端 AttachmentBox 寫入）：
-- [
--   {
--     "url":  "https://xxx.supabase.co/storage/v1/object/public/chat-files/todos/...",
--     "name": "現場照片.jpg",        -- 原始檔名（可含中文，僅供顯示）
--     "type": "image/jpeg",
--     "size": 234567,
--     "path": "todos/1754...jpg"     -- storage object key，刪除時用
--   }
-- ]
--
-- 實體檔案存放於既有 bucket `chat-files`，以資料夾前綴區分模組：
--   todos/            任務清單附件
--   assigned-tasks/   交辦任務附件
-- 沿用既有 bucket 是為了直接繼承已驗證可用的 storage policy，
-- 日後若要獨立權限，再建 task-files bucket 並搬移即可。
