import { NextResponse } from 'next/server'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import fs from 'fs'
import path from 'path'

const BASE_DIR = 'G:\\我的雲端硬碟\\2.業務部資料\\5.專案資料'

// Folders that are NOT clients
const SKIP_FOLDERS = new Set(['業主提供資料', '光輝報價單', 'Skill', '公司資料圖錦'])

function parseQuoteDate(filename: string): string | null {
  // Patterns: _20250526.pdf or _20260508.pdf
  const m = filename.match(/_(\d{4})(\d{2})(\d{2})\.pdf$/i)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

function parseQuoteNo(filename: string, dateStr: string | null): string {
  // Format: YYMMDD+001 — use date from filename or today
  if (dateStr) {
    const yy = dateStr.slice(2, 4)
    const mm = dateStr.slice(5, 7)
    const dd = dateStr.slice(8, 10)
    return `${yy}${mm}${dd}001`
  }
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}001`
}

function extractProjectName(filename: string): string {
  // Remove (光輝) prefix, remove date suffix, remove extension
  let name = filename
    .replace(/^[\(（]光輝[\)）]/g, '')
    .replace(/_\d{8}\.pdf$/i, '')
    .replace(/\.pdf$/i, '')
  return name.trim()
}

export async function GET() {
  const supabase = createClient()

  try {
    // Step 1: Scan folder structure
    const scanned: { region: string; client: string; files: string[] }[] = []
    const regions = fs.readdirSync(BASE_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && !SKIP_FOLDERS.has(d.name))

    for (const region of regions) {
      const regionPath = path.join(BASE_DIR, region.name)
      const clients = fs.readdirSync(regionPath, { withFileTypes: true })
        .filter(d => d.isDirectory() && !SKIP_FOLDERS.has(d.name))

      for (const client of clients) {
        const clientPath = path.join(regionPath, client.name)
        const files = fs.readdirSync(clientPath)
          .filter(f => /\.pdf$/i.test(f))
        scanned.push({ region: region.name, client: client.name, files })
      }
    }

    // Step 2: Insert clients (skip duplicates by checking existing)
    const { data: existingClients } = await supabase
      .from('clients')
      .select('company_name')

    const existingNames = new Set((existingClients ?? []).map((c: any) => c.company_name))

    const toInsert = scanned
      .filter(s => !existingNames.has(s.client))
      .map(s => ({
        company_name: s.client,
        status: s.files.length > 0 ? '已完成' : '有需求',
        notes: `來源：${s.region}`,
        dm_provided: false,
      }))

    let clientsInserted = 0
    if (toInsert.length > 0) {
      const { error } = await supabase.from('clients').insert(toInsert)
      if (error) throw new Error('單位名稱匯入失敗：' + error.message)
      clientsInserted = toInsert.length
    }

    // Step 3: Insert quote stubs from (光輝) PDF filenames
    // Fetch all clients to get their IDs
    const { data: allClients } = await supabase
      .from('clients')
      .select('id, company_name')

    const clientMap = new Map((allClients ?? []).map((c: any) => [c.company_name, c.id]))

    const { data: existingQuotes } = await supabase
      .from('quotes')
      .select('quote_no')

    const existingQuoteNos = new Set((existingQuotes ?? []).map((q: any) => q.quote_no))

    const quotesToInsert: any[] = []
    const quoteNoCounter: Record<string, number> = {}

    for (const s of scanned) {
      const clientId = clientMap.get(s.client) ?? null
      const lightFiles = s.files.filter(f => /^[\(（]光輝[\)）]/.test(f))

      for (const file of lightFiles) {
        const dateStr = parseQuoteDate(file)
        const baseKey = dateStr ?? s.client

        quoteNoCounter[baseKey] = (quoteNoCounter[baseKey] ?? 0) + 1
        const counter = quoteNoCounter[baseKey]

        let quoteNo: string
        if (dateStr) {
          const yy = dateStr.slice(2, 4)
          const mm = dateStr.slice(5, 7)
          const dd = dateStr.slice(8, 10)
          quoteNo = `${yy}${mm}${dd}${String(counter).padStart(3, '0')}`
        } else {
          quoteNo = `000000${String(counter).padStart(3, '0')}`
        }

        if (existingQuoteNos.has(quoteNo)) continue

        const projectName = extractProjectName(file)
        quotesToInsert.push({
          quote_no: quoteNo,
          client_id: clientId,
          project_name: projectName,
          status: '已確認',
          subtotal: 0,
          tax_amount: 0,
          total_amount: 0,
          notes: `從檔案匯入：${file}`,
          created_at: dateStr ? `${dateStr}T00:00:00+08:00` : undefined,
        })

        existingQuoteNos.add(quoteNo)
      }
    }

    let quotesInserted = 0
    if (quotesToInsert.length > 0) {
      const { error } = await supabase.from('quotes').insert(quotesToInsert)
      if (error) throw new Error('報價單匯入失敗：' + error.message)
      quotesInserted = quotesToInsert.length
    }

    return NextResponse.json({
      ok: true,
      scanned: scanned.length,
      clientsInserted,
      clientsSkipped: scanned.length - toInsert.length,
      quotesInserted,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
