-- 操作稽核紀錄基礎建設
-- 用途：記錄客戶、報價單、銷貨單、應收／應付帳款、叫修單的新增／修改／刪除，
-- 供系統設定 →「稽核紀錄」分頁查閱（僅管理員可見）。
-- 執行方式：到 Supabase Dashboard → SQL Editor 貼上執行一次即可。

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null, -- INSERT / UPDATE / DELETE
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create index if not exists idx_audit_logs_changed_at on audit_logs (changed_at desc);
create index if not exists idx_audit_logs_table_name on audit_logs (table_name);

alter table audit_logs enable row level security;

drop policy if exists "authenticated can read audit logs" on audit_logs;
create policy "authenticated can read audit logs" on audit_logs
  for select to authenticated using (true);

-- 寫入僅透過下方 trigger function（security definer），一般使用者不可直接寫入 audit_logs。

create or replace function audit_trigger_func() returns trigger
language plpgsql security definer as $$
begin
  if (tg_op = 'DELETE') then
    insert into audit_logs(table_name, record_id, action, changed_by, old_data)
    values (tg_table_name, old.id, tg_op, auth.uid(), to_jsonb(old));
    return old;
  elsif (tg_op = 'UPDATE') then
    insert into audit_logs(table_name, record_id, action, changed_by, old_data, new_data)
    values (tg_table_name, new.id, tg_op, auth.uid(), to_jsonb(old), to_jsonb(new));
    return new;
  elsif (tg_op = 'INSERT') then
    insert into audit_logs(table_name, record_id, action, changed_by, new_data)
    values (tg_table_name, new.id, tg_op, auth.uid(), to_jsonb(new));
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists audit_clients on clients;
create trigger audit_clients after insert or update or delete on clients
  for each row execute function audit_trigger_func();

drop trigger if exists audit_quotes on quotes;
create trigger audit_quotes after insert or update or delete on quotes
  for each row execute function audit_trigger_func();

drop trigger if exists audit_sales_orders on sales_orders;
create trigger audit_sales_orders after insert or update or delete on sales_orders
  for each row execute function audit_trigger_func();

drop trigger if exists audit_receivables on receivables;
create trigger audit_receivables after insert or update or delete on receivables
  for each row execute function audit_trigger_func();

drop trigger if exists audit_payables on payables;
create trigger audit_payables after insert or update or delete on payables
  for each row execute function audit_trigger_func();

drop trigger if exists audit_service_requests on service_requests;
create trigger audit_service_requests after insert or update or delete on service_requests
  for each row execute function audit_trigger_func();
