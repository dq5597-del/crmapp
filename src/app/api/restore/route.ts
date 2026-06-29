import { NextResponse, NextRequest } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'

// Delete order: children before parents (reverse of backup order)
const DELETE_ORDER = [
  'payables',
  'sales_order_items',
  'sales_orders',
  'purchase_order_items',
  'purchase_orders',
  'quote_items',
  'quotes',
  'contacts',
  'clients',
  'vendors',
  'products',
  'product_categories',
  // system_settings: keep 1 row (update instead of delete+insert)
] as const

// Columns to exclude per table (generated columns, computed fields)
const EXCLUDE_COLUMNS: Record<string, string[]> = {
  quote_items: ['amount'],   // GENERATED column
}

function stripExcluded(table: string, rows: any[]): any[] {
  const excluded = EXCLUDE_COLUMNS[table]
  if (!excluded) return rows
  return rows.map(row => {
    const copy = { ...row }
    excluded.forEach(col => delete copy[col])
    return copy
  })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: '無法解析備份檔案' }, { status: 400 })
  }

  if (!payload?.version || !payload?.data) {
    return NextResponse.json({ error: '備份格式不正確' }, { status: 400 })
  }

  const data: Record<string, any[]> = payload.data
  const log: string[] = []
  const errors: string[] = []

  // ── Step 1: Delete existing data ──────────────────────────────────
  for (const table of DELETE_ORDER) {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (error) errors.push(`刪除 ${table}: ${error.message}`)
    else log.push(`清除 ${table}`)
  }

  // system_settings: delete then re-insert (or update)
  await supabase.from('system_settings').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  log.push('清除 system_settings')

  // ── Step 2: Re-insert in dependency order ─────────────────────────
  const INSERT_ORDER = [
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
  ] as const

  for (const table of INSERT_ORDER) {
    const rows = data[table]
    if (!rows || rows.length === 0) {
      log.push(`跳過 ${table}（無資料）`)
      continue
    }

    const cleaned = stripExcluded(table, rows)

    // Insert in batches of 200 to avoid payload limits
    const BATCH = 200
    let inserted = 0
    for (let i = 0; i < cleaned.length; i += BATCH) {
      const batch = cleaned.slice(i, i + BATCH)
      const { error } = await supabase.from(table).insert(batch)
      if (error) {
        errors.push(`插入 ${table} batch ${i}: ${error.message}`)
        break
      }
      inserted += batch.length
    }
    if (inserted > 0) log.push(`還原 ${table}：${inserted} 筆`)
  }

  return NextResponse.json({
    ok: errors.length === 0,
    log,
    errors,
    restoredFrom: payload.created_at,
  })
}
