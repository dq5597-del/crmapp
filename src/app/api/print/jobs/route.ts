import { NextRequest, NextResponse } from 'next/server'
import { printCurrentUser, printServiceClient } from '@/lib/print-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await printCurrentUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })
  const sb = printServiceClient()!
  const { data, error } = await sb.from('print_jobs')
    .select('id,order_no,status,error_message,created_at,printed_at,reprint_of,print_printers(name)')
    .eq('requested_by', user.id).order('created_at', { ascending: false }).limit(30)
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ jobs: data ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await printCurrentUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const documentHtml = typeof body.document_html === 'string' ? body.document_html : ''
  const documentPurposes: Record<string, { purpose: string; kind: string }> = {
    sales_order: { purpose: 'sales_order_a4', kind: 'sales_order_a4' },
    quote: { purpose: 'office_documents_a4', kind: 'office_document_a4' },
    purchase_order: { purpose: 'office_documents_a4', kind: 'office_document_a4' },
    purchase: { purpose: 'office_documents_a4', kind: 'office_document_a4' },
  }
  const documentConfig = documentPurposes[String(body.document_type ?? '')]
  if (documentConfig) {
    if (!documentHtml || documentHtml.length > 2_000_000) return NextResponse.json({ error: '銷貨單列印內容不完整' }, { status: 400 })
    const sb = printServiceClient()!
    let printer: any = null
    if (body.printer_id) {
      const { data } = await sb.from('print_printers').select('*').eq('id', body.printer_id).eq('is_active', true).maybeSingle()
      if (data && data.purpose !== 'warranty_label' && Number(data.label_width_mm) >= 200 && Number(data.label_height_mm) >= 280 && (data.branch_id === null || data.branch_id === user.branch_id)) printer = data
    } else {
      let q = sb.from('print_printers').select('*').eq('purpose', documentConfig.purpose).eq('is_active', true).order('is_default', { ascending: false }).limit(1)
      q = user.branch_id ? q.or(`branch_id.eq.${user.branch_id},branch_id.is.null`) : q.is('branch_id', null)
      const { data } = await q
      printer = data?.[0]
    }
    if (!printer) return NextResponse.json({ error: '尚未設定銷貨單印表機' }, { status: 409 })
    const { data, error } = await sb.from('print_jobs').insert({
      printer_id: printer.id, branch_id: printer.branch_id ?? user.branch_id,
      source_type: `${String(body.document_type)}_document`, source_id: body.source_id || null,
      order_no: String(body.order_no ?? ''), requested_by: user.id,
      // Base64 keeps Traditional Chinese intact when Windows PowerShell 5 reads the JSON response.
      payload: { kind: documentConfig.kind, html_base64: Buffer.from(documentHtml, 'utf8').toString('base64'), copies: 1 },
    }).select('id,status').single()
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ job: data, printer: { id: printer.id, name: printer.name } }, { status: 201 })
  }
  const labels = Array.isArray(body.labels) ? body.labels.slice(0, 100) : []
  if (!labels.length || labels.some((l: any) => !String(l?.product_name ?? '').trim() || Number(l?.copies) < 1 || Number(l?.copies) > 100)) {
    return NextResponse.json({ error: '列印品項或張數不正確' }, { status: 400 })
  }
  const sb = printServiceClient()!
  let printer: any = null
  if (body.printer_id) {
    const { data } = await sb.from('print_printers').select('*').eq('id', body.printer_id).eq('is_active', true).maybeSingle()
    if (data?.purpose === 'warranty_label' && (data.branch_id === null || data.branch_id === user.branch_id)) printer = data
  } else {
    let q = sb.from('print_printers').select('*').eq('purpose', 'warranty_label').eq('is_active', true).order('is_default', { ascending: false }).limit(1)
    q = user.branch_id ? q.or(`branch_id.eq.${user.branch_id},branch_id.is.null`) : q.is('branch_id', null)
    const { data } = await q
    printer = data?.[0]
  }
  if (!printer) return NextResponse.json({ error: '尚未設定可用的保固貼紙印表機' }, { status: 409 })
  const payload = {
    label_width_mm: Number(printer.label_width_mm), label_height_mm: Number(printer.label_height_mm),
    purchase_date: String(body.purchase_date ?? ''), order_no: String(body.order_no ?? ''),
    client_name: String(body.client_name ?? ''), labels: labels.map((l: any) => ({
      product_name: String(l.product_name).trim(), model: String(l.model ?? '').trim(),
      copies: Math.max(1, Math.min(100, Math.floor(Number(l.copies)))),
    })),
  }
  const { data, error } = await sb.from('print_jobs').insert({
    printer_id: printer.id, branch_id: printer.branch_id ?? user.branch_id,
    source_type: 'sales_order', source_id: body.source_id || null, order_no: payload.order_no,
    payload, requested_by: user.id, reprint_of: body.reprint_of || null,
  }).select('id,status').single()
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ job: data, printer: { id: printer.id, name: printer.name } }, { status: 201 })
}
