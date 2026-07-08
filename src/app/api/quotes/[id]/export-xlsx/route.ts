import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { buildQuoteFileName } from '@/lib/utils'
import ExcelJS from 'exceljs'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()

  const [{ data: quote }, { data: items }, { data: settings }] = await Promise.all([
    supabase.from('quotes').select('*, clients(company_name, phone, address)').eq('id', params.id).single(),
    supabase.from('quote_items').select('*').eq('quote_id', params.id).order('seq_no'),
    supabase.from('system_settings').select('*').single(),
  ])

  if (!quote) {
    return NextResponse.json({ error: '找不到報價單' }, { status: 404 })
  }

  const clientName = (quote as any).clients?.company_name ?? ''
  const clientAddress = (quote as any).client_address || (quote as any).clients?.address || ''
  const bankInfo = settings?.bank_name
    ? `${settings.bank_name}／戶名：${settings.bank_account_name ?? ''}／帳號：${settings.bank_account ?? ''}`
    : ''

  const workbook = new ExcelJS.Workbook()
  workbook.creator = '光輝影音科技 CRM'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('估價單', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
  })

  sheet.columns = [
    { width: 6 },  // 編號
    { width: 30 }, // 品名
    { width: 16 }, // 型號
    { width: 8 },  // 單位
    { width: 8 },  // 數量
    { width: 14 }, // 單價
    { width: 16 }, // 金額
    { width: 24 }, // 備註
  ]

  // 標題
  sheet.mergeCells('A1:H1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = '估　價　單'
  titleCell.font = { size: 18, bold: true }
  titleCell.alignment = { horizontal: 'center' }
  sheet.getRow(1).height = 28

  if (quote.project_name) {
    sheet.mergeCells('A2:H2')
    const projCell = sheet.getCell('A2')
    projCell.value = quote.project_name
    projCell.alignment = { horizontal: 'center' }
    projCell.font = { size: 11, color: { argb: 'FF555555' } }
  }

  // 基本資訊
  let r = 4
  const infoLine = (label1: string, val1: string, label2?: string, val2?: string) => {
    sheet.getCell(`A${r}`).value = label1
    sheet.mergeCells(`B${r}:D${r}`)
    sheet.getCell(`B${r}`).value = val1
    if (label2) {
      sheet.getCell(`E${r}`).value = label2
      sheet.mergeCells(`F${r}:H${r}`)
      sheet.getCell(`F${r}`).value = val2 ?? ''
    }
    r++
  }
  infoLine('客戶名稱', clientName, '單號', quote.quote_no)
  infoLine('聯絡人', quote.contact_name ?? '—', '日期', quote.created_at ? new Date(quote.created_at).toLocaleDateString('zh-TW') : '')
  infoLine('電話', quote.client_phone ?? '—', '有效期限', quote.valid_until ?? '—')
  infoLine('地址', clientAddress || '—', '交貨工期', quote.delivery_days ? `${quote.delivery_days} 天` : '—')
  if (quote.payment_terms || bankInfo) {
    infoLine('付款條件', quote.payment_terms ?? '—', '匯款帳號', bankInfo || '—')
  }

  r++ // 空一行

  // 表頭
  const headerRowIdx = r
  const headerRow = sheet.getRow(headerRowIdx)
  headerRow.values = ['編號', '產品名稱', '規格型號', '單位', '數量', '單價', '金額', '品項備註']
  headerRow.eachCell(cell => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  })
  r++

  const itemStartRow = r
  let dispNo = 0
  ;(items ?? []).forEach((item: any) => {
    const row = sheet.getRow(r)
    if (item.is_category) {
      dispNo = 0
      sheet.mergeCells(`A${r}:H${r}`)
      const catCell = sheet.getCell(`A${r}`)
      catCell.value = item.product_name ?? ''
      catCell.font = { bold: true }
      catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECECEC' } }
      row.eachCell(cell => { cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } })
      r++
      return
    }
    dispNo += 1
    const amount = Number(item.quantity) * Number(item.unit_price)
    row.values = [
      dispNo,
      item.product_name ?? '',
      item.model ?? '',
      item.unit ?? '',
      Number(item.quantity),
      Number(item.unit_price),
      amount,
      item.item_notes ?? '',
    ]
    row.eachCell((cell, colNumber) => {
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      if (colNumber === 1 || colNumber === 4 || colNumber === 5) cell.alignment = { horizontal: 'center' }
      if (colNumber === 6 || colNumber === 7) cell.numFmt = '#,##0'
    })
    r++
  })
  const itemEndRow = r - 1

  // 總計列
  sheet.mergeCells(`A${r}:F${r}`)
  const totalLabelCell = sheet.getCell(`A${r}`)
  totalLabelCell.value = '含稅總金額'
  totalLabelCell.font = { bold: true }
  totalLabelCell.alignment = { horizontal: 'right' }
  totalLabelCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }

  const totalValCell = sheet.getCell(`G${r}`)
  totalValCell.value = Number(quote.total_amount)
  totalValCell.numFmt = '#,##0'
  totalValCell.font = { bold: true, size: 12 }
  totalValCell.alignment = { horizontal: 'right' }
  totalValCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  sheet.getCell(`H${r}`).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  r += 2

  // 備註
  const noteItems: string[] = []
  if (quote.notes) noteItems.push(quote.notes)
  if (noteItems.length > 0) {
    sheet.getCell(`A${r}`).value = '備註事項'
    sheet.getCell(`A${r}`).font = { bold: true }
    r++
    noteItems.forEach(n => {
      sheet.mergeCells(`A${r}:H${r}`)
      sheet.getCell(`A${r}`).value = n
      sheet.getCell(`A${r}`).alignment = { wrapText: true }
      r++
    })
  }

  void itemStartRow; void itemEndRow

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `${buildQuoteFileName(quote, clientName)}.xlsx`
  // HTTP header 只能放 ASCII：中文檔名放 filename*=UTF-8''，filename= 用 ASCII 替代（修 500 ByteString 錯誤）
  const asciiName = filename.replace(/[^\x20-\x7E]/g, '_')

  return new NextResponse(buffer as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
