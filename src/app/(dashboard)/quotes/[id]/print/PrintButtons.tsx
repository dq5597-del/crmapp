'use client'

import { useState } from 'react'

async function buildPdf() {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const el = document.getElementById('print-page-content')
  if (!el) throw new Error('找不到報價單內容')

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  })

  const imgData = canvas.toDataURL('image/jpeg', 0.95)
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  const imgWidth = pageWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  let heightLeft = imgHeight
  let position = 0

  pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
  heightLeft -= pageHeight

  while (heightLeft > 0) {
    position = heightLeft - imgHeight
    pdf.addPage()
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
  }
  return pdf
}

function getFileName() {
  const t = (document.title || '').trim()
  if (t) return t.replace(/[\\/:*?"<>|]/g, '')
  const titleEl = document.querySelector('h1')
  return (titleEl?.textContent || '估價單').replace(/\s+/g, '')
}

export default function PrintButtons() {
  const [loading, setLoading] = useState<'' | 'download' | 'share'>('')

  const handleDownloadPdf = async () => {
    if (loading) return
    setLoading('download')
    try {
      const pdf = await buildPdf()
      pdf.save(`${getFileName()}.pdf`)
    } catch (e) {
      console.error(e)
      alert('PDF 產生失敗，請稍後再試，或改用「列印」功能')
    } finally {
      setLoading('')
    }
  }

  const handleSharePdf = async () => {
    if (loading) return
    setLoading('share')
    try {
      const fileName = getFileName()
      const pdf = await buildPdf()
      const blob = pdf.output('blob')
      const file = new File([blob], `${fileName}.pdf`, { type: 'application/pdf' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName })
      } else {
        pdf.save(`${fileName}.pdf`)
        alert('此裝置不支援直接分享，已改為下載 PDF，請自行傳送檔案')
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error(e)
        alert('PDF 分享失敗，請稍後再試')
      }
    } finally {
      setLoading('')
    }
  }

  return (
    <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 50 }}>
      <button
        onClick={handleSharePdf}
        disabled={!!loading}
        style={{ padding: '8px 20px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, cursor: loading ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: loading ? 0.7 : 1 }}
      >
        {loading === 'share' ? '產生中…' : '分享 PDF'}
      </button>
      <button
        onClick={handleDownloadPdf}
        disabled={!!loading}
        style={{ padding: '8px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: loading ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: loading ? 0.7 : 1 }}
      >
        {loading === 'download' ? '產生中…' : '下載 PDF'}
      </button>
      <button
        onClick={() => window.print()}
        style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
      >
        列印
      </button>
      <button
        onClick={() => window.close()}
        style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
      >
        關閉
      </button>
    </div>
  )
}
