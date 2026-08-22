-- ============================================================
-- 設備清單（安裝設備登記，供叫修管理搜尋、追蹤保固與維修履歴）
--   前置：schema.sql（clients）、projects_phase1.sql（projects）、
--         project_work_logs.sql（project_work_logs）
--   設計重點：
--     · 客戶必填，專案／派工紀錄／來源報價單皆選填
--       （舊資料或非工程安裝的設備，沒有專案也要能建檔、能搜尋）
--     · 叫修單新增 equipment_id 關聯欄位（選填），
--       一台設備可以對應多張叫修單（一次故障一張單），
--       藉此統計「叫修次數」、列出維修履歴
-- 可重複執行（idempotent）
-- ============================================================

create table if not exists public.equipment (
  id               uuid primary key default gen_random_uuid(),

  client_id        uuid not null references public.clients(id) on delete cascade,
  project_id       uuid references public.projects(id) on delete set null,
  work_log_id      uuid references public.project_work_logs(id) on delete set null,

  brand            text,
  model            text,
  serial_no        text,

  install_location text,                      -- 安裝位置備註（例：舞台左側控制箱）
  installed_date   date,
  warranty_expiry  date,

  notes            text,

  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_equipment_client  on public.equipment(client_id);
create index if not exists idx_equipment_project on public.equipment(project_id);
create index if not exists idx_equipment_serial  on public.equipment(serial_no);

-- 品牌／型號／序號至少要能認出這是哪台設備
alter table public.equipment drop constraint if exists equipment_identity_check;
alter table public.equipment add constraint equipment_identity_check
  check (coalesce(brand,'') <> '' or coalesce(model,'') <> '' or coalesce(serial_no,'') <> '');

create or replace function public.set_equipment_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_equipment_updated_at on public.equipment;
create trigger trg_equipment_updated_at before update on public.equipment
  for each row execute function public.set_equipment_updated_at();

alter table public.equipment enable row level security;
drop policy if exists "equipment_all" on public.equipment;
create policy "equipment_all" on public.equipment
  for all to authenticated using (true) with check (true);

-- ── 叫修單掛回設備（選填，不影響現有沒有設備清單資料的叫修單）──
alter table public.service_requests
  add column if not exists equipment_id uuid references public.equipment(id) on delete set null;

create index if not exists idx_service_requests_equipment on public.service_requests(equipment_id);

-- ── 設備維修履歴彙總 View（叫修次數／最近一次叫修）────────────
create or replace view public.v_equipment_service_stats as
  select
    equipment_id,
    count(*)                as service_count,
    max(reported_date)      as last_reported_date
  from public.service_requests
  where equipment_id is not null
  group by equipment_id;

grant select on public.v_equipment_service_stats to authenticated;

notify pgrst, 'reload schema';
