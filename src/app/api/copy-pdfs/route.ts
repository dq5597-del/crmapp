import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// 舊版除錯工具曾在 GET/build 階段複製公司 PDF，已永久停用。
export async function GET() {
  return NextResponse.json({ error: '此除錯端點已停用' }, { status: 410 })
}
