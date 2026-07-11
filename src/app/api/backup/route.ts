import { NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'

// 依相依順序（父表在前，子表在後）—— 新增功能時記得把資料表加進來
const BACKUP_TABLES = [
  // 設定與主檔
  'system_settings',
  'app_roles',
  'role_permissions',
  'user_permissions',
  'user_profiles',
  'product_categories',
  'products',
  'product_features',
  'product_images',
  'product_downloads',
  'product_vendors',
  'market_prices',
  'vendors',
  'clients',
  'contacts',
  'competitor_info',
  'important_dates',
  'visit_records',

  // 業務單據
  'quotes',
  'quote_items',
  'inquiries',
  'inquiry_items',
  'purchase_orders',
  'purchase_order_items',
  'sales_orders',
  'sales_order_items',
  'shipments',
  'shipment_items',
  'returns',
  'return_items',
  'inventory_transactions',

  // 專案
  'projects',
  'project_crew',
  'project_files',
  'project_photos',
  'project_equipment_markers',
  'project_desk_layouts',
  'project_racks',
  'project_rack_items',
  'site_surveys',

  // 服務／叫修
  'service_requests',
  'service_vendor_repairs',
  'service_repair_quotes',
  'service_repair_quote_items',

  // 財務
  'receivables',
  'payment_records',
  'payables',
  'payable_payments',

  // 會計
  'accounting_income',
  'accounting_income_categories',
  'accounting_expenses',
  'accounting_expense_categories',
  'balance_sheet_accounts',
  'cash_flow_accounts',
  'cash_flow_settings',
  'equity_changes_accounts',
  'equity_changes_beginning',

  // 人資
  'hr_employees',
  'hr_contractors',
  'hr_attendance',
  'hr_leaves',
  'hr_leave_balances',
  'hr_payroll_settings',
  'hr_payrolls',
  'hr_reviews',
  'hr_trainings',

  // 其他
  'knowledge_base',
  'notes',
  'schedules',
  'daily_reviews',
  'document_signatures',
] as const

// Fetch all rows with pagination (Supabase default limit is 1000)
async function fetchAll(supabase: any, table: string): Promise<any[]> {
  const rows: any[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

export async function GET() {
  const supabase = createClient()

  const backup: Record<string, any[]> = {}
  const errors: string[] = []

  for (const table of BACKUP_TABLES) {
    try {
      const rows = await fetchAll(supabase, table)
      backup[table] = rows
    } catch (e: any) {
      errors.push(`${table}: ${e.message ?? '讀取失敗（可能是資料表不存在或無權限）'}`)
      backup[table] = []
    }
  }

  // 每張表幾筆 —— 方便你一眼確認備份是否完整
  const counts: Record<string, number> = {}
  let total = 0
  for (const [t, rows] of Object.entries(backup)) {
    counts[t] = rows.length
    total += rows.length
  }

  const payload = {
    version: '2.0',
    summary: { total_rows: total, table_count: BACKUP_TABLES.length, counts },
    created_at: new Date().toISOString(),
    app: 'CRM-光輝影音科技',
    tables: BACKUP_TABLES,
    data: backup,
    errors,
  }

  const json = JSON.stringify(payload, null, 2)
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  return new NextResponse(json, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="crm-backup-${date}.json"`,
    },
  })
}
