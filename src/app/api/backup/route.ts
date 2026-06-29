import { NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'

// Tables in dependency order (parents before children)
const BACKUP_TABLES = [
  'system_settings',
  'product_categories',
  'products',
  'vendors',
  'clients',
  'contacts',
  'quotes',
  'quote_items',
  'purchase_orders',
  'purchase_order_items',
  'sales_orders',
  'sales_order_items',
  'payables',
  // user_profiles excluded — auth is managed by Supabase Auth separately
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
      .order('created_at', { ascending: true })
    if (error || !data || data.length === 0) break
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
      backup[table] = await fetchAll(supabase, table)
    } catch (e: any) {
      errors.push(`${table}: ${e.message}`)
      backup[table] = []
    }
  }

  const payload = {
    version: '1.0',
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
