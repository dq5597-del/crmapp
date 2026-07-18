-- 各單據條款預設值（系統設定 → 公司設定維護）
alter table system_settings add column if not exists sales_payment_terms text;
alter table system_settings add column if not exists sales_bank_account text;
alter table system_settings add column if not exists sales_notes text;
alter table system_settings add column if not exists purchase_payment_terms text;
alter table system_settings add column if not exists purchase_notes text;
alter table system_settings add column if not exists inquiry_notes text;
