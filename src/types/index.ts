export type ClientStatus = '有需求' | '規劃中' | '服務未完成' | '已完成' | '暫緩'
export type QuoteStatus = '草稿' | '已確認' | '已轉銷貨單' | '已轉訂購單' | '作廢'
export type ProjectStatus = '規劃中' | '進行中' | '施工中' | '完工' | '暫停' | '取消'
export type SalesOrderStatus = '草稿' | '已確認' | '出貨中' | '已完成' | '取消'
export type PurchaseOrderStatus = '草稿' | '已送出' | '已確認' | '已到貨' | '取消'
export type UserRole = 'admin' | 'manager' | 'user'

export interface Client {
  id: string
  company_name: string
  contact_name: string | null
  appearance: string | null
  phone: string | null
  line_id: string | null
  email: string | null
  address: string | null
  birthday: string | null
  interest: string | null
  dm_provided: boolean
  status: ClientStatus
  service_cycle_months: number | null
  last_service_date: string | null
  next_visit_date: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  client_id: string
  seq_no: number | null
  name: string
  title: string | null
  phone: string | null
  email: string | null
  appearance: string | null
  provided_info: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CompetitorInfo {
  id: string
  client_id: string | null
  company_name: string
  city: string | null
  service_status: string | null
  equipment_age: number | null
  equipment_issues: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface VisitRecord {
  id: string
  client_id: string
  project_id: string | null
  visit_date: string
  photos: string[] | null
  progress_memo: string | null
  special_notes: string | null
  next_action: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  client_id: string
  project_name: string
  status: ProjectStatus
  start_date: string | null
  end_date: string | null
  budget: number | null
  description: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  category_id: string | null
  brand: string | null
  product_name: string
  model: string | null
  unit: string
  list_price: number
  cost_price: number
  stock_qty: number
  catalog_url: string | null
  manual_url: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Quote {
  id: string
  quote_no: string
  client_id: string | null
  project_id: string | null
  project_name: string | null
  contact_name: string | null
  client_phone: string | null
  valid_until: string | null
  delivery_days: number | null
  payment_terms: string | null
  bank_account: string | null
  subtotal: number
  tax_amount: number
  total_amount: number
  notes: string | null
  status: QuoteStatus
  pdf_url: string | null
  source_quote_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Relations
  client?: Client
  items?: QuoteItem[]
}

export interface QuoteItem {
  id: string
  quote_id: string
  seq_no: number
  product_id: string | null
  product_name: string
  model: string | null
  unit: string
  quantity: number
  unit_price: number
  amount: number
  provide_catalog: boolean
  provide_manual: boolean
  item_notes: string | null
  created_at: string
  // Relations
  product?: Product
}

export interface SalesOrder {
  id: string
  order_no: string
  quote_id: string | null
  client_id: string | null
  project_id: string | null
  project_name: string | null
  contact_name: string | null
  client_phone: string | null
  delivery_date: string | null
  delivery_address: string | null
  payment_terms: string | null
  bank_account: string | null
  subtotal: number
  tax_amount: number
  total_amount: number
  notes: string | null
  status: SalesOrderStatus
  pdf_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  client?: Client
  items?: SalesOrderItem[]
}

export interface SalesOrderItem {
  id: string
  order_id: string
  seq_no: number
  product_id: string | null
  product_name: string
  model: string | null
  unit: string
  quantity: number
  unit_price: number
  amount: number
  item_notes: string | null
  created_at: string
}

export interface PurchaseOrder {
  id: string
  order_no: string
  quote_id: string | null
  vendor_name: string
  vendor_contact: string | null
  vendor_phone: string | null
  delivery_date: string | null
  delivery_address: string | null
  payment_terms: string | null
  subtotal: number
  tax_amount: number
  total_amount: number
  notes: string | null
  status: PurchaseOrderStatus
  pdf_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  items?: PurchaseOrderItem[]
}

export interface PurchaseOrderItem {
  id: string
  order_id: string
  seq_no: number
  product_id: string | null
  product_name: string
  model: string | null
  unit: string
  quantity: number
  unit_price: number
  amount: number
  item_notes: string | null
  created_at: string
}

export interface SystemSettings {
  id: string
  company_name: string
  company_phone: string | null
  company_address: string | null
  company_email: string | null
  bank_name: string | null
  bank_account: string | null
  bank_account_name: string | null
  payment_terms: string | null
  delivery_days: number | null
  valid_days: number | null
  quote_notes: string | null
  after_service: string | null
}

export interface UserProfile {
  id: string
  full_name: string | null
  role: UserRole
  is_active: boolean
  created_at: string
}

// ============================================================
// 廠商建檔
// ============================================================
export interface Vendor {
  id: string
  vendor_code: string | null
  company_name: string
  contact_name: string | null
  phone: string | null
  fax: string | null
  email: string | null
  address: string | null
  bank_name: string | null
  bank_account: string | null
  bank_account_name: string | null
  payment_terms: string | null
  payment_day: number | null
  tax_id: string | null
  category: string | null
  notes: string | null
  is_active: boolean
  // 維修部聯絡資訊
  repair_contact: string | null
  repair_phone: string | null
  repair_email: string | null
  repair_address: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// 庫存異動
// ============================================================
export type InventoryTransactionType = '入庫' | '出庫' | '盤盈' | '盤虧' | '退貨入庫' | '報廢'

export interface InventoryTransaction {
  id: string
  product_id: string
  type: InventoryTransactionType
  quantity: number
  quantity_before: number
  quantity_after: number
  unit_cost: number | null
  reference_type: string | null
  reference_id: string | null
  reference_no: string | null
  vendor_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  // Relations
  product?: Product
  vendor?: Vendor
}

// ============================================================
// 應收帳款
// ============================================================
export type ReceivableStatus = '未收' | '部分收款' | '已收清' | '壞帳' | '已開立發票'

export interface Receivable {
  id: string
  receivable_no: string
  sales_order_id: string | null
  client_id: string | null
  invoice_no: string | null
  invoice_date: string | null
  due_date: string | null
  amount: number
  received_amount: number
  balance: number
  status: ReceivableStatus
  payment_method: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Relations
  client?: Client
  sales_order?: SalesOrder
  payment_records?: PaymentRecord[]
}

export interface PaymentRecord {
  id: string
  receivable_id: string
  payment_date: string
  amount: number
  payment_method: string | null
  bank_ref: string | null
  notes: string | null
  created_at: string
}

// ============================================================
// 應付帳款
// ============================================================
export type PayableStatus = '未付' | '部分付款' | '已付清' | '作廢'

export interface Payable {
  id: string
  payable_no: string
  purchase_order_id: string | null
  vendor_id: string | null
  invoice_no: string | null
  invoice_date: string | null
  due_date: string | null
  amount: number
  paid_amount: number
  balance: number
  status: PayableStatus
  payment_method: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Relations
  vendor?: Vendor
  purchase_order?: PurchaseOrder
  payable_payments?: PayablePayment[]
}

export interface PayablePayment {
  id: string
  payable_id: string
  payment_date: string
  amount: number
  payment_method: string | null
  bank_ref: string | null
  notes: string | null
  created_at: string
}

// ============================================================
// 叫修管理
// ============================================================
export type ServiceStatus =
  | '待處理' | '處理中' | '報價中' | '等待客戶確認'
  | '維修中' | '已完成' | '收費中' | '已結案'

export type WarrantyStatus = '保固內' | '保固外' | '非保固'
export type ServiceType = '到府維修' | '送廠維修'
export type CustomerDecision = '確認維修' | '放棄維修'

export interface ServiceRequest {
  id: string
  service_no: string
  track_token: string
  client_id: string | null
  contact_name: string | null
  phone: string | null
  equipment_name: string
  equipment_model: string | null
  serial_no: string | null
  issue_description: string | null
  warranty_status: WarrantyStatus
  warranty_expiry: string | null
  service_type: ServiceType
  assigned_to: string | null
  status: ServiceStatus
  reported_date: string
  closed_date: string | null
  actual_repair_cost: number | null
  payment_confirmed: boolean
  pickup_confirmed: boolean
  close_notes: string | null
  is_closed: boolean
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Relations
  client?: Client
  vendor_repair?: ServiceVendorRepair
  repair_quotes?: ServiceRepairQuote[]
  fees?: ServiceFee
}

export interface ServiceVendorRepair {
  id: string
  service_request_id: string
  vendor_id: string | null
  repair_contact: string | null
  repair_phone: string | null
  repair_email: string | null
  repair_address: string | null
  client_name: string | null
  client_contact: string | null
  client_phone: string | null
  client_email: string | null
  equipment_serial_no: string | null
  condition_note: string | null
  vendor_repair_no: string | null
  vendor_diagnosis: string | null
  vendor_quote_amount: number | null
  estimated_done_date: string | null
  returned_date: string | null
  sent_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
  vendor?: import('./index').Vendor
}

export interface ServiceRepairQuote {
  id: string
  service_request_id: string
  repair_quote_no: string
  client_id: string | null
  contact_name: string | null
  client_phone: string | null
  equipment_name: string | null
  equipment_model: string | null
  serial_no: string | null
  subtotal: number
  tax_amount: number
  total_amount: number
  diagnosis_note: string | null
  estimated_days: number | null
  notes: string | null
  customer_decision: CustomerDecision | null
  decision_date: string | null
  pdf_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  items?: ServiceRepairQuoteItem[]
}

export interface ServiceRepairQuoteItem {
  id: string
  repair_quote_id: string
  seq_no: number
  description: string
  unit: string
  quantity: number
  unit_price: number
  amount: number
  notes: string | null
  created_at: string
}

export interface ServiceFee {
  id: string
  service_request_id: string
  inspection_fee: number
  shipping_fee: number
  total_fee: number
  invoice_no: string | null
  receivable_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}
