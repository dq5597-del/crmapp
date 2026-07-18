import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import ExcelJS from 'exceljs'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()

  const [{ data: order }, { data: items }, { data: settings }] = await Promise.all([
    supabase.from('sales_orders').select('*, clients(company_name, phone, address)').eq('id', params.id).single(),
    supabase.from('sales_order_items').select('*').eq('order_id', params.id).order('seq_no'),
    supabase.from('system_settings').select('*').single(),
  ])

  if (!order) return NextResponse.json({ error: '找不到銷貨單' }, { status: 404 })

  const clientName = (order as any).clients?.company_name ?? ''
  const bankInfo = settings?.bank_name
    ? `${settings.bank_name}／戶名：${settings.bank_account_name ?? ''}／帳號：${settings.bank_account ?? ''}`
    : ''

  const workbook = new ExcelJS.Workbook()
  workbook.creator = '光輝影音科技 CRM'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('銷貨單', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
  })

  sheet.columns = [
    { width: 6 },  // 編號
    { width: 12 }, // 品牌
    { width: 28 }, // 品名
    { width: 16 }, // 型號
    { width: 8 },  // 單位
    { width: 8 },  // 數量
    { width: 14 }, // 單價
    { width: 16 }, // 金額
    { width: 22 }, // 備註
  ]

  sheet.mergeCells('A1:I1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = '銷　貨　單'
  titleCell.font = { size: 18, bold: true }
  titleCell.alignment = { horizontal: 'center' }
  sheet.getRow(1).height = 28

  if (order.project_name) {
    sheet.mergeCells('A2:I2')
    const projCell = sheet.getCell('A2')
    projCell.value = order.project_name
    projCell.alignment = { horizontal: 'center' }
    projCell.font = { size: 11, color: { argb: 'FF555555' } }
  }

  let r = 4
  const infoLine = (label1: string, val1: string, label2?: string, val2?: string) => {
    sheet.getCell(`A${r}`).value = label1
    sheet.mergeCells(`B${r}:D${r}`)
    sheet.getCell(`B${r}`).value = val1
    if (label2) {
      sheet.getCell(`E${r}`).value = label2
      sheet.mergeCells(`F${r}:I${r}`)
      sheet.getCell(`F${r}`).value = val2 ?? ''
    }
    r++
  }
  infoLine('單位名稱', clientName, '單號', order.order_no)
  infoLine('聯絡人', order.contact_name ?? '—', '日期', order.created_at ? new Date(order.created_at).toLocaleDateString('zh-TW') : '')
  infoLine('電話', order.client_phone ?? '—', '交貨日期', order.delivery_date ?? '—')
  infoLine('交貨地址', order.delivery_address || '—', '付款條件', order.payment_terms ?? '—')
  if (bankInfo) infoLine('匯款帳號', bankInfo)

  r++

  const headerRow = sheet.getRow(r)
  headerRow.values = ['編號', '品牌', '產品名稱', '規格型號', '單位', '數量', '含稅單價', '含稅金額', '品項備註']
  headerRow.eachCell(cell => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  })
  r++

  ;(items ?? []).forEach((item: any, idx: number) => {
    const row = sheet.getRow(r)
    row.values = [
      idx + 1,
      item.brand ?? '',
      item.product_name ?? '',
      item.model ?? '',
      item.unit ?? '',
      Number(item.quantity),
      Number(item.unit_price),
      Number(item.quantity) * Number(item.unit_price),
      item.item_notes ?? '',
    ]
    row.eachCell((cell, colNumber) => {
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      if (colNumber === 1 || colNumber === 5 || colNumber === 6) cell.alignment = { horizontal: 'center' }
      if (colNumber === 7 || colNumber === 8) cell.numFmt = '#,##0'
    })
    r++
  })

  sheet.mergeCells(`A${r}:G${r}`)
  const totalLabelCell = sheet.getCell(`A${r}`)
  totalLabelCell.value = '含稅總金額'
  totalLabelCell.font = { bold: true }
  totalLabelCell.alignment = { horizontal: 'right' }
  totalLabelCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  const totalValCell = sheet.getCell(`H${r}`)
  totalValCell.value = Number(order.total_amount)
  totalValCell.numFmt = '#,##0'
  totalValCell.font = { bold: true, size: 12 }
  totalValCell.alignment = { horizontal: 'right' }
  totalValCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  sheet.getCell(`I${r}`).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  r += 2

  if (order.notes) {
    sheet.getCell(`A${r}`).value = '備註事項'
    sheet.getCell(`A${r}`).font = { bold: true }
    r++
    sheet.mergeCells(`A${r}:I${r}`)
    sheet.getCell(`A${r}`).value = order.notes
    sheet.getCell(`A${r}`).alignment = { wrapText: true }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `銷貨單_${order.order_no}_${clientName}.xlsx`
  const asciiName = filename.replace(/[^\x20-\x7E]/g, '_')

  return new NextResponse(buffer as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
