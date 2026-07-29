'use client'

import { useState, useEffect } from 'react'
import { downloadPdf, sharePdf, printPdf } from '@/lib/pdf-paginate'
import PrintPreviewModal from '@/components/PrintPreviewModal'

function getFileName() {
  const t = (document.title || '').trim()
  if (t) return t.replace(/[\\/:*?"<>|]/g, '')
  const titleEl = document.querySelector('h1')
  return (titleEl?.textContent || '估價單').replace(/\s+/g, '')
}

export default function PrintButtons() {
  const [loading, setLoading] = useState<'' | 'download' | 'share' | 'print'>('')
  const [showPreview, setShowPreview] = useState(false)

  // 由詳情頁帶 ?preview=1 進來時自動開啟列印預覽
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('preview') === '1') setShowPreview(true)
  }, [])

  /**
   * 列印（2026-07 改版）
   *
   * 不提供直向／橫向、也不需要使用者調整任何列印設定 —— 單據一律 A4 直向。
   *
   * 走 printPdf()：先產生固定版面的 PDF（與「分享／下載 PDF」同一套分頁邏輯），
   * 再交給瀏覽器列印該 PDF。這樣列印對話框的「邊界／縮放」不會重排內容，
   * 印出的張數永遠等於排版頁數。
   */
  const handlePrint = async () => {
    if (loading) return
    setLoading('print')
    try {
      const r = await printPdf(getFileName(), false)
      if (r === 'downloaded') alert('無法直接開啟列印，已改為下載 PDF，請開啟檔案後列印')
    } catch (e) {
      console.error(e)
      alert('列印失敗：' + ((e as Error)?.message ?? '未知錯誤'))
    } finally {
      setLoading('')
    }
  }

  const handleDownloadPdf = async () => {
    if (loading) return
    setLoading('download')
    try {
      await downloadPdf(getFileName(), false)
    } catch (e) {
      console.error(e)
      alert('PDF 產生失敗：' + ((e as Error)?.message ?? '未知錯誤'))
    } finally {
      setLoading('')
    }
  }

  const handleSharePdf = async () => {
    if (loading) return
    setLoading('share')
    try {
      const result = await sharePdf(getFileName(), false)
      if (result === 'downloaded') {
        alert('此裝置不支援直接分享，已改為下載 PDF，請自行傳送檔案')
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error(e)
        alert('PDF 分享失敗：' + (e?.message ?? '未知錯誤'))
      }
    } finally {
      setLoading('')
    }
  }

  return (
    <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 50 }}>
      <button
        onClick={() => setShowPreview(true)}
        style={{ padding: '8px 20px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
      >
        預覽列印
      </button>
      <button
        onClick={handlePrint}
        disabled={!!loading}
        style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: loading ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: loading ? 0.7 : 1 }}
      >
        {loading === 'print' ? '排版中…' : '列印'}
      </button>
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
        onClick={() => window.close()}
        style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
      >
        關閉
      </button>

      <PrintPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        fileName={getFileName()}
        landscape={false}
      />
    </div>
  )
}
