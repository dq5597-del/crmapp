-- 每位客戶可保存自己的 Google Drive 資料夾位置。
-- 既有客戶維持 null，第一次開啟時會建立／尋找預設路徑並自動寫回。
alter table public.clients
  add column if not exists drive_folder_id text,
  add column if not exists drive_folder_path text,
  add column if not exists drive_folder_custom boolean not null default false;

comment on column public.clients.drive_folder_id is 'Google Drive folder ID assigned to this client.';
comment on column public.clients.drive_folder_path is 'Human-readable Google Drive path for this client folder.';
comment on column public.clients.drive_folder_custom is 'True when the folder was manually assigned instead of the default client path.';
