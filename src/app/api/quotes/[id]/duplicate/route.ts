import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateQuoteNo } from '@/lib/utils'

type TargetProject = {
  id: string
  client_id: string
  project_name: string
  clients: { contact_name: string | null; phone: string | null; address: string | null } | null
}

// POST /api/quotes/[id]/duplicate
// 複製一份報價單：日期改今天、單號重新產生、狀態設為草稿；可指定要歸入的目標專案。
// 以 select('*') 複製，避免因欄位增減而出錯（schema-agnostic）。
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createServerSupabaseClient()
  const sourceId = params.id
  const body = await req.json().catch(() => null) as { targetProjectId?: unknown } | null
  const targetProjectId = typeof body?.targetProjectId === 'string' && body.targetProjectId.trim()
    ? body.targetProjectId.trim()
    : null

  let targetProject: TargetProject | null = null

  if (targetProjectId) {
    const { data, error } = await supabase
      .from('projects')
      .select('id, client_id, project_name, clients(contact_name, phone, address)')
      .eq('id', targetProjectId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: '找不到目標專案' }, { status: 404 })
    }
    targetProject = data as unknown as TargetProject
  }

  // 1. 讀原報價單主檔（整列）
  const { data: src, error: e1 } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', sourceId)
    .single()
  if (e1 || !src) {
    return NextResponse.json({ error: '找不到來源報價單' }, { status: 404 })
  }

  // 2. 讀原報價單品項（整列）
  const { data: srcItems, error: e2 } = await supabase
    .from('quote_items')
    .select('*')
    .eq('quote_id', sourceId)
    .order('seq_no', { ascending: true })
  if (e2) {
    return NextResponse.json({ error: '讀取品項失敗：' + e2.message }, { status: 500 })
  }

  // 3. 產生今天的新單號（YYMMDD + 3碼流水），撞號時重試
  const today = new Date()
  const yy = String(today.getFullYear()).slice(2)
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const prefix = `${yy}${mm}${dd}`
  const todayStr = `${today.getFullYear()}-${mm}-${dd}`

  const { count } = await supabase
    .from('quotes')
    .select('id', { count: 'exact', head: true })
    .like('quote_no', `${prefix}%`)

  let seq = (count ?? 0) + 1
  let newQuote: { id: string } | null = null

  // 準備複製用主檔（去掉主鍵與時間戳，覆蓋單號/狀態/日期）
  const baseClone: any = { ...src }
  delete baseClone.id
  delete baseClone.created_at
  delete baseClone.updated_at
  baseClone.status = '草稿'
  baseClone.source_quote_id = sourceId
  baseClone.pdf_url = null
  if ('quote_date' in baseClone) baseClone.quote_date = todayStr

  // 從專案頁複製時，以目標專案及其客戶資料為準，避免殘留來源客戶資訊。
  if (targetProject) {
    baseClone.project_id = targetProject.id
    baseClone.client_id = targetProject.client_id
    baseClone.project_name = targetProject.project_name
    baseClone.contact_name = targetProject.clients?.contact_name ?? null
    baseClone.client_phone = targetProject.clients?.phone ?? null
    baseClone.client_address = targetProject.clients?.address ?? null
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const quote_no = generateQuoteNo(today, seq)
    const { data, error } = await supabase
      .from('quotes')
      .insert({ ...baseClone, quote_no })
      .select('id')
      .single()

    if (!error && data) { newQuote = data; break }
    // 23505 = unique_violation（單號撞號），流水 +1 再試
    if ((error as any)?.code === '23505') { seq += 1; continue }
    return NextResponse.json({ error: '建立新報價單失敗：' + error?.message }, { status: 500 })
  }

  if (!newQuote) {
    return NextResponse.json({ error: '單號產生衝突，請重試' }, { status: 409 })
  }

  // 4. 複製品項到新單（去掉主鍵與時間戳，改綁新 quote_id）
  if (srcItems && srcItems.length > 0) {
    const itemsPayload = srcItems.map((it: any) => {
      const c = { ...it }
      delete c.id
      delete c.created_at
      delete c.amount        // generated column，不可帶值
      c.quote_id = newQuote!.id
      return c
    })
    const { error: e4 } = await supabase.from('quote_items').insert(itemsPayload)
    if (e4) {
      await supabase.from('quotes').delete().eq('id', newQuote.id)
      return NextResponse.json({ error: '複製品項失敗：' + e4.message }, { status: 500 })
    }
  }

  return NextResponse.json({ id: newQuote.id })
}
