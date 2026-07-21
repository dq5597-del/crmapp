import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { fetchDocData, buildXlsx, type DocType } from '@/lib/doc-export'

export const runtime = 'nodejs'

// GET /api/docs/[type]/[id]/export-xlsx — 通用 Excel 匯出（訂購/退貨/出貨/詢價/銷貨）
export async function GET(_req: NextRequest, { params }: { params: { type: string; id: string } }) {
  const supabase = createServerSupabaseClient()
  const data = await fetchDocData(supabase, params.type as DocType, params.id)
  if (!data) return NextResponse.json({ error: '找不到單據' }, { status: 404 })

  const buf = await buildXlsx(data)
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(`${data.title}_${data.docNo}.xlsx`)}"`,
    },
  })
}
