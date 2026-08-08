'use client'

export type CloudDocumentType = 'sales_order' | 'quote' | 'purchase_order' | 'purchase'

export async function queueHtmlDocument(documentType: CloudDocumentType, html: string, sourceId: string, orderNo: string, printerId?: string) {
  const res = await fetch('/api/print/jobs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_type: documentType, document_html: html, source_id: sourceId, order_no: orderNo, printer_id: printerId }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || '建立列印工作失敗')
  return json.printer as { id: string; name: string }
}

export async function queueCurrentDocument(documentType: Exclude<CloudDocumentType, 'purchase'>, orderNo: string, printerId?: string) {
  const parts = window.location.pathname.split('/').filter(Boolean)
  const sourceId = parts[parts.length - 2] || ''
  return queueHtmlDocument(documentType, '<!doctype html>' + document.documentElement.outerHTML, sourceId, orderNo, printerId)
}

export async function chooseTemporaryA4Printer(): Promise<{ id: string; name: string } | null> {
  const res = await fetch('/api/print/printers')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || '讀取印表機失敗')
  const printers = (json.printers ?? []).filter((p: any) => p.purpose !== 'warranty_label' && Number(p.label_width_mm) >= 200 && Number(p.label_height_mm) >= 280)
  if (!printers.length) throw new Error('目前沒有可用的 A4 印表機')
  const answer = window.prompt(`臨時選擇本次印表機：\n${printers.map((p: any, i: number) => `${i + 1}. ${p.name}${p.last_seen_at ? '' : '（離線）'}`).join('\n')}\n\n請輸入編號：`, '1')
  if (answer === null) return null
  const printer = printers[Number(answer) - 1]
  if (!printer) throw new Error('印表機編號不正確')
  return { id: printer.id, name: printer.name }
}
