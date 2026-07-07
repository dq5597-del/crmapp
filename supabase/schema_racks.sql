-- ============================================================
-- 專案機櫃設計模擬圖（Rack Designer）
-- 在 Supabase Dashboard → SQL Editor 執行此檔
-- ============================================================

-- 機櫃主檔（一個專案可多個機櫃）
create table if not exists project_racks (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid not null references projects(id) on delete cascade,
  rack_name   text default '機櫃 1',
  total_u     smallint not null default 42 check (total_u between 1 and 60),
  sort_order  integer default 0,
  created_at  timestamptz default now()
);

create index if not exists idx_project_racks_project on project_racks(project_id);

-- 機櫃內設備（start_u 為設備底部所在 U，由下往上編號，佔 u_size 個 U）
create table if not exists project_rack_items (
  id              uuid primary key default uuid_generate_v4(),
  rack_id         uuid not null references project_racks(id) on delete cascade,
  product_id      uuid references products(id) on delete set null,
  label           text not null,
  u_size          smallint not null default 1 check (u_size between 1 and 20),
  start_u         smallint not null default 1 check (start_u >= 1),
  equipment_type  text default 'audio',
  notes           text default '',
  created_at      timestamptz default now()
);

create index if not exists idx_project_rack_items_rack on project_rack_items(rack_id);

alter table project_racks enable row level security;
alter table project_rack_items enable row level security;

drop policy if exists "auth all on project_racks" on project_racks;
create policy "auth all on project_racks" on project_racks
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all on project_rack_items" on project_rack_items;
create policy "auth all on project_rack_items" on project_rack_items
  for all to authenticated using (true) with check (true);
