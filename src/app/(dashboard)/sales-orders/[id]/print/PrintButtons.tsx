'use client'

import { useState } from 'react'
import { downloadPdf, sharePdf } from '@/lib/pdf-paginate'

function getFileName() {
  const t = (document.title || '').trim()
  if (t) return t.replace(/[\\/:*?"<>|]/g, '')
  const titleEl = document.querySelector('h1')
  return (titleEl?.textContent || '銷貨單').replace(/\s+/g, '')
}

export default function PrintButtons() {
  const [loading, setLoading] = useState<'' | 'download' | 'share'>('')
  const [docOrientation, setDocOrientation] = useState<'portrait' | 'landscape'>('portrait')

  const printWith = (orientation: 'portrait' | 'landscape') => {
    setDocOrientation(orientation)
    let s = document.getElementById('print-orientation-style') as HTMLStyleElement | null
    if (!s) {
      s = document.createElement('style')
      s.id = 'print-orientation-style'
      document.body.appendChild(s)
    }
    s.textContent = '@media print { @page { size: A4 ' + orientation + '; margin: 15mm 14mm; } }'
    window.print()
  }

  const handleDownloadPdf = async () => {
    if (loading) return
    setLoading('download')
    try {
      await downloadPdf(getFileName(), docOrientation === 'landscape')
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
      const result = await sharePdf(getFileName(), docOrientation === 'landscape')
      if (result === 'downloaded') {
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
        onClick={() => printWith('portrait')}
        style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
      >
        直向列印
      </button>
      <button
        onClick={() => printWith('landscape')}
        style={{ padding: '8px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
      >
        橫向列印
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
