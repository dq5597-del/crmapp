/**
 * 通用單據匯出引擎（2026-07）— 比照估價單的列印分享功能
 *
 * 支援單據：訂購單 / 退貨單 / 出貨單 / 廠商詢價單 / 銷貨單(Email用)
 * 一份設定描述每張單的欄位，共用三個產出器：
 *   buildDocx()      → Word 檔
 *   buildXlsx()      → Excel 檔
 *   buildEmailHtml() → Email 內文 HTML
 *
 * 由 /api/docs/[type]/[id]/export-docx | export-xlsx | send-email 呼叫。
 */

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign,
} from 'docx'
import ExcelJS from 'exceljs'

export type DocType = 'purchase-order' | 'return' | 'shipment' | 'inquiry' | 'sales-order'

export type DocData = {
  title: string
  docNo: string
  dateStr: string
  partyLines: string[]                 // 對象資訊（單位/廠商/聯絡人…）
  columns: { label: string; width: number; align: 'left' | 'center' | 'right' }[]
  rows: { cells: string[]; isCategory?: boolean }[]
  totalLabel?: string
  totalValue?: string
  notes: string[]
  companyName: string
  companyPhone: string
}

const fmt = (n: any) => Number(n ?? 0).toLocaleString('zh-TW')

export async function fetchDocData(supabase: any, type: DocType, id: string): Promise<DocData | null> {
  const { data: settings } = await supabase.from('system_settings').select('*').single()
  const companyName = settings?.company_name ?? '光輝影音科技'
  const companyPhone = settings?.company_phone ?? '03-8321087'
  const dateOf = (d: any) => d ? new Date(d).toLocaleDateString('zh-TW') : ''

  if (type === 'purchase-order') {
    const [{ data: o }, { data: items }] = await Promise.all([
      supabase.from('purchase_orders').select('*').eq('id', id).single(),
      supabase.from('purchase_order_items').select('*').eq('order_id', id).order('seq_no'),
    ])
    if (!o) return null
    const notes: string[] = []
    if (o.payment_terms) notes.push(`付款條件：${o.payment_terms}`)
    if (o.notes) notes.push(o.notes)
    let no = 0
    return {
      title: '訂購單', docNo: o.order_no, dateStr: dateOf(o.created_at),
      partyLines: [
        `廠商：${o.vendor_name ?? ''}${o.vendor_contact ? `　聯絡人：${o.vendor_contact}` : ''}${o.vendor_phone ? `　電話：${o.vendor_phone}` : ''}`,
      ],
      columns: [
        { label: '編號', width: 6, align: 'center' }, { label: '品牌', width: 12, align: 'left' },
        { label: '品名', width: 30, align: 'left' }, { label: '型號', width: 14, align: 'left' },
        { label: '單位', width: 7, align: 'center' }, { label: '數量', width: 7, align: 'center' },
        { label: '單價', width: 12, align: 'right' }, { label: '金額', width: 12, align: 'right' },
      ],
      rows: (items ?? []).map((i: any) => i.is_category
        ? (no = 0, { cells: [i.product_name ?? ''], isCategory: true })
        : (no += 1, { cells: [String(no), i.brand ?? '', i.product_name ?? '', i.model ?? '', i.unit ?? '', String(i.quantity), fmt(i.unit_price), fmt(i.quantity * i.unit_price)] })),
      totalLabel: '含稅總計', totalValue: `NT$${fmt(o.total_amount)}`,
      notes, companyName, companyPhone,
    }
  }

  if (type === 'return') {
    const [{ data: o }, { data: items }] = await Promise.all([
      supabase.from('returns').select('*, clients(company_name), vendors(company_name)').eq('id', id).single(),
      supabase.from('return_items').select('*').eq('return_id', id).order('seq_no'),
    ])
    if (!o) return null
    const party = o.return_type === '客戶退貨' ? (o as any).clients?.company_name : (o as any).vendors?.company_name
    const notes: string[] = []
    if (o.return_reason) notes.push(`退貨原因：${o.return_reason}`)
    if (o.ref_doc_no) notes.push(`關聯單據：${o.ref_doc_no}`)
    if (o.settlement_method) notes.push(`結算方式：${o.settlement_method}`)
    if (o.notes) notes.push(o.notes)
    return {
      title: '退貨單', docNo: o.return_no, dateStr: dateOf(o.return_date),
      partyLines: [`${o.return_type === '客戶退貨' ? '單位名稱' : '廠商'}：${party ?? ''}　類型：${o.return_type}`],
      columns: [
        { label: '編號', width: 6, align: 'center' }, { label: '品名', width: 34, align: 'left' },
        { label: '型號', width: 16, align: 'left' }, { label: '單位', width: 8, align: 'center' },
        { label: '數量', width: 8, align: 'center' }, { label: '單價', width: 14, align: 'right' },
        { label: '金額', width: 14, align: 'right' },
      ],
      rows: (items ?? []).map((i: any, idx: number) => ({
        cells: [String(idx + 1), i.product_name ?? '', i.model ?? '', i.unit ?? '', String(i.quantity), fmt(i.unit_price), fmt(i.quantity * i.unit_price)],
      })),
      totalLabel: '退貨總額', totalValue: `NT$${fmt(o.total_amount)}`,
      notes, companyName, companyPhone,
    }
  }

  if (type === 'shipment') {
    const [{ data: o }, { data: items }] = await Promise.all([
      supabase.from('shipments').select('*, clients(company_name)').eq('id', id).single(),
      supabase.from('shipment_items').select('*').eq('shipment_id', id).order('seq_no'),
    ])
    if (!o) return null
    const notes: string[] = []
    if (o.delivery_method) notes.push(`配送方式：${o.delivery_method}${o.carrier ? `（${o.carrier}）` : ''}`)
    if (o.tracking_no) notes.push(`託運單號：${o.tracking_no}`)
    if (o.expected_date) notes.push(`預計到貨：${dateOf(o.expected_date)}`)
    if (o.address) notes.push(`送貨地址：${o.address}`)
    if (o.notes) notes.push(o.notes)
    return {
      title: '出貨單', docNo: o.shipment_no, dateStr: dateOf(o.ship_date),
      partyLines: [
        `單位名稱：${(o as any).clients?.company_name ?? ''}${o.project_name ? `　案名：${o.project_name}` : ''}`,
        `${o.receiver_name ? `收件人：${o.receiver_name}` : ''}${o.receiver_phone ? `　電話：${o.receiver_phone}` : ''}`,
      ].filter(Boolean),
      columns: [
        { label: '編號', width: 8, align: 'center' }, { label: '品名', width: 40, align: 'left' },
        { label: '型號', width: 20, align: 'left' }, { label: '單位', width: 10, align: 'center' },
        { label: '數量', width: 10, align: 'center' }, { label: '備註', width: 12, align: 'left' },
      ],
      rows: (items ?? []).map((i: any, idx: number) => ({
        cells: [String(idx + 1), i.product_name ?? '', i.model ?? '', i.unit ?? '', String(i.quantity), i.item_notes ?? ''],
      })),
      notes, companyName, companyPhone,
    }
  }

  if (type === 'inquiry') {
    const [{ data: o }, { data: items }] = await Promise.all([
      supabase.from('inquiries').select('*').eq('id', id).single(),
      supabase.from('inquiry_items').select('*').eq('inquiry_id', id).order('sort_order'),
    ])
    if (!o) return null
    const notes: string[] = []
    if (o.reply_deadline) notes.push(`回覆期限：${dateOf(o.reply_deadline)}`)
    if (o.notes) notes.push(o.notes)
    return {
      title: '詢價單', docNo: o.inquiry_no, dateStr: dateOf(o.inquiry_date),
      partyLines: [`廠商：${o.vendor_name ?? ''}${o.contact_name ? `　聯絡人：${o.contact_name}` : ''}${o.phone ? `　電話：${o.phone}` : ''}`],
      columns: [
        { label: '編號', width: 6, align: 'center' }, { label: '品名', width: 34, align: 'left' },
        { label: '型號', width: 16, align: 'left' }, { label: '單位', width: 8, align: 'center' },
        { label: '數量', width: 8, align: 'center' }, { label: '報價單價', width: 14, align: 'right' },
        { label: '交期(天)', width: 14, align: 'center' },
      ],
      rows: (items ?? []).map((i: any, idx: number) => ({
        cells: [String(idx + 1), i.product_name ?? '', i.model ?? '', i.unit ?? '', String(i.quantity), i.vendor_price != null ? fmt(i.vendor_price) : '', i.lead_time_days != null ? String(i.lead_time_days) : ''],
      })),
      notes, companyName, companyPhone,
    }
  }

  if (type === 'sales-order') {
    const [{ data: o }, { data: items }] = await Promise.all([
      supabase.from('sales_orders').select('*, clients(company_name)').eq('id', id).single(),
      supabase.from('sales_order_items').select('*').eq('order_id', id).order('seq_no'),
    ])
    if (!o) return null
    const notes: string[] = []
    if (o.delivery_date) notes.push(`交貨日期：${o.delivery_date}`)
    if (o.payment_terms) notes.push(`付款條件：${o.payment_terms}`)
    if (o.notes) notes.push(o.notes)
    let no = 0
    return {
      title: '銷貨單', docNo: o.order_no, dateStr: dateOf(o.created_at),
      partyLines: [`單位名稱：${(o as any).clients?.company_name ?? ''}${o.contact_name ? `　聯絡人：${o.contact_name}` : ''}${o.client_phone ? `　電話：${o.client_phone}` : ''}`],
      columns: [
        { label: '編號', width: 6, align: 'center' }, { label: '品牌', width: 12, align: 'left' },
        { label: '品名', width: 30, align: 'left' }, { label: '型號', width: 14, align: 'left' },
        { label: '單位', width: 7, align: 'center' }, { label: '數量', width: 7, align: 'center' },
        { label: '含稅單價', width: 12, align: 'right' }, { label: '含稅金額', width: 12, align: 'right' },
      ],
      rows: (items ?? []).map((i: any) => i.is_category
        ? (no = 0, { cells: [i.product_name ?? ''], isCategory: true })
        : (no += 1, { cells: [String(no), i.brand ?? '', i.product_name ?? '', i.model ?? '', i.unit ?? '', String(i.quantity), fmt(i.unit_price), fmt(i.quantity * i.unit_price)] })),
      totalLabel: '含稅總計', totalValue: `NT$${fmt(o.total_amount)}`,
      notes, companyName, companyPhone,
    }
  }

  return null
}

/* ── Word ─────────────────────────────────────────── */
const border = {
  top: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
  left: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
  right: { style: BorderStyle.SINGLE, size: 2, color: '999999' },
}
const alignMap = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT } as const

export async function buildDocx(d: DocData): Promise<Buffer> {
  const headerRow = new TableRow({
    tableHeader: true,
    children: d.columns.map(c => new TableCell({
      width: { size: c.width, type: WidthType.PERCENTAGE },
      shading: { fill: 'D9D9D9' }, borders: border, verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: c.label, bold: true, size: 20 })] })],
    })),
  })
  const rows = d.rows.map(r => r.isCategory
    ? new TableRow({ children: [new TableCell({
        columnSpan: d.columns.length, shading: { fill: 'ECECEC' }, borders: border,
        children: [new Paragraph({ children: [new TextRun({ text: r.cells[0], bold: true, size: 20 })] })],
      })] })
    : new TableRow({
        children: r.cells.map((v, i) => new TableCell({
          width: { size: d.columns[i].width, type: WidthType.PERCENTAGE },
          borders: border, verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: alignMap[d.columns[i].align], children: [new TextRun({ text: v, size: 20 })] })],
        })),
      }))
  const totalRow = d.totalValue ? [new TableRow({
    children: [
      new TableCell({ columnSpan: d.columns.length - 1, borders: border,
        children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: d.totalLabel ?? '總計', bold: true, size: 20 })] })] }),
      new TableCell({ borders: border,
        children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: d.totalValue, bold: true, size: 22 })] })] }),
    ],
  })] : []

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: d.companyName, bold: true, size: 32 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: d.title, bold: true, size: 28 })] }),
        new Paragraph({ children: [new TextRun({ text: `單號：${d.docNo}　日期：${d.dateStr}`, size: 20 })] }),
        ...d.partyLines.map(l => new Paragraph({ children: [new TextRun({ text: l, size: 20 })] })),
        new Paragraph({ text: '' }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...rows, ...totalRow] }),
        new Paragraph({ text: '' }),
        ...(d.notes.length > 0 ? [
          new Paragraph({ children: [new TextRun({ text: '備註事項', bold: true, size: 20 })] }),
          ...d.notes.map((n, i) => new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${n}`, size: 18 })] })),
        ] : []),
        new Paragraph({ children: [new TextRun({ text: `${d.companyName}　服務電話：${d.companyPhone}`, size: 16, color: '888888' })] }),
      ],
    }],
  })
  return Buffer.from(await Packer.toBuffer(doc))
}

/* ── Excel ────────────────────────────────────────── */
export async function buildXlsx(d: DocData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = `${d.companyName} CRM`
  const ws = wb.addWorksheet(d.title, { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true } })
  ws.columns = d.columns.map(c => ({ width: Math.max(8, c.width) }))
  const n = d.columns.length

  ws.mergeCells(1, 1, 1, n); ws.getCell(1, 1).value = d.companyName
  ws.getCell(1, 1).font = { bold: true, size: 16 }; ws.getCell(1, 1).alignment = { horizontal: 'center' }
  ws.mergeCells(2, 1, 2, n); ws.getCell(2, 1).value = d.title
  ws.getCell(2, 1).font = { bold: true, size: 13 }; ws.getCell(2, 1).alignment = { horizontal: 'center' }
  ws.mergeCells(3, 1, 3, n); ws.getCell(3, 1).value = `單號：${d.docNo}　日期：${d.dateStr}`
  let r = 4
  for (const l of d.partyLines) { ws.mergeCells(r, 1, r, n); ws.getCell(r, 1).value = l; r++ }
  r++

  const headerRowIdx = r
  d.columns.forEach((c, i) => {
    const cell = ws.getCell(headerRowIdx, i + 1)
    cell.value = c.label
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  })
  r++
  for (const row of d.rows) {
    if (row.isCategory) {
      ws.mergeCells(r, 1, r, n)
      const cell = ws.getCell(r, 1)
      cell.value = row.cells[0]; cell.font = { bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECECEC' } }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    } else {
      row.cells.forEach((v, i) => {
        const cell = ws.getCell(r, i + 1)
        cell.value = v
        cell.alignment = { horizontal: d.columns[i].align, wrapText: true }
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      })
    }
    r++
  }
  if (d.totalValue) {
    ws.mergeCells(r, 1, r, n - 1)
    ws.getCell(r, 1).value = d.totalLabel ?? '總計'
    ws.getCell(r, 1).alignment = { horizontal: 'right' }; ws.getCell(r, 1).font = { bold: true }
    ws.getCell(r, n).value = d.totalValue
    ws.getCell(r, n).alignment = { horizontal: 'right' }; ws.getCell(r, n).font = { bold: true }
    r++
  }
  r++
  if (d.notes.length > 0) {
    ws.mergeCells(r, 1, r, n); ws.getCell(r, 1).value = '備註事項'; ws.getCell(r, 1).font = { bold: true }; r++
    for (const [i, note] of d.notes.entries()) { ws.mergeCells(r, 1, r, n); ws.getCell(r, 1).value = `${i + 1}. ${note}`; r++ }
  }
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

/* ── Email HTML ───────────────────────────────────── */
export function buildEmailHtml(d: DocData): string {
  const td = 'padding:6px 8px; border:1px solid #d1d5db; font-size:13px;'
  const th = td + 'background:#f3f4f6; font-weight:bold;'
  const rows = d.rows.map(r => r.isCategory
    ? `<tr><td colspan="${d.columns.length}" style="${td}background:#ececec;font-weight:bold;">${r.cells[0]}</td></tr>`
    : `<tr>${r.cells.map((v, i) => `<td style="${td}text-align:${d.columns[i].align};">${v}</td>`).join('')}</tr>`
  ).join('')
  return `
    <div style="font-family:'Microsoft JhengHei',sans-serif; max-width:720px;">
      <h2 style="margin:0 0 4px;">${d.title}</h2>
      <p style="font-size:13px; color:#374151; margin:4px 0;">
        單號：${d.docNo}　日期：${d.dateStr}<br/>${d.partyLines.join('<br/>')}
      </p>
      <table style="border-collapse:collapse; width:100%; margin-top:8px;">
        <tr>${d.columns.map(c => `<th style="${th}">${c.label}</th>`).join('')}</tr>
        ${rows}
        ${d.totalValue ? `<tr><td colspan="${d.columns.length - 1}" style="${td}text-align:right;font-weight:bold;">${d.totalLabel}</td><td style="${td}text-align:right;font-weight:bold;font-size:15px;">${d.totalValue}</td></tr>` : ''}
      </table>
      ${d.notes.length > 0 ? `<h4 style="margin:16px 0 4px;">備註事項</h4><ol style="font-size:13px;color:#374151;margin:0;padding-left:20px;">${d.notes.map(x => `<li>${x}</li>`).join('')}</ol>` : ''}
      <hr style="margin:20px 0; border:none; border-top:1px solid #e5e7eb;" />
      <p style="color:#6b7280; font-size:12px;">${d.companyName}　服務電話：${d.companyPhone}<br/>此單據由 CRM 系統寄出，如有疑問請直接回覆此信。</p>
    </div>
  `
}
