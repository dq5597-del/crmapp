-- ============================================================
-- 月度工時確認單（一人一月一張，師傅簽名確認）
--   前置：sql/project_work_logs.sql
--   明細以 jsonb 快照保存 —— 簽名當下看到什麼就存什麼，
--   之後就算原始工時被改，已簽的單據內容也不會變。
-- 可重複執行（idempotent）
-- ============================================================

create table if not exists public.work_hour_confirmations (
  id             uuid primary key default gen_random_uuid(),

  person_name    text not null,                 -- 對應 project_work_logs.name
  period_month   text not null,                 -- 'YYYY-MM'
  member_kind    text,                          -- 員工 / 協力廠商 / 臨時工

  -- 產生當下的彙總快照
  total_hours    numeric(10,2) not null default 0,
  total_cost     numeric(14,2) not null default 0,
  work_days      int           not null default 0,
  project_count  int           not null default 0,
  detail         jsonb         not null default '[]'::jsonb,

  status         text not null default '待簽名'
                   check (status in ('待簽名','已簽名','作廢')),

  sign_token     uuid not null unique default gen_random_uuid(),
  signature_data text,                          -- 簽名 PNG（data URL）
  signer_name    text,
  signed_at      timestamptz,
  sign_note      text,

  void_reason    text,
  notes          text,

  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_whc_month  on public.work_hour_confirmations(period_month);
create index if not exists idx_whc_person on public.work_hour_confirmations(person_name, period_month);
create index if not exists idx_whc_token  on public.work_hour_confirmations(sign_token);

-- 同一人同一月只能有一張有效單（作廢的不算，可重開）
create unique index if not exists uq_whc_person_month
  on public.work_hour_confirmations(person_name, period_month)
  where status <> '作廢';

-- ── updated_at ──────────────────────────────────────────────
create or replace function public.touch_whc()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_whc_touch on public.work_hour_confirmations;
create trigger trg_whc_touch before update on public.work_hour_confirmations
  for each row execute function public.touch_whc();

-- ── 簽名後鎖定：已簽名的人月，工時不可再新增／修改／刪除 ────
--   放在資料庫層而非前端，任何管道都擋得住。
--   要更正時先把該張確認單作廢，改完再重開一張。
create or replace function public.guard_signed_work_log()
returns trigger language plpgsql as $$
declare
  target_name  text;
  target_month text;
begin
  if tg_op = 'DELETE' then
    target_name  := old.name;
    target_month := to_char(old.work_date, 'YYYY-MM');
  else
    target_name  := new.name;
    target_month := to_char(new.work_date, 'YYYY-MM');
  end if;

  if exists (
    select 1 from public.work_hour_confirmations
    where person_name = target_name
      and period_month = target_month
      and status = '已簽名'
  ) then
    raise exception '% 的 % 工時已簽名確認，不可異動。如需更正請先將該月確認單作廢。',
      target_name, target_month;
  end if;

  -- 修改時若把日期或姓名搬到另一個已簽名的人月，同樣要擋
  if tg_op = 'UPDATE' and exists (
    select 1 from public.work_hour_confirmations
    where person_name = old.name
      and period_month = to_char(old.work_date, 'YYYY-MM')
      and status = '已簽名'
  ) then
    raise exception '% 的 % 工時已簽名確認，不可異動。',
      old.name, to_char(old.work_date, 'YYYY-MM');
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_work_logs_guard on public.project_work_logs;
create trigger trg_work_logs_guard
  before insert or update or delete on public.project_work_logs
  for each row execute function public.guard_signed_work_log();

-- ── RLS ─────────────────────────────────────────────────────
alter table public.work_hour_confirmations enable row level security;

-- 後台：登入者可全權操作
drop policy if exists "whc_auth_all" on public.work_hour_confirmations;
create policy "whc_auth_all" on public.work_hour_confirmations
  for all to authenticated using (true) with check (true);

-- 公開簽名頁：未登入者可讀（靠 sign_token 不可猜測來保護，
-- 與出貨追蹤 /track/[token] 同一套模型）
drop policy if exists "whc_public_view" on public.work_hour_confirmations;
create policy "whc_public_view" on public.work_hour_confirmations
  for select to anon using (true);

-- 公開簽名寫入：只開放簽名相關欄位，其餘欄位 anon 改不動。
-- （比照 schema_satisfaction.sql 的做法：欄位級 grant + 限制條件的 policy）
-- 專案的 server client 用的是 anon key 而非 service role，
-- 所以這裡一定要給 anon 權限，API route 才寫得進去。
grant select on public.work_hour_confirmations to anon;
grant update (status, signature_data, signer_name, signed_at, sign_note)
  on public.work_hour_confirmations to anon;

drop policy if exists "whc_public_sign" on public.work_hour_confirmations;
create policy "whc_public_sign" on public.work_hour_confirmations
  for update to anon
  using (status = '待簽名' and signed_at is null)   -- 只有未簽的才可寫
  with check (status = '已簽名');                    -- 且只能改成已簽名

notify pgrst, 'reload schema';
