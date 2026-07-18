import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export const runtime = 'nodejs'
export const maxDuration = 60

// 民國年或西元日期字串 → YYYY-MM-DD；Date 物件直接轉
function parseDate(v: any): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    return v.toISOString().split('T')[0]
  }
  const s = String(v).trim()
  const m = s.match(/^(\d{2,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/)
  if (!m) return null
  let y = Number(m[1])
  if (y < 1000) y += 1911 // 民國年
  const mm = String(Number(m[2])).padStart(2, '0')
  const dd = String(Number(m[3])).padStart(2, '0')
  if (y < 1990 || y > 2100) return null
  return `${y}-${mm}-${dd}`
}

function num(v: any): number {
  const n = Number(v)
  return isNaN(n) ? 0 : Math.round(n * 100) / 100
}

function str(v: any): string {
  if (v == null) return ''
  if (typeof v === 'object' && 'text' in v) return String((v as any).text ?? '')
  return String(v).trim()
}

// header 文字 → 內部欄位鍵
const EXPENSE_HEADERS: Record<string, string> = {
  '發票型式': 'invoice_type', '發票日期': 'invoice_date', '發票號碼': 'invoice_no',
  '供應商': 'supplier', '品名': 'item_name', '科目': 'category',
  '未稅金額': 'untaxed_amount', '稅額': 'tax_amount', '含稅總額': 'total_amount',
  '預計付款日': 'due_date', '付款日期': 'paid_date', '付款帳號': 'payment_account',
  '完工日期': 'completion_date', '完工(提供)日期': 'completion_date',
  '備註(客戶名)': 'note_client', '備註(事由)': 'note_reason',
}
const INCOME_HEADERS: Record<string, string> = {
  '發票型式': 'invoice_type', '發票日期': 'invoice_date', '發票號碼': 'invoice_no',
  '客戶': 'client_name', '品名': 'description', '科目': 'category',
  '未稅銷售額': 'untaxed_amount', '未稅金額': 'untaxed_amount',
  '稅額': 'tax_amount', '總額': 'total_amount', '含稅總額': 'total_amount',
  '收款日期': 'collected_date', '收款帳號': 'payment_account',
  '備註': 'note',
}

const DATE_FIELDS = new Set(['invoice_date', 'due_date', 'paid_date', 'completion_date', 'collected_date'])
const NUM_FIELDS = new Set(['untaxed_amount', 'tax_amount', 'total_amount'])

function mapSheet(ws: ExcelJS.Worksheet, headerMap: Record<string, string>) {
  const rows: Record<string, any>[] = []
  const colField: Record<number, string> = {}
  const headerRow = ws.getRow(1)
  headerRow.eachCell((cell, colNumber) => {
    const h = str(cell.value)
    if (headerMap[h]) colField[colNumber] = headerMap[h]
  })
  // 範本有一頁「發票號碼」表頭壞掉（顯示 2）：若沒對到發票號碼，把第 3 欄當發票號碼
  if (!Object.values(colField).includes('invoice_no') && !colField[3]) colField[3] = 'invoice_no'

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const rec: Record<string, any> = {}
    for (const [colStr, field] of Object.entries(colField)) {
      const v = row.getCell(Number(colStr)).value
      if (DATE_FIELDS.has(field)) rec[field] = parseDate(v)
      else if (NUM_FIELDS.has(field)) rec[field] = num(v)
      else rec[field] = str(v)
    }
    rows.push(rec)
  })
  return rows
}

function isMeaningful(r: Record<string, any>): boolean {
  return (Number(r.total_amount) > 0 || Number(r.untaxed_amount) > 0) &&
    !!(r.invoice_date || r.supplier || r.client_name || r.invoice_no)
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '未收到檔案' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer as any)
  } catch (e: any) {
    return NextResponse.json({ error: '無法讀取 Excel：' + (e?.message ?? '') }, { status: 400 })
  }

  const expenses: Record<string, any>[] = []
  const incomes: Record<string, any>[] = []

  wb.worksheets.forEach(ws => {
    const name = ws.name
    if (/進[-‑]?支出/.test(name)) {
      mapSheet(ws, EXPENSE_HEADERS).filter(isMeaningful).forEach(r => expenses.push(r))
    } else if (/銷[-‑]?收入/.test(name)) {
      mapSheet(ws, INCOME_HEADERS).filter(isMeaningful).forEach(r => incomes.push(r))
    }
  })

  const fallbackYear = new Date().getFullYear()
  let expInserted = 0, incInserted = 0

  if (expenses.length > 0) {
    const payload = expenses.map(r => {
      const total = r.total_amount || (r.untaxed_amount + (r.tax_amount || 0))
      return {
        invoice_type: r.invoice_type || '無',
        invoice_date: r.invoice_date,
        invoice_no: r.invoice_no || null,
        supplier: r.supplier || '',
        item_name: r.item_name || '',
        category: r.category || '',
        untaxed_amount: r.untaxed_amount || Math.round(total / 1.05 * 100) / 100,
        tax_amount: r.tax_amount || 0,
        total_amount: total,
        due_date: r.due_date,
        paid_date: r.paid_date,
        payment_account: r.payment_account || null,
        completion_date: r.completion_date,
        note_client: r.note_client || null,
        note_reason: r.note_reason || null,
        year: r.invoice_date ? Number(r.invoice_date.slice(0, 4)) : fallbackYear,
      }
    })
    const { error, count } = await supabase.from('accounting_expenses').insert(payload, { count: 'exact' })
    if (error) return NextResponse.json({ error: '支出匯入失敗：' + error.message }, { status: 500 })
    expInserted = count ?? payload.length
  }

  if (incomes.length > 0) {
    const payload = incomes.map(r => {
      const total = r.total_amount || (r.untaxed_amount + (r.tax_amount || 0))
      return {
        invoice_type: r.invoice_type || '無',
        invoice_date: r.invoice_date,
        invoice_no: r.invoice_no || null,
        client_name: r.client_name || '',
        description: r.description || '',
        category: r.category || '銷售收入',
        untaxed_amount: r.untaxed_amount || Math.round(total / 1.05 * 100) / 100,
        tax_amount: r.tax_amount || 0,
        total_amount: total,
        collected_date: r.collected_date,
        payment_account: r.payment_account || null,
        source_type: 'excel',
        year: r.invoice_date ? Number(r.invoice_date.slice(0, 4)) : fallbackYear,
      }
    })
    const { error, count } = await supabase.from('accounting_income').insert(payload, { count: 'exact' })
    if (error) return NextResponse.json({ error: '收入匯入失敗：' + error.message }, { status: 500 })
    incInserted = count ?? payload.length
  }

  return NextResponse.json({ expenses: expInserted, incomes: incInserted })
}
