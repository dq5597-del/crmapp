-- 桌面設備配置圖：產品尺寸欄位 + 專案配置圖表
-- 執行位置：Supabase Dashboard → SQL Editor

-- 1) 產品加寬/深/高（cm），供設備由產品帶入尺寸
alter table public.products
  add column if not exists width_cm  numeric,
  add column if not exists depth_cm  numeric,
  add column if not exists height_cm numeric;

-- 2) 每個專案一張桌面配置圖，data 存 jsonb（room + objects）
create table if not exists public.project_desk_layouts (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  data       jsonb not null default '{"room":{"w":600,"d":400},"objects":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.project_desk_layouts enable row level security;
drop policy if exists "desk_layouts_all" on public.project_desk_layouts;
create policy "desk_layouts_all" on public.project_desk_layouts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
