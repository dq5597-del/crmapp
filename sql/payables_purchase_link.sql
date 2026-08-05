-- 進貨單 → 應付帳款 自動連動所需的欄位與索引
-- 可重複執行（idempotent）。在 Supabase SQL Editor 執行一次即可。

-- 1) 應付帳款連結進貨單（auto-ledger 以此欄位判斷是否已建過）
alter table payables
  add column if not exists purchase_id uuid references purchases(id) on delete set null;

create index if not exists idx_payables_purchase on payables(purchase_id);

-- 2) 同一張進貨單只允許一筆自動應付（防重複補建）
create unique index if not exists uq_payables_purchase
  on payables(purchase_id) where purchase_id is not null;

-- 3) 修補歷史進貨單金額為 0 的資料（由品項重算）
update purchases p
set subtotal = t.amt,
    total_amount = t.amt
from (
  select purchase_id, sum(coalesce(quantity, 0) * coalesce(unit_price, 0)) as amt
  from purchase_items
  group by purchase_id
) t
where p.id = t.purchase_id
  and coalesce(p.total_amount, 0) = 0
  and t.amt > 0;

notify pgrst, 'reload schema';
