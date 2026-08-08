'use client'

export type CloudDocumentType = 'quote' | 'purchase_order' | 'purchase'

export async function queueHtmlDocument(documentType: CloudDocumentType, html: string, sourceId: string, orderNo: string) {
  const res = await fetch('/api/print/jobs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_type: documentType, document_html: html, source_id: sourceId, order_no: orderNo }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || '建立列印工作失敗')
  return json.printer as { id: string; name: string }
}

export async function queueCurrentDocument(documentType: Exclude<CloudDocumentType, 'purchase'>, orderNo: string) {
  const parts = window.location.pathname.split('/').filter(Boolean)
  const sourceId = parts[parts.length - 2] || ''
  return queueHtmlDocument(documentType, '<!doctype html>' + document.documentElement.outerHTML, sourceId, orderNo)
}
