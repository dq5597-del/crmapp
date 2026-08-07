-- ============================================================
-- 料號重編（一次性修正）2026-08
--
--   狀況：先前跑到舊版 product_code.sql，
--         分類未合併、編碼表只有 7 個大類，導致 241 筆誤歸 GEN。
--
--   本腳本會「清空所有料號後重編」。
--   只在料號剛產生、尚未印標籤／尚未對外使用時執行。
--   若已有人工指定的料號，先停下來，不要跑這支。
-- ============================================================

-- ── 0. 執行前確認：目前料號分布 ─────────────────────────────
select '重編前' as 階段, split_part(product_code,'-',2) as 大類碼, count(*)
from public.products where product_code is not null
group by 2 order by 3 desc;

-- ── 1. 清空料號 ─────────────────────────────────────────────
update public.products set product_code = null where product_code is not null;


-- ════════════════════════════════════════════════════════════
-- 2. 分類清理（舊版沒做這段）
-- ════════════════════════════════════════════════════════════

-- 2-1. WiiM 串流播放器歸個人影音（唯一的家用品項）
update public.products p
   set category_id = t.id
  from public.product_categories s, public.product_categories t
 where p.category_id = s.id
   and s.main_category = '音響'
   and s.sub_category  = '訊源'
   and t.main_category = '個人影音/配件'
   and t.sub_category  = '媒體播放器';

-- 2-2. 合併重複大類：改 product_categories.main_category，不動 products
do $$
declare
  m record;
begin
  for m in
    select * from (values
      ('音響',  '專業音響(商用/舞台)'),
      ('影像',  '專業影像設備'),
      ('控制',  '智慧環控')
    ) as v(src, dst)
  loop
    update public.products p
       set category_id = t.id
      from public.product_categories s, public.product_categories t
     where p.category_id = s.id
       and s.main_category = m.src
       and t.main_category = m.dst
       and t.sub_category  = s.sub_category;

    delete from public.product_categories s
     where s.main_category = m.src
       and exists (
         select 1 from public.product_categories t
          where t.main_category = m.dst and t.sub_category = s.sub_category
       );

    update public.product_categories
       set main_category = m.dst
     where main_category = m.src;
  end loop;
end $$;

-- 2-3. 移除測試資料
do $$
begin
  begin
    delete from public.products
     where category_id in (
       select id from public.product_categories where main_category = '測試大分類'
     );
  exception when foreign_key_violation then
    update public.products
       set category_id = null, is_active = false
     where category_id in (
       select id from public.product_categories where main_category = '測試大分類'
     );
    raise notice '測試產品已被單據引用，改為停用並脫離分類';
  end;
  delete from public.product_categories where main_category = '測試大分類';
end $$;


-- ════════════════════════════════════════════════════════════
-- 3. 重建編碼表（完整 12 個大類）
-- ════════════════════════════════════════════════════════════
create or replace function public.gh_category_code(p_main text)
returns text language sql immutable as $$
  select case p_main
    when '公共廣播(PA系統)'     then 'PA'
    when '專業音響(商用/舞台)'  then 'AUD'
    when '會議系統'             then 'CNF'
    when '專業影像設備'         then 'VID'
    when '智慧環控'             then 'ENV'
    when '個人影音/配件'        then 'PSN'
    when '卡拉OK'               then 'KTV'
    when '周邊配件'             then 'ACC'
    when '資訊設備'             then 'IT'
    when '燈具相關'             then 'LGT'
    when '其他服務項目'         then 'SVC'
    when '軟體'                 then 'SFT'
    else 'GEN'
  end
$$;

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

  select coalesce(max(substring(product_code from '(\d+)$')::int), 0)
    into v_max
  from public.products
  where product_code like v_prefix || '%'
    and product_code ~ ('^' || replace(v_prefix, '-', '\-') || '\d{4,5}$');

  return v_prefix || lpad((v_max + 1)::text, 4, '0');
end $$;

grant execute on function public.gh_category_code(text)  to authenticated;
grant execute on function public.next_product_code(uuid) to authenticated;


-- ════════════════════════════════════════════════════════════
-- 4. 重新編號
-- ════════════════════════════════════════════════════════════
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
 where p.id = n.id;

notify pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════
-- 5. 驗收
-- ════════════════════════════════════════════════════════════
select
  split_part(product_code, '-', 2) as 大類碼,
  count(*)                          as 數量,
  min(product_code)                 as 起,
  max(product_code)                 as 迄
from public.products
where product_code is not null
group by 1
order by 數量 desc;
