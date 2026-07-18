import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign,
} from 'docx'

function fmt(n: number | null | undefined): string {
  return `NT$${Number(n ?? 0).toLocaleString('zh-TW')}`
}

const cellBorder = {
  top: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
  left: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
  right: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
}

function headerCell(text: string, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: { fill: 'D9D9D9' },
    borders: cellBorder,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, size: 20 })] })],
  })
}

function bodyCell(text: string, width: number, align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    borders: cellBorder,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text, size: 20 })] })],
  })
}

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

  const noteItems: string[] = []
  if (order.delivery_date) noteItems.push(`交貨日期：${order.delivery_date}`)
  if (order.payment_terms) noteItems.push(`付款條件：${order.payment_terms}`)
  if (bankInfo) noteItems.push(`匯款帳號：${bankInfo}`)
  if (order.notes) noteItems.push(order.notes)

  const colWidths = [6, 12, 24, 12, 7, 7, 14, 18] // 編號/品牌/品名/型號/單位/數量/單價/金額

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell('編號', colWidths[0]),
      headerCell('品牌', colWidths[1]),
      headerCell('產品名稱', colWidths[2]),
      headerCell('規格型號', colWidths[3]),
      headerCell('單位', colWidths[4]),
      headerCell('數量', colWidths[5]),
      headerCell('含稅單價', colWidths[6]),
      headerCell('含稅金額', colWidths[7]),
    ],
  })

  const itemRows: TableRow[] = []
  ;(items ?? []).forEach((item: any, idx: number) => {
    itemRows.push(new TableRow({
      children: [
        bodyCell(String(idx + 1), colWidths[0], AlignmentType.CENTER),
        bodyCell(item.brand ?? '', colWidths[1]),
        bodyCell(item.product_name ?? '', colWidths[2]),
        bodyCell(item.model ?? '', colWidths[3]),
        bodyCell(item.unit ?? '', colWidths[4], AlignmentType.CENTER),
        bodyCell(String(item.quantity), colWidths[5], AlignmentType.CENTER),
        bodyCell(Number(item.unit_price).toLocaleString('zh-TW'), colWidths[6], AlignmentType.RIGHT),
        bodyCell(Number(item.quantity * item.unit_price).toLocaleString('zh-TW'), colWidths[7], AlignmentType.RIGHT),
      ],
    }))
    if (item.item_notes) {
      itemRows.push(new TableRow({
        children: [
          new TableCell({
            columnSpan: 8,
            borders: cellBorder,
            children: [new Paragraph({ children: [new TextRun({ text: `備註：${item.item_notes}`, size: 18, color: '666666' })] })],
          }),
        ],
      }))
    }
  })

  const totalRow = new TableRow({
    children: [
      new TableCell({
        columnSpan: 6,
        borders: cellBorder,
        children: [new Paragraph({ children: [new TextRun({ text: '含稅總金額', bold: true, size: 20 })] })],
      }),
      new TableCell({
        columnSpan: 2,
        borders: cellBorder,
        children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: fmt(order.total_amount), bold: true, size: 22 })] })],
      }),
    ],
  })

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '銷　貨　單', bold: true, size: 32 })],
        }),
        ...(order.project_name ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: order.project_name, size: 20 })] })] : []),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({ text: `單位名稱：${clientName}　　`, size: 20 }),
            new TextRun({ text: `聯絡人：${order.contact_name ?? '—'}　　`, size: 20 }),
            new TextRun({ text: `電話：${order.client_phone ?? '—'}`, size: 20 }),
          ],
        }),
        new Paragraph({
          children: [new TextRun({ text: `交貨地址：${order.delivery_address || '—'}`, size: 20 })],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `單號：${order.order_no}　　`, size: 20 }),
            new TextRun({ text: `日期：${order.created_at ? new Date(order.created_at).toLocaleDateString('zh-TW') : ''}`, size: 20 }),
          ],
        }),
        new Paragraph({ text: '' }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...itemRows, totalRow],
        }),
        new Paragraph({ text: '' }),
        ...(noteItems.length > 0 ? [
          new Paragraph({ children: [new TextRun({ text: '備註事項', bold: true, size: 20 })] }),
          ...noteItems.map((n, i) => new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${n}`, size: 18 })] })),
        ] : []),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  const filename = `銷貨單_${order.order_no}_${clientName}.docx`
  const asciiName = filename.replace(/[^\x20-\x7E]/g, '_')

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
