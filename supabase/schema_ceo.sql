-- ============================================================
-- CEO 戰情室：現金預估、業務漏斗、毛利分析、庫存週轉
-- 執行位置：Supabase Dashboard → SQL Editor
-- ============================================================

-- ① 現金水位（手動維護，用於現金流預估的期初值）
alter table public.system_settings
  add column if not exists cash_balance        numeric(14,2) default 0,   -- 目前銀行/現金餘額
  add column if not exists cash_safety_line    numeric(14,2) default 0,   -- 安全水位（低於此值亮紅燈）
  add column if not exists cash_balance_date   date;                      -- 餘額更新日

-- ② 業務漏斗：報價單加勝率與預計結案日
alter table public.quotes
  add column if not exists win_probability     integer,                   -- 10/30/50/70/90 (%)
  add column if not exists expected_close_date date;

-- ③ 專案毛利：叫修單可指定所屬專案（維修成本回掛）
alter table public.service_requests
  add column if not exists project_id uuid references public.projects(id) on delete set null;
create index if not exists idx_service_requests_project on public.service_requests(project_id);

-- ④ 專案毛利：專案記錄實際收入與設備成本（可由報價/銷貨帶入，也可手填）
alter table public.projects
  add column if not exists revenue        numeric(14,2),   -- 專案收入（未填則用 budget）
  add column if not exists equipment_cost numeric(14,2);   -- 設備成本

-- ⑤ 呆滯庫存判定用：產品最後異動日 view
create or replace view public.v_inventory_aging as
  select
    p.id,
    p.brand,
    p.product_name,
    p.model,
    p.unit,
    coalesce(p.stock_qty, 0)                                    as stock_qty,
    coalesce(p.cost_price, 0)                                   as cost_price,
    coalesce(p.list_price, 0)                                   as list_price,
    coalesce(p.stock_qty, 0) * coalesce(p.cost_price, 0)        as stock_value,
    t.last_move_at,
    case
      when t.last_move_at is null then null
      else (current_date - t.last_move_at::date)
    end                                                          as days_since_move
  from public.products p
  left join (
    select product_id, max(created_at) as last_move_at
    from public.inventory_transactions
    group by product_id
  ) t on t.product_id = p.id
  where coalesce(p.is_active, true);

grant select on public.v_inventory_aging to authenticated;

notify pgrst, 'reload schema';
