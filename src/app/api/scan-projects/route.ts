import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const BASE_DIR = 'G:\\我的雲端硬碟\\2.業務部資料\\5.專案資料'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未登入' }, { status: 401 })
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
    if (!['admin', '管理員'].includes(profile?.role ?? '')) return NextResponse.json({ error: '需管理員權限' }, { status: 403 })
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: '正式環境停用本機掃描' }, { status: 403 })
    const result: { region: string; client: string; files: string[] }[] = []

    const regions = fs.readdirSync(BASE_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'Skill' && d.name !== '公司資料圖錦')

    for (const region of regions) {
      const regionPath = path.join(BASE_DIR, region.name)
      const clients = fs.readdirSync(regionPath, { withFileTypes: true })
        .filter(d => d.isDirectory())

      for (const client of clients) {
        const clientPath = path.join(regionPath, client.name)
        const files = fs.readdirSync(clientPath)
          .filter(f => f.endsWith('.pdf') || f.endsWith('.PDF'))

        result.push({
          region: region.name,
          client: client.name,
          files,
        })
      }
    }

    return NextResponse.json({ data: result, total: result.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
