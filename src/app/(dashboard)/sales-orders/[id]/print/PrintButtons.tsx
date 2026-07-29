'use client'

import { useState, useEffect } from 'react'
import { downloadPdf, sharePdf } from '@/lib/pdf-paginate'
import { printTextPdf } from '@/lib/text-pdf'
import PrintPreviewModal from '@/components/PrintPreviewModal'

function getFileName() {
  const t = (document.title || '').trim()
  if (t) return t.replace(/[\\/:*?"<>|]/g, '')
  const titleEl = document.querySelector('h1')
  return (titleEl?.textContent || '銷貨單').replace(/\s+/g, '')
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
   * 不再提供直向／橫向切換 —— 單據一律 A4 直向。
   * 原本靠 `@page { size }` + 瀏覽器原生列印，會有兩個問題：
   *   1. 頁面掛在 dashboard 外殼下，列印時被視窗高度裁掉
   *   2. Chrome 會記住列印對話框上次的方向設定，@page 常常不生效
   *
   * 改為直接用 printTextPdf()：與「預覽列印／分享 PDF」同一套分頁排版器，
   * 每頁重複表頭、補白列、本頁小計、～續下頁～、頁碼，最後一頁收總金額與印章，
   * 且輸出為真實 HTML 文字（可選取、可搜尋、中文不失真）。
   */
  const handlePrint = async () => {
    if (loading) return
    setLoading('print')
    try {
      await printTextPdf(false)
    } catch (e) {
      console.error(e)
      alert('列印排版失敗：' + ((e as Error)?.message ?? '未知錯誤'))
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
