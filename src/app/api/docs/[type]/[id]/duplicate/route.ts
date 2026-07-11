import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * POST /api/docs/[type]/[id]/duplicate
 *
 * 通用單據複製：主檔整列複製（schema-agnostic，欄位增減不用改這支），
 * 單號重新產生、日期改今天、狀態回到初始值，品項一併複製到新單。
 *
 * 支援 type：sales-orders / purchase-orders / service-requests / projects
 */

type Cfg = {
  table: string
  noField?: string          // 單號欄位
  prefix?: string           // 單號前綴（如 SO-）
  itemTable?: string        // 品項表
  itemFk?: string           // 品項表指向主檔的外鍵
  dateFields?: string[]     // 要改成今天的日期欄位
  resetStatus?: string      // 複製後的狀態
  clearFields?: string[]    // 要清空成 null 的欄位（token、結案日期等）
  falseFields?: string[]    // 要設回 false 的布林欄位
  nameField?: string        // 沒有單號的（專案）→ 名稱加「(複製)」
}

const CONFIG: Record<string, Cfg> = {
  'sales-orders': {
    table: 'sales_orders',
    noField: 'order_no',
    prefix: 'SO-',
    itemTable: 'sales_order_items',
    itemFk: 'order_id',
    resetStatus: '草稿',
    clearFields: ['pdf_url'],
  },
  'purchase-orders': {
    table: 'purchase_orders',
    noField: 'order_no',
    prefix: 'PO-',
    itemTable: 'purchase_order_items',
    itemFk: 'order_id',
    resetStatus: '草稿',
    clearFields: ['pdf_url'],
  },
  'service-requests': {
    table: 'service_requests',
    noField: 'service_no',
    prefix: 'SVC-',
    dateFields: ['reported_date'],
    resetStatus: '待處理',
    clearFields: ['track_token', 'closed_date', 'close_notes', 'actual_repair_cost'],
    falseFields: ['payment_confirmed', 'pickup_confirmed', 'is_closed'],
  },
  'projects': {
    table: 'projects',
    nameField: 'project_name',
    resetStatus: '規劃中',
  },
}

function todayParts() {
  const d = new Date()
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return { d, yy, mm, dd, iso: `${d.getFullYear()}-${mm}-${dd}` }
}

export async function POST(
  _req: Request,
  { params }: { params: { type: string; id: string } }
) {
  const cfg = CONFIG[params.type]
  if (!cfg) return NextResponse.json({ error: '不支援的單據類型' }, { status: 400 })

  const supabase = createServerSupabaseClient()
  const { yy, mm, dd, iso } = todayParts()

  // 1) 讀來源整列
  const { data: src, error: e1 } = await supabase
    .from(cfg.table).select('*').eq('id', params.id).single()
  if (e1 || !src) return NextResponse.json({ error: '找不到來源單據' }, { status: 404 })

  // 2) 讀品項
  let srcItems: any[] = []
  if (cfg.itemTable && cfg.itemFk) {
    const { data, error } = await supabase
      .from(cfg.itemTable).select('*').eq(cfg.itemFk, params.id)
    if (error) return NextResponse.json({ error: '讀取品項失敗：' + error.message }, { status: 500 })
    srcItems = data ?? []
  }

  // 3) 準備新主檔
  const clone: any = { ...src }
  delete clone.id
  delete clone.created_at
  delete clone.updated_at
  if (cfg.resetStatus && 'status' in clone) clone.status = cfg.resetStatus
  ;(cfg.dateFields ?? []).forEach(f => { if (f in clone) clone[f] = iso })
  ;(cfg.clearFields ?? []).forEach(f => { if (f in clone) clone[f] = null })
  ;(cfg.falseFields ?? []).forEach(f => { if (f in clone) clone[f] = false })
  if (cfg.nameField && clone[cfg.nameField]) clone[cfg.nameField] = `${clone[cfg.nameField]}（複製）`

  // 4) 有單號的：算流水、撞號重試
  let created: { id: string } | null = null

  if (cfg.noField && cfg.prefix) {
    const prefix = `${cfg.prefix}${yy}${mm}${dd}-`
    const { count } = await supabase
      .from(cfg.table).select('id', { count: 'exact', head: true })
      .like(cfg.noField, `${prefix}%`)
    let seq = (count ?? 0) + 1

    for (let i = 0; i < 5; i++) {
      const no = `${prefix}${String(seq).padStart(3, '0')}`
      const { data, error } = await supabase
        .from(cfg.table).insert({ ...clone, [cfg.noField]: no }).select('id').single()
      if (!error && data) { created = data; break }
      if ((error as any)?.code === '23505') { seq += 1; continue }
      return NextResponse.json({ error: '建立新單據失敗：' + error?.message }, { status: 500 })
    }
    if (!created) return NextResponse.json({ error: '單號產生衝突，請重試' }, { status: 409 })
  } else {
    const { data, error } = await supabase.from(cfg.table).insert(clone).select('id').single()
    if (error || !data) return NextResponse.json({ error: '建立失敗：' + error?.message }, { status: 500 })
    created = data
  }

  // 5) 複製品項
  if (cfg.itemTable && cfg.itemFk && srcItems.length) {
    const payload = srcItems.map((it: any) => {
      const c = { ...it }
      delete c.id
      delete c.created_at
      delete c.updated_at
      delete c.amount        // generated column（quantity * unit_price），不可帶值
      c[cfg.itemFk!] = created!.id
      return c
    })
    const { error } = await supabase.from(cfg.itemTable).insert(payload)
    if (error) {
      await supabase.from(cfg.table).delete().eq('id', created.id)
      return NextResponse.json({ error: '複製品項失敗：' + error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ id: created.id })
}
