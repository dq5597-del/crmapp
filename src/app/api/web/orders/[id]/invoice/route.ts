import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { wc, wcConfigured } from '@/lib/woocommerce'

/**
 * POST /api/web/orders/[id]/invoice
 *
 * 儲存人工開立的發票資料，並回寫到 av-shop.com 的訂單，
 * 讓客戶在網站的「我的發票」看得到號碼與下載連結。
 *
 * body: {
 *   invoice_no:      string   例 AB12345678
 *   invoice_date:    string   YYYY-MM-DD
 *   invoice_pdf_url?: string  Supabase Storage 公開網址（前端先上傳好再帶進來）
 *   invoice_notes?:  string
 * }
 */

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createSupabaseClient(url, key, { auth: { persistSession: false } })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = svc()
  if (!supabase) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY 未設定' }, { status: 500 })
  }

  const body = await req.json().catch(() => null)
  const invoiceNo = String(body?.invoice_no ?? '').trim()
  const invoiceDate = String(body?.invoice_date ?? '').trim()
  const pdfUrl = String(body?.invoice_pdf_url ?? '').trim()
  const notes = String(body?.invoice_notes ?? '').trim()

  if (!invoiceNo) {
    return NextResponse.json({ error: '請填寫發票號碼' }, { status: 400 })
  }
  if (!/^[A-Z]{2}\d{8}$/.test(invoiceNo)) {
    return NextResponse.json({ error: '發票號碼格式應為 2 碼英文加 8 碼數字，例如 AB12345678' }, { status: 400 })
  }
  if (!invoiceDate) {
    return NextResponse.json({ error: '請填寫開立日期' }, { status: 400 })
  }

  const { data: order, error: readErr } = await supabase
    .from('web_orders')
    .select('id, wc_order_id')
    .eq('id', params.id)
    .maybeSingle()

  if (readErr || !order) {
    return NextResponse.json({ error: '找不到這筆網路訂單' }, { status: 404 })
  }

  const { error: updateErr } = await supabase
    .from('web_orders')
    .update({
      invoice_no: invoiceNo,
      invoice_date: invoiceDate,
      invoice_pdf_url: pdfUrl || null,
      invoice_notes: notes || null,
      invoice_status: '已開立',
      invoice_issued_at: new Date().toISOString(),
    })
    .eq('id', order.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // 回寫官網（失敗不影響 CRM 已存的資料，回傳提示讓使用者知道要重試）
  let pushed = false
  let pushError: string | null = null

  if (wcConfigured()) {
    try {
      await wc.put(`/orders/${order.wc_order_id}`, {
        meta_data: [
          { key: '_gh_invoice_number', value: invoiceNo },
          { key: '_gh_invoice_date', value: invoiceDate },
          { key: '_gh_invoice_pdf', value: pdfUrl },
        ],
      })
      pushed = true
    } catch (e: any) {
      pushError = e?.message ?? '回寫官網失敗'
    }
  } else {
    pushError = 'WooCommerce 尚未設定，發票資料只存在本系統'
  }

  return NextResponse.json({ ok: true, pushed, pushError })
}
