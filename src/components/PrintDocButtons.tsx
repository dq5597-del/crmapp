'use client'

import { useState, useEffect } from 'react'
import { downloadPdf, sharePdf } from '@/lib/pdf-paginate'
import PrintPreviewModal from '@/components/PrintPreviewModal'

/** 通用列印/下載/分享 PDF 按鈕（智慧分頁：切點對齊表格列與區塊，不會切到一半） */
export default function PrintDocButtons({ fileName, landscape = false }: {
  fileName: string
  landscape?: boolean
}) {
  const [loading, setLoading] = useState<'' | 'download' | 'share'>('')
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('preview') === '1') setShowPreview(true)
  }, [])

  const handleDownloadPdf = async () => {
    if (loading) return
    setLoading('download')
    try {
      await downloadPdf(fileName, landscape)
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
      const result = await sharePdf(fileName, landscape)
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
      <button onClick={() => setShowPreview(true)}
        style={{ padding: '8px 20px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
        預覽列印
      </button>
      <button onClick={handleSharePdf} disabled={!!loading}
        style={{ padding: '8px 20px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, cursor: loading ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
        {loading === 'share' ? '產生中…' : '分享 PDF'}
      </button>
      <button onClick={handleDownloadPdf} disabled={!!loading}
        style={{ padding: '8px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: loading ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
        {loading === 'download' ? '產生中…' : '下載 PDF'}
      </button>
      <button onClick={async () => {
        // 手機忽略 @page 方向：橫向文件改產生橫向 PDF
        const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 1024
        if (landscape && mobile) {
          if (loading) return
          setLoading('share')
          try {
            const r = await sharePdf(fileName, true)
            if (r === 'downloaded') alert('已產生橫向 PDF，請從下載的檔案列印或傳送')
          } catch (e: any) {
            if (e?.name !== 'AbortError') { console.error(e); alert('橫向 PDF 產生失敗，請稍後再試') }
          } finally { setLoading('') }
          return
        }
        window.print()
      }}
        style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
        列印
      </button>
      <button onClick={() => window.close()}
        style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
        關閉
      </button>

      <PrintPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        fileName={fileName}
        landscape={landscape}
      />
    </div>
  )
}
