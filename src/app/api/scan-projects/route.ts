import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const BASE_DIR = 'G:\\我的雲端硬碟\\2.業務部資料\\5.專案資料'

export async function GET() {
  try {
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
