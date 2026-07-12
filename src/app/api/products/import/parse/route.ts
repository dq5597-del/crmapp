import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { parseRow, ParsedRow, columnForHeader } from '@/lib/product-import'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_ROWS = 1000

/**
 * POST /api/products/import/parse  （multipart form-data: file）
 * 解析 .xlsx / .csv → { rows: ParsedRow[], unknownHeaders: string[] }
 * 只做解析與格式驗證，不寫任何資料。
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: '沒有收到檔案' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv'

    const wb = new ExcelJS.Workbook()
    if (isCsv) {
      const { Readable } = await import('stream')
      // 去掉 BOM，避免第一個表頭讀成「﻿品牌」
      let text = buf.toString('utf8')
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
      await wb.csv.read(Readable.from([text]) as any)
    } else {
      await wb.xlsx.load(buf as any)
    }

    const ws = wb.worksheets[0]
    if (!ws || ws.rowCount < 2) {
      return NextResponse.json({ error: '檔案沒有資料列' }, { status: 400 })
    }

    // 表頭
    const headerRow = ws.getRow(1)
    const headers: string[] = []
    headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col] = cellText(cell.value)
    })
    const unknownHeaders = headers
      .filter(Boolean)
      .filter(h => !columnForHeader(h))

    const rows: ParsedRow[] = []
    for (let r = 2; r <= ws.rowCount; r++) {
      if (rows.length >= MAX_ROWS) break
      const row = ws.getRow(r)
      const raw: Record<string, any> = {}
      let empty = true
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const h = headers[col]
        if (!h) return
        const v = cellText(cell.value)
        if (v !== '') empty = false
        raw[h] = v
      })
      if (empty) continue
      // 略過範本的說明列 / 範例列
      const joined = Object.values(raw).join('')
      if (/^必填|^比對鍵|^例：|^數字，免打逗號/.test(String(raw['產品名稱'] ?? '')) ) continue
      if (String(raw['產品名稱'] ?? '') === 'JBL Stage A130 書架喇叭' && String(raw['型號'] ?? '') === 'STAGE-A130') continue
      if (!joined.trim()) continue

      rows.push(parseRow(r, raw))
    }

    // 檔案內型號重複檢查
    const seen = new Map<string, number>()
    for (const row of rows) {
      const key = String(row.product.model ?? '').trim().toUpperCase()
      if (!key) continue
      if (seen.has(key)) {
        row.errors.push(`型號「${row.product.model}」與第 ${seen.get(key)} 列重複`)
      } else {
        seen.set(key, row.rowNo)
      }
    }

    return NextResponse.json({ rows, unknownHeaders, truncated: ws.rowCount - 1 > MAX_ROWS })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '解析失敗' }, { status: 500 })
  }
}

/** ExcelJS 儲存格 → 純文字（處理 rich text / 公式 / 超連結 / 日期） */
function cellText(v: any): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if ('richText' in v) return (v.richText ?? []).map((t: any) => t.text).join('')
    if ('text' in v) return String(v.text ?? '')
    if ('result' in v) return String(v.result ?? '')
    if ('hyperlink' in v) return String(v.hyperlink ?? '')
    if (v instanceof Date) return v.toISOString()
  }
  return String(v).trim()
}
