-- 服務滿意度回饋
-- 用途：讓客戶在叫修單結案後，透過公開追蹤頁面（/track/[token]）填寫滿意度評分與意見。
-- 執行方式：到 Supabase Dashboard → SQL Editor 貼上執行一次即可。

alter table service_requests
  add column if not exists satisfaction_rating integer,
  add column if not exists satisfaction_comment text,
  add column if not exists satisfaction_submitted_at timestamptz;

-- 只開放 satisfaction 相關欄位可被匿名（anon）更新，其餘欄位不受影響
grant update (satisfaction_rating, satisfaction_comment, satisfaction_submitted_at) on service_requests to anon;

drop policy if exists "public can submit satisfaction by token" on service_requests;
create policy "public can submit satisfaction by token" on service_requests
  for update to anon
  using (is_closed = true)
  with check (is_closed = true);
