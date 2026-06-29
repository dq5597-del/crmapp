import { NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import fs from 'fs'
import path from 'path'

const DATA_FILE = path.join(
  'C:\\Users\\10319\\AppData\\Roaming\\Claude\\local-agent-mode-sessions\\aa5c78a7-1f7c-4d02-b941-fcede313e94d\\185450d1-b1f2-4731-9c3a-bab4174a0380\\local_bbba83fc-dc7b-4e6b-86e8-7165bc002b45\\outputs',
  'quotes_data.json'
)

export async function GET() {
  const supabase = createClient()

  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8')
    const quotesData: any[] = JSON.parse(raw)

    // Fetch all clients to map folder name → client_id
    const { data: allClients } = await supabase.from('clients').select('id, company_name')
    const clientMap = new Map((allClients ?? []).map((c: any) => [c.company_name, c.id]))

    // Delete old stub quotes (total_amount = 0 or notes contains '從檔案匯入')
    const { data: stubQuotes } = await supabase
      .from('quotes')
      .select('id')
      .or('total_amount.eq.0,notes.like.%從檔案匯入%')

    if (stubQuotes && stubQuotes.length > 0) {
      const stubIds = stubQuotes.map((q: any) => q.id)
      // Delete quote items first
      await supabase.from('quote_items').delete().in('quote_id', stubIds)
      // Delete quotes
      await supabase.from('quotes').delete().in('id', stubIds)
    }

    // Fetch existing quote_nos to avoid conflicts
    const { data: existingQuotes } = await supabase.from('quotes').select('quote_no')
    const existingNos = new Set((existingQuotes ?? []).map((q: any) => q.quote_no))

    let quotesInserted = 0
    let itemsInserted = 0
    const errors: string[] = []

    for (const q of quotesData) {
      let quoteNo = q.quote_no_hint
      // If conflict, append suffix
      if (existingNos.has(quoteNo)) {
        let suffix = 2
        while (existingNos.has(`${quoteNo}-${suffix}`)) suffix++
        quoteNo = `${quoteNo}-${suffix}`
      }
      existingNos.add(quoteNo)

      const clientId = clientMap.get(q.client_folder) ?? null

      const quotePayload: any = {
        quote_no: quoteNo,
        client_id: clientId,
        project_name: q.project_name,
        contact_name: q.contact_name || null,
        client_phone: q.client_phone || null,
        subtotal: Math.round(q.total_amount / 1.05),
        tax_amount: q.total_amount - Math.round(q.total_amount / 1.05),
        total_amount: q.total_amount,
        status: q.status,
        notes: q.notes,
      }

      if (q.date) {
        quotePayload.created_at = `${q.date}T08:00:00+08:00`
      }

      const { data: inserted, error: qErr } = await supabase
        .from('quotes')
        .insert(quotePayload)
        .select('id')
        .single()

      if (qErr) {
        errors.push(`${quoteNo}: ${qErr.message}`)
        continue
      }

      quotesInserted++
      const quoteId = inserted.id

      if (q.items && q.items.length > 0) {
        const items = q.items.map((item: any) => ({
          quote_id: quoteId,
          seq_no: item.seq_no,
          product_name: item.product_name,
          model: item.model || null,
          unit: item.unit,
          quantity: item.quantity,
          unit_price: item.unit_price,
          provide_catalog: false,
          provide_manual: false,
          item_notes: item.item_notes,
        }))

        const { error: iErr } = await supabase.from('quote_items').insert(items)
        if (iErr) {
          errors.push(`${quoteNo} items: ${iErr.message}`)
        } else {
          itemsInserted += items.length
        }
      }
    }

    return NextResponse.json({
      ok: true,
      stubsDeleted: stubQuotes?.length ?? 0,
      quotesInserted,
      itemsInserted,
      errors,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
