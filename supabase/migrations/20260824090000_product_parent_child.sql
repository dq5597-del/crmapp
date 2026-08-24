-- 產品主／子商品關聯。既有產品全部保留並視為主商品。
alter table public.products
  add column if not exists product_type text not null default 'main',
  add column if not exists parent_product_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_product_type_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_product_type_check
      check (product_type in ('main', 'child'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_parent_product_id_fkey'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_parent_product_id_fkey
      foreign key (parent_product_id)
      references public.products(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_parent_child_shape_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_parent_child_shape_check
      check (
        (product_type = 'main' and parent_product_id is null)
        or (product_type = 'child' and parent_product_id is not null)
      );
  end if;
end
$$;

create index if not exists idx_products_parent_product_id
  on public.products(parent_product_id)
  where parent_product_id is not null;

create or replace function public.validate_product_parent_child()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_type text;
begin
  if new.product_type = 'main' then
    if new.parent_product_id is not null then
      raise exception '主商品不可指定上層主商品';
    end if;

    return new;
  end if;

  if new.parent_product_id is null then
    raise exception '子商品必須指定主商品';
  end if;

  if new.parent_product_id = new.id then
    raise exception '商品不可將自己設為主商品';
  end if;

  select product_type
    into parent_type
    from public.products
   where id = new.parent_product_id;

  if parent_type is distinct from 'main' then
    raise exception '子商品只能連結主商品，不可連結另一個子商品';
  end if;

  if exists (
    select 1
      from public.products child
     where child.parent_product_id = new.id
       and child.id <> new.id
  ) then
    raise exception '已有子商品的產品不可改成子商品';
  end if;

  return new;
end
$$;

drop trigger if exists products_validate_parent_child on public.products;
create trigger products_validate_parent_child
before insert or update of product_type, parent_product_id
on public.products
for each row
execute function public.validate_product_parent_child();

revoke execute on function public.validate_product_parent_child() from public, anon, authenticated;

comment on column public.products.product_type is '產品層級：main 主商品、child 子商品';
comment on column public.products.parent_product_id is '子商品所屬主商品；主商品為 null';
