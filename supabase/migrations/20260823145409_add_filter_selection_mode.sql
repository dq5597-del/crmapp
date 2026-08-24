alter table public.product_filter_groups
  add column if not exists selection_mode text not null default 'multiple';

alter table public.product_filter_groups
  drop constraint if exists product_filter_groups_selection_mode_check;

alter table public.product_filter_groups
  add constraint product_filter_groups_selection_mode_check
  check (selection_mode in ('single', 'multiple'));

comment on column public.product_filter_groups.selection_mode is
  'Controls whether the catalog selector accepts one or many selected values within this filter group.';
