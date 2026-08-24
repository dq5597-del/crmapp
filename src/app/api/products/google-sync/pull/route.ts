import { NextRequest, NextResponse } from 'next/server'
import { pullGoogleProductRows, verifyGoogleProductSync } from '@/lib/google-product-sync'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const sheetId = req.nextUrl.searchParams.get('sheetId') ?? ''
  const secret = req.headers.get('x-google-product-sync-secret') ?? ''
  const authError = verifyGoogleProductSync(secret, sheetId)
  if (authError) {
    return NextResponse.json({ error: authError }, { status: authError === 'unauthorized' ? 401 : 503 })
  }

  try {
    const rows = await pullGoogleProductRows()
    return NextResponse.json({ ok: true, rows }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? '讀取 CRM 產品失敗' }, { status: 500 })
  }
}
