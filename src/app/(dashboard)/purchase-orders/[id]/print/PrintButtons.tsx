'use client'

import { useState, useEffect } from 'react'
import { downloadPdf, sharePdf } from '@/lib/pdf-paginate'
import PrintPreviewModal from '@/components/PrintPreviewModal'

function getFileName() {
  const t = (document.title || '').trim()
  if (t) return t.replace(/[\\/:*?"<>|]/g, '')
  const titleEl = document.querySelector('h1')
  return (titleEl?.textContent || '訂購單').replace(/\s+/g, '')
}

export default function PrintButtons() {
  const [loading, setLoading] = useState<'' | 'download' | 'share'>('')
  const [docOrientation, setDocOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [showPreview, setShowPreview] = useState(false)

  // 由詳情頁帶 ?preview=1 進來時自動開啟列印預覽
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('preview') === '1') setShowPreview(true)
  }, [])

  // 手機瀏覽器會忽略 @page 的紙張方向 → 橫向列印無效。
  // 因此手機按「橫向列印」時，改為直接產生橫向 PDF（分享／下載後再列印）。
  const isMobile = () =>
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 1024

  const printWith = async (orientation: 'portrait' | 'landscape') => {
    setDocOrientation(orientation)

    if (orientation === 'landscape' && isMobile()) {
      if (loading) return
      setLoading('share')
      try {
        const result = await sharePdf(getFileName(), true)
        if (result === 'downloaded') {
          alert('已產生橫向 PDF，請從下載的檔案列印或傳送')
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          console.error(e)
          alert('橫向 PDF 產生失敗，請稍後再試')
        }
      } finally {
        setLoading('')
      }
      return
    }

    // 重建方向樣式並掛在 body 尾端 → 排在頁面內建 @page 規則之後，確保生效
    document.getElementById('print-orientation-style')?.remove()
    const s = document.createElement('style')
    s.id = 'print-orientation-style'
    // ⚠ 用明確 mm 尺寸而非 `A4 landscape`：
    //   1. Chrome 列印對話框會記住上次手動選的方向，明確尺寸較不易被蓋掉
    //   2. 橫向時同步放寬 .page，否則內容仍是 210mm 寬，看起來像「方向沒生效」
    s.textContent =
      orientation === 'landscape'
        ? '@media print{@page{size:297mm 210mm;margin:12mm}.page{max-width:none!important;width:auto!important}}'
        : '@media print{@page{size:210mm 297mm;margin:15mm 14mm}.page{max-width:none!important;width:auto!important}}'
    document.body.appendChild(s)

    // 等樣式套用完成再叫列印，避免 Chrome 用舊版面產生預覽
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
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
        onClick={() => setShowPreview(true)}
        style={{ padding: '8px 20px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
      >
        預覽列印
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

      <PrintPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        fileName={getFileName()}
        landscape={docOrientation === 'landscape'}
      />
    </div>
  )
}
