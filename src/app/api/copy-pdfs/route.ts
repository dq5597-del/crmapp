import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const BASE_DIR = 'G:\\我的雲端硬碟\\2.業務部資料\\5.專案資料'
const OUT_DIR = 'C:\\Users\\10319\\AppData\\Roaming\\Claude\\local-agent-mode-sessions\\aa5c78a7-1f7c-4d02-b941-fcede313e94d\\185450d1-b1f2-4731-9c3a-bab4174a0380\\local_bbba83fc-dc7b-4e6b-86e8-7165bc002b45\\outputs\\pdfs'

const SKIP_FOLDERS = new Set(['業主提供資料', 'Skill', '公司資料圖錦'])

export async function GET() {
  try {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

    const copied: string[] = []
    const regions = fs.readdirSync(BASE_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && !SKIP_FOLDERS.has(d.name))

    for (const region of regions) {
      const regionPath = path.join(BASE_DIR, region.name)
      const clients = fs.readdirSync(regionPath, { withFileTypes: true })
        .filter(d => d.isDirectory() && !SKIP_FOLDERS.has(d.name))

      for (const client of clients) {
        const clientPath = path.join(regionPath, client.name)
        // 只排除明顯非報價的檔案（型錄、聲學模擬、圖說）
        const SKIP_PATTERN = /ease focus|聲學模擬|型錄|施工圖|平面圖|google 地圖|leaflet|tds_|系列中文|series_|barco|說明書|簡報|phonebook|放行通知|保固|切結書|基本資料表|施工規劃|委託書|個案委託/i
        const files = fs.readdirSync(clientPath)
          .filter(f => /\.pdf$/i.test(f) && !SKIP_PATTERN.test(f))

        for (const file of files) {
          const src = path.join(clientPath, file)
          // Flatten: region__client__filename.pdf
          const destName = `${region.name}__${client.name}__${file}`
          const dest = path.join(OUT_DIR, destName)
          fs.copyFileSync(src, dest)
          copied.push(destName)
        }
      }
    }

    return NextResponse.json({ ok: true, count: copied.length, files: copied })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
