-- 光輝行政系統：跨裝置雲端列印佇列（2026-08）
create extension if not exists pgcrypto;

create table if not exists public.print_printers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  windows_printer_name text not null,
  branch_id uuid references public.branches(id) on delete set null,
  purpose text not null default 'warranty_label',
  label_width_mm numeric(6,2) not null default 80,
  label_height_mm numeric(6,2) not null default 40,
  device_token_hash text not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_printers_size_check check (label_width_mm > 0 and label_height_mm > 0)
);

create unique index if not exists print_printers_branch_default_uq
  on public.print_printers (coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), purpose)
  where is_default and is_active;
create index if not exists print_printers_branch_idx on public.print_printers(branch_id) where is_active;

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  printer_id uuid not null references public.print_printers(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete set null,
  source_type text not null default 'sales_order',
  source_id uuid,
  order_no text,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending','processing','printed','failed','cancelled')),
  requested_by uuid not null references public.user_profiles(id) on delete restrict,
  reprint_of uuid references public.print_jobs(id) on delete set null,
  attempts integer not null default 0 check (attempts >= 0),
  error_message text,
  claimed_at timestamptz,
  printed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists print_jobs_claim_idx
  on public.print_jobs(printer_id, created_at) where status = 'pending';
create index if not exists print_jobs_branch_created_idx on public.print_jobs(branch_id, created_at desc);
create index if not exists print_jobs_requested_by_idx on public.print_jobs(requested_by, created_at desc);

alter table public.print_printers enable row level security;
alter table public.print_jobs enable row level security;

grant select on public.print_printers, public.print_jobs to authenticated;
grant all on public.print_printers, public.print_jobs to service_role;

drop policy if exists print_printers_visible on public.print_printers;
create policy print_printers_visible on public.print_printers for select to authenticated
using (
  exists (
    select 1 from public.user_profiles me
    where me.id = (select auth.uid())
      and (
        me.role in ('admin','管理員')
        or me.title in ('董事長','CEO')
        or print_printers.branch_id is null
        or print_printers.branch_id = me.branch_id
      )
  )
);

drop policy if exists print_jobs_visible on public.print_jobs;
create policy print_jobs_visible on public.print_jobs for select to authenticated
using (
  requested_by = (select auth.uid())
  or exists (
    select 1 from public.user_profiles me
    where me.id = (select auth.uid())
      and (
        me.role in ('admin','管理員')
        or me.title in ('董事長','CEO')
        or (me.branch_id is not null and print_jobs.branch_id = me.branch_id)
      )
  )
);
