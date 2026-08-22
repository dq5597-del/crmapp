import { NextRequest, NextResponse } from 'next/server'
import {
  pushGoogleProductRows,
  verifyGoogleProductSync,
  type GoogleSheetSyncRow,
} from '@/lib/google-product-sync'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const sheetId = String(body?.sheetId ?? '')
  const secret =
    req.headers.get('x-gh-product-sync-secret') ??
    req.headers.get('x-google-product-sync-secret') ??
    ''
  const authError = verifyGoogleProductSync(secret, sheetId)
  if (authError) {
    return NextResponse.json({ error: authError }, { status: authError === 'unauthorized' ? 401 : 503 })
  }

  const rows = Array.isArray(body?.rows) ? body.rows as GoogleSheetSyncRow[] : []
  if (!rows.length) return NextResponse.json({ error: '沒有要同步的資料列' }, { status: 400 })

  try {
    const results = await pushGoogleProductRows(rows)
    return NextResponse.json({ ok: true, results }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? '同步失敗' }, { status: 500 })
  }
}
