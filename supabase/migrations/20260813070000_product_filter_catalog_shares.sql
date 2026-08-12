-- 產品分組標籤、數值規格與消費者型錄分享

create table if not exists public.product_filter_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  input_type text not null default 'multi_select' check (input_type in ('multi_select', 'number')),
  unit text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_filter_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.product_filter_groups(id) on delete cascade,
  name text not null,
  slug text not null,
  aliases text[] not null default '{}',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id, slug),
  unique (group_id, name)
);

create table if not exists public.product_filter_assignments (
  product_id uuid not null references public.products(id) on delete cascade,
  option_id uuid not null references public.product_filter_options(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, option_id)
);

create table if not exists public.product_filter_numbers (
  product_id uuid not null references public.products(id) on delete cascade,
  group_id uuid not null references public.product_filter_groups(id) on delete cascade,
  numeric_value numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, group_id)
);

create table if not exists public.product_catalog_shares (
  id uuid primary key default gen_random_uuid(),
  share_token uuid not null unique default gen_random_uuid(),
  title text not null default '產品型錄',
  message text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.product_catalog_share_items (
  share_id uuid not null references public.product_catalog_shares(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (share_id, product_id)
);

create index if not exists idx_product_filter_options_group on public.product_filter_options(group_id, sort_order);
create index if not exists idx_product_filter_assignments_option on public.product_filter_assignments(option_id, product_id);
create index if not exists idx_product_filter_numbers_group_value on public.product_filter_numbers(group_id, numeric_value);
create index if not exists idx_product_catalog_share_items_product on public.product_catalog_share_items(product_id);
create index if not exists idx_product_catalog_shares_token on public.product_catalog_shares(share_token);

alter table public.product_filter_groups enable row level security;
alter table public.product_filter_options enable row level security;
alter table public.product_filter_assignments enable row level security;
alter table public.product_filter_numbers enable row level security;
alter table public.product_catalog_shares enable row level security;
alter table public.product_catalog_share_items enable row level security;

grant select, insert, update, delete on public.product_filter_groups to authenticated;
grant select, insert, update, delete on public.product_filter_options to authenticated;
grant select, insert, update, delete on public.product_filter_assignments to authenticated;
grant select, insert, update, delete on public.product_filter_numbers to authenticated;
grant select, insert, update, delete on public.product_catalog_shares to authenticated;
grant select, insert, update, delete on public.product_catalog_share_items to authenticated;
grant all on public.product_filter_groups, public.product_filter_options,
  public.product_filter_assignments, public.product_filter_numbers,
  public.product_catalog_shares, public.product_catalog_share_items to service_role;

drop policy if exists product_filter_groups_auth_all on public.product_filter_groups;
create policy product_filter_groups_auth_all on public.product_filter_groups for all to authenticated using (true) with check (true);
drop policy if exists product_filter_options_auth_all on public.product_filter_options;
create policy product_filter_options_auth_all on public.product_filter_options for all to authenticated using (true) with check (true);
drop policy if exists product_filter_assignments_auth_all on public.product_filter_assignments;
create policy product_filter_assignments_auth_all on public.product_filter_assignments for all to authenticated using (true) with check (true);
drop policy if exists product_filter_numbers_auth_all on public.product_filter_numbers;
create policy product_filter_numbers_auth_all on public.product_filter_numbers for all to authenticated using (true) with check (true);
drop policy if exists product_catalog_shares_auth_all on public.product_catalog_shares;
create policy product_catalog_shares_auth_all on public.product_catalog_shares for all to authenticated using (true) with check (true);
drop policy if exists product_catalog_share_items_auth_all on public.product_catalog_share_items;
create policy product_catalog_share_items_auth_all on public.product_catalog_share_items for all to authenticated using (true) with check (true);

insert into public.product_filter_groups (name, slug, input_type, unit, sort_order)
values
  ('使用情境', 'use_case', 'multi_select', null, 10),
  ('產品功能', 'function', 'multi_select', null, 20),
  ('輸入介面', 'input_interface', 'multi_select', null, 30),
  ('安裝方式', 'installation', 'multi_select', null, 40),
  ('適用場地', 'venue', 'multi_select', null, 50),
  ('產品特色', 'feature', 'multi_select', null, 60),
  ('輸出功率', 'output_power', 'number', 'W', 70),
  ('輸入孔數', 'input_count', 'number', '孔', 80),
  ('聲道數', 'channel_count', 'number', '聲道', 90),
  ('阻抗', 'impedance', 'number', 'Ω', 100)
on conflict (slug) do update set
  name = excluded.name,
  input_type = excluded.input_type,
  unit = excluded.unit,
  sort_order = excluded.sort_order;

with seed(group_slug, name, slug, aliases, sort_order) as (
  values
    ('use_case','家庭','home',array['家用'],10), ('use_case','商用','commercial',array[]::text[],20),
    ('use_case','會議','meeting',array['會議室'],30), ('use_case','教學','education',array['教室'],40),
    ('use_case','舞台','stage',array[]::text[],50), ('use_case','戶外','outdoor',array[]::text[],60),
    ('use_case','直播','streaming',array[]::text[],70), ('use_case','卡拉OK','karaoke',array['KTV'],80),
    ('function','擴音','amplification',array[]::text[],10), ('function','混音','mixing',array[]::text[],20),
    ('function','錄音','recording',array[]::text[],30), ('function','藍牙','bluetooth',array['BT'],40),
    ('function','DSP','dsp',array[]::text[],50), ('function','無線傳輸','wireless',array['無線'],60),
    ('input_interface','XLR','xlr',array[]::text[],10), ('input_interface','RCA','rca',array[]::text[],20),
    ('input_interface','6.3mm','jack_6_3',array['6.35mm'],30), ('input_interface','3.5mm','jack_3_5',array[]::text[],40),
    ('input_interface','HDMI','hdmi',array[]::text[],50), ('input_interface','USB','usb',array[]::text[],60),
    ('input_interface','光纖','optical',array['TOSLINK'],70), ('input_interface','Dante','dante',array[]::text[],80),
    ('input_interface','麥克風輸入','mic_input',array[]::text[],90), ('input_interface','網路 RJ45','rj45',array['Ethernet'],100),
    ('installation','桌上型','desktop',array[]::text[],10), ('installation','機架式','rack',array['Rack'],20),
    ('installation','壁掛式','wall_mount',array['壁掛'],30), ('installation','吸頂式','ceiling',array['吸頂'],40),
    ('installation','攜帶式','portable',array['可攜式'],50),
    ('venue','會議室','meeting_room',array[]::text[],10), ('venue','教室','classroom',array[]::text[],20),
    ('venue','宴會廳','banquet_hall',array[]::text[],30), ('venue','餐廳','restaurant',array[]::text[],40),
    ('venue','商店','retail',array[]::text[],50), ('venue','禮堂','auditorium',array[]::text[],60),
    ('venue','戶外空間','outdoor_space',array[]::text[],70),
    ('feature','4K','4k',array[]::text[],10), ('feature','可攜式','portable',array[]::text[],20),
    ('feature','內建效果器','built_in_effects',array[]::text[],30), ('feature','內建擴大機','built_in_amp',array[]::text[],40),
    ('feature','支援機架','rack_ready',array[]::text[],50), ('feature','PoE','poe',array[]::text[],60)
)
insert into public.product_filter_options (group_id, name, slug, aliases, sort_order)
select g.id, seed.name, seed.slug, seed.aliases, seed.sort_order
from seed join public.product_filter_groups g on g.slug = seed.group_slug
on conflict (group_id, slug) do update set
  name = excluded.name,
  aliases = excluded.aliases,
  sort_order = excluded.sort_order;
