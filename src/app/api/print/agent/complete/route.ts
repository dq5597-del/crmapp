import { NextRequest, NextResponse } from 'next/server'
import { authenticatePrinter } from '@/lib/print-server'

export async function POST(req: NextRequest) {
  const auth = await authenticatePrinter(req.headers.get('x-printer-id'), req.headers.get('x-printer-token'))
  if (!auth) return NextResponse.json({ error: '印表機驗證失敗' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const status = body.ok ? 'printed' : 'failed'
  const { error } = await auth.service.from('print_jobs').update({
    status, printed_at: body.ok ? new Date().toISOString() : null,
    error_message: body.ok ? null : String(body.error ?? '列印失敗').slice(0, 1000),
  }).eq('id', body.job_id).eq('printer_id', auth.printer.id).eq('status', 'processing')
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}

