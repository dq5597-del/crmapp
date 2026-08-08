import { NextRequest, NextResponse } from 'next/server'
import { isPrintAdmin, newDeviceToken, printCurrentUser, printServiceClient, tokenHash } from '@/lib/print-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await printCurrentUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })
  const sb = printServiceClient()!
  let query = sb.from('print_printers').select('id,name,windows_printer_name,branch_id,purpose,label_width_mm,label_height_mm,is_default,is_active,last_seen_at').eq('is_active', true).order('name')
  if (!isPrintAdmin(user)) query = user.branch_id ? query.or(`branch_id.eq.${user.branch_id},branch_id.is.null`) : query.is('branch_id', null)
  const { data, error } = await query
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ printers: data ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await printCurrentUser()
  if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })
  if (!isPrintAdmin(user)) return NextResponse.json({ error: '需管理員權限' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const windowsName = String(body.windows_printer_name ?? '').trim()
  if (!name || !windowsName) return NextResponse.json({ error: '印表機名稱不可空白' }, { status: 400 })
  const token = newDeviceToken()
  const sb = printServiceClient()!
  const { data, error } = await sb.from('print_printers').insert({
    name, windows_printer_name: windowsName, branch_id: body.branch_id || null,
    purpose: 'warranty_label', label_width_mm: 80, label_height_mm: 40,
    device_token_hash: tokenHash(token), is_default: Boolean(body.is_default), created_by: user.id,
  }).select('id,name,windows_printer_name,branch_id,label_width_mm,label_height_mm,is_default').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ printer: data, device_token: token }, { status: 201 })
}

