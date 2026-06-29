-- ============================================================
-- 光輝 CRM — 應付帳款 Schema
-- 請在執行完 schema_additions.sql 之後，再執行此檔案
-- ============================================================

-- ============================================================
-- E. 應付帳款 (Payables)
-- ============================================================
create table payables (
  id                uuid primary key default uuid_generate_v4(),
  payable_no        text unique not null,     -- AP-YYMMDD-001
  purchase_order_id uuid references purchase_orders(id) on delete set null,
  vendor_id         uuid references vendors(id) on delete set null,
  invoice_no        text,                     -- 廠商發票號碼
  invoice_date      date,                     -- 發票日期
  due_date          date,                     -- 應付日期（到期日）
  amount            numeric(14,2) not null default 0,  -- 應付金額
  paid_amount       numeric(14,2) not null default 0,  -- 已付金額
  balance           numeric(14,2) generated always as (amount - paid_amount) stored,
  status            text not null default '未付'
                      check (status in ('未付','部分付款','已付清','作廢')),
  payment_method    text,                     -- 付款方式（現金/匯款/票期）
  notes             text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index idx_payables_vendor      on payables(vendor_id);
create index idx_payables_status      on payables(status);
create index idx_payables_due         on payables(due_date);
create index idx_payables_order       on payables(purchase_order_id);

alter table payables enable row level security;
create policy "authenticated users can do all" on payables
  for all to authenticated using (true) with check (true);

create trigger t_payables_updated before update on payables
  for each row execute function set_updated_at();

-- ============================================================
-- F. 付款明細 (Payable Payment Records)
-- ============================================================
create table payable_payments (
  id              uuid primary key default uuid_generate_v4(),
  payable_id      uuid not null references payables(id) on delete cascade,
  payment_date    date not null default current_date,
  amount          numeric(14,2) not null,
  payment_method  text,                       -- 現金/匯款/票期/信用卡
  bank_ref        text,                       -- 匯款帳號末5碼 or 票據號碼
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now()
);

create index idx_payable_payments_payable on payable_payments(payable_id);

alter table payable_payments enable row level security;
create policy "authenticated users can do all" on payable_payments
  for all to authenticated using (true) with check (true);

-- Trigger：新增付款後自動更新應付帳款 paid_amount 與 status
create or replace function update_payable_on_payment()
returns trigger language plpgsql as $$
declare
  v_payable_id uuid;
  total_paid   numeric;
  total_amount numeric;
  new_status   text;
begin
  -- DELETE 時用 OLD，其餘用 NEW
  if tg_op = 'DELETE' then
    v_payable_id := old.payable_id;
  else
    v_payable_id := new.payable_id;
  end if;

  select coalesce(sum(amount), 0) into total_paid
    from payable_payments where payable_id = v_payable_id;

  select amount into total_amount from payables where id = v_payable_id;

  if total_paid >= total_amount then
    new_status := '已付清';
  elsif total_paid > 0 then
    new_status := '部分付款';
  else
    new_status := '未付';
  end if;

  update payables
    set paid_amount = total_paid, status = new_status, updated_at = now()
    where id = v_payable_id;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger t_payable_payment_update
  after insert or update or delete on payable_payments
  for each row execute function update_payable_on_payment();

-- ============================================================
-- END OF PAYABLES SCHEMA
-- ============================================================
