'use client'

import { useEffect, useState } from 'react'
import { buildPaginatedPdfWithPages, downloadPdf, sharePdf } from '@/lib/pdf-paginate'
import { printTextPdf } from '@/lib/text-pdf'

const btn = (bg: string): React.CSSProperties => ({
  padding: '8px 16px', background: bg, color: '#fff', border: 'none',
  borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
})

/** 列印預覽：一頁一頁顯示 PDF 實際長相（含分頁位置與紙張方向） */
export default function PrintPreviewModal({ open, onClose, fileName, landscape }: {
  open: boolean
  onClose: () => void
  fileName: string
  landscape: boolean
}) {
  const [pages, setPages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<'' | 'download' | 'share'>('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setPages([])
    buildPaginatedPdfWithPages({ landscape })
      .then(r => { if (!cancelled) setPages(r.pages) })
      .catch(e => { console.error(e); alert('預覽產生失敗，請稍後再試') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, landscape])

  if (!open) return null

  const handleShare = async () => {
    if (busy) return
    setBusy('share')
    try {
      const r = await sharePdf(fileName, landscape)
      if (r === 'downloaded') alert('此裝置不支援直接分享，已改為下載 PDF')
    } catch (e: any) {
      if (e?.name !== 'AbortError') { console.error(e); alert('分享失敗，請稍後再試') }
    } finally { setBusy('') }
  }

  // 文字版 PDF（可選取/搜尋）：用瀏覽器「另存為 PDF」
  const handleTextPdf = async () => {
    if (busy) return
    setBusy('download')
    try { await printTextPdf(landscape) }
    catch (e) { console.error(e); alert('產生文字 PDF 失敗，請稍後再試') }
    finally { setBusy('') }
  }

  // 圖片版 PDF（精確版面、直接下載檔案）
  const handleDownloadImage = async () => {
    if (busy) return
    setBusy('download')
    try { await downloadPdf(fileName, landscape) }
    catch (e) { console.error(e); alert('下載失敗，請稍後再試') }
    finally { setBusy('') }
  }

  return (
    <div className="no-print" style={{
      position: 'fixed', inset: 0, background: 'rgba(17,24,39,.85)',
      zIndex: 100, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', gap: 8, padding: 12, background: '#111827',
        flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #374151',
      }}>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>
          列印預覽（{landscape ? '橫向' : '直向'}）
          {pages.length > 0 && `・共 ${pages.length} 頁`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleShare} disabled={!!busy || loading} style={{ ...btn('#0ea5e9'), opacity: busy || loading ? 0.6 : 1 }}>
            {busy === 'share' ? '處理中…' : '分享 PDF'}
          </button>
          <button onClick={handleDownloadImage} disabled={!!busy || loading} style={{ ...btn('#6b7280'), opacity: busy || loading ? 0.6 : 1 }}>
            圖片 PDF
          </button>
          <button onClick={handleTextPdf} disabled={!!busy || loading} style={{ ...btn('#16a34a'), opacity: busy || loading ? 0.6 : 1 }}>
            {busy === 'download' ? '處理中…' : '下載 PDF（文字）'}
          </button>
          <button onClick={onClose} style={btn('#6b7280')}>關閉預覽</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, textAlign: 'center' }}>
        {loading && (
          <div style={{ color: '#e5e7eb', padding: 48, fontSize: 15 }}>預覽產生中，請稍候…</div>
        )}
        {!loading && pages.length === 0 && (
          <div style={{ color: '#e5e7eb', padding: 48, fontSize: 15 }}>沒有可預覽的內容</div>
        )}
        {pages.map((src, i) => (
          <div key={i} style={{ marginBottom: 20 }}>
            <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 6 }}>
              第 {i + 1} 頁 / 共 {pages.length} 頁
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`第 ${i + 1} 頁`}
              style={{
                width: '100%', maxWidth: landscape ? 1123 : 794,
                background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,.5)',
                borderRadius: 2,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
