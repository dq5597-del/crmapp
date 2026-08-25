alter table public.product_filter_groups
  add column if not exists numeric_range_presets jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_filter_groups_numeric_range_presets_array'
      and conrelid = 'public.product_filter_groups'::regclass
  ) then
    alter table public.product_filter_groups
      add constraint product_filter_groups_numeric_range_presets_array
      check (jsonb_typeof(numeric_range_presets) = 'array');
  end if;
end
$$;

comment on column public.product_filter_groups.numeric_range_presets is
  'Optional custom numeric filter ranges. An empty array uses the system-generated presets.';
