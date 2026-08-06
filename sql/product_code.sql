-- ============================================================
-- 公司料號（product_code）2026-08
--   格式：GH-<大類碼3>-<流水4>   例：GH-ENV-0001
--   只綁「大類」不綁小類 —— 小類會調整，料號必須一輩子不變。
--   流水號各大類獨立起算。
--   原廠條碼 barcode 維持獨立欄位（選填），兩者互不影響。
-- 可重複執行（idempotent）
-- ============================================================

alter table public.products add column if not exists product_code text;

-- 料號不可重複（空值不管）
create unique index if not exists uq_products_code
  on public.products(product_code) where product_code is not null;
create index if not exists idx_products_code on public.products(product_code);

-- ── 大類 → 三碼英文 ─────────────────────────────────────────
create or replace function public.gh_category_code(p_main text)
returns text language sql immutable as $$
  select case p_main
    when '智慧環控'             then 'ENV'
    when '會議系統'             then 'CNF'
    when '公共廣播(PA系統)'     then 'PA'
    when '個人影音/配件'        then 'PSN'
    when '專業音響(商用/舞台)'  then 'AUD'
    when '卡拉OK'               then 'KTV'
    when '專業影像設備'         then 'VID'
    else 'GEN'                              -- 未分類／其他
  end
$$;

-- ── 取得下一個料號 ──────────────────────────────────────────
--   前端新增產品選好分類後呼叫，取回建議料號（仍可手改）
create or replace function public.next_product_code(p_category_id uuid default null)
returns text language plpgsql as $$
declare
  v_main   text;
  v_prefix text;
  v_max    int;
begin
  select c.main_category into v_main
  from public.product_categories c where c.id = p_category_id;

  v_prefix := 'GH-' || public.gh_category_code(v_main) || '-';

  -- 取該前綴目前最大流水號（只認符合格式的，人工亂填的略過）
  select coalesce(max(substring(product_code from '(\d{4})$')::int), 0)
    into v_max
  from public.products
  where product_code like v_prefix || '%'
    and product_code ~ ('^' || replace(v_prefix, '-', '\-') || '\d{4}$');

  return v_prefix || lpad((v_max + 1)::text, 4, '0');
end $$;

grant execute on function public.gh_category_code(text)   to authenticated;
grant execute on function public.next_product_code(uuid)  to authenticated;

-- ── 補編既有產品 ────────────────────────────────────────────
--   依大類分組、以建檔時間排序給號；已有料號的不動。
with numbered as (
  select
    p.id,
    'GH-' || public.gh_category_code(c.main_category) || '-' ||
    lpad(row_number() over (
      partition by public.gh_category_code(c.main_category)
      order by p.created_at, p.id
    )::text, 4, '0') as new_code
  from public.products p
  left join public.product_categories c on c.id = p.category_id
  where p.product_code is null
)
update public.products p
   set product_code = n.new_code
  from numbered n
 where p.id = n.id
   and not exists (               -- 極端情況：新號已被人工佔用就跳過
     select 1 from public.products x where x.product_code = n.new_code
   );

notify pgrst, 'reload schema';

-- 驗證：各大類編了幾筆
select
  split_part(product_code, '-', 2) as 大類碼,
  count(*)                          as 數量,
  min(product_code)                 as 起,
  max(product_code)                 as 迄
from public.products
where product_code is not null
group by 1
order by 1;
