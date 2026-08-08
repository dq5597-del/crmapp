import { NextRequest, NextResponse } from 'next/server'
import { authenticatePrinter } from '@/lib/print-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await authenticatePrinter(req.headers.get('x-printer-id'), req.headers.get('x-printer-token'))
  if (!auth) return NextResponse.json({ error: '印表機驗證失敗' }, { status: 401 })
  const { service: sb, printer } = auth
  await sb.from('print_printers').update({ last_seen_at: new Date().toISOString() }).eq('id', printer.id)
  const { data: next } = await sb.from('print_jobs').select('*').eq('printer_id', printer.id).eq('status', 'pending').order('created_at').limit(1).maybeSingle()
  if (!next) return NextResponse.json({ job: null })
  const { data: claimed } = await sb.from('print_jobs').update({ status: 'processing', claimed_at: new Date().toISOString(), attempts: next.attempts + 1 })
    .eq('id', next.id).eq('status', 'pending').select('*').maybeSingle()
  return NextResponse.json({ job: claimed ?? null, printer: { windows_printer_name: printer.windows_printer_name } })
}

