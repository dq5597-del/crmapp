import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateQuoteNo } from '@/lib/utils'

// POST /api/quotes/[id]/duplicate
// 複製一份報價單：品項與客戶資料一模一樣，日期改今天、單號重新產生、狀態設為草稿。
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient()
  const sourceId = params.id

  // 1. 讀原報價單主檔（只取要沿用的欄位）
  const { data: src, error: e1 } = await supabase
    .from('quotes')
    .select('client_id, project_name, contact_name, client_phone, valid_until, delivery_days, payment_terms, bank_account, notes, subtotal, tax_amount, total_amount')
    .eq('id', sourceId)
    .single()
  if (e1 || !src) {
    return NextResponse.json({ error: '找不到來源報價單' }, { status: 404 })
  }

  // 2. 讀原報價單品項
  const { data: srcItems, error: e2 } = await supabase
    .from('quote_items')
    .select('seq_no, product_id, product_name, item_notes, model, unit, quantity, unit_price, provide_catalog, provide_manual')
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

  const { count } = await supabase
    .from('quotes')
    .select('id', { count: 'exact', head: true })
    .like('quote_no', `${prefix}%`)

  let seq = (count ?? 0) + 1
  let newQuote: { id: string } | null = null

  for (let attempt = 0; attempt < 5; attempt++) {
    const quote_no = generateQuoteNo(today, seq)
    const { data, error } = await supabase
      .from('quotes')
      .insert({
        quote_no,
        client_id: src.client_id,
        project_name: src.project_name,
        contact_name: src.contact_name,
        client_phone: src.client_phone,
        valid_until: src.valid_until,
        delivery_days: src.delivery_days,
        payment_terms: src.payment_terms,
        bank_account: src.bank_account,
        notes: src.notes,
        subtotal: src.subtotal,
        tax_amount: src.tax_amount,
        total_amount: src.total_amount,
        status: '草稿',
      })
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

  // 4. 複製品項到新單
  if (srcItems && srcItems.length > 0) {
    const itemsPayload = srcItems.map(item => ({ ...item, quote_id: newQuote!.id }))
    const { error: e4 } = await supabase.from('quote_items').insert(itemsPayload)
    if (e4) {
      // 品項複製失敗則回收剛建立的主檔，避免產生空單
      await supabase.from('quotes').delete().eq('id', newQuote.id)
      return NextResponse.json({ error: '複製品項失敗：' + e4.message }, { status: 500 })
    }
  }

  return NextResponse.json({ id: newQuote.id })
}
