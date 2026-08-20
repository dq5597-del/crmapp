'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { downloadPdf, sharePdf, printPdf } from '@/lib/pdf-paginate'
import PrintPreviewModal from '@/components/PrintPreviewModal'

function getFileName() {
  const t = (document.title || '').trim()
  if (t) return t.replace(/[\\/:*?"<>|]/g, '')
  const titleEl = document.querySelector('h1')
  return (titleEl?.textContent || '報價單').replace(/\s+/g, '')
}

export default function PrintButtons() {
  const [loading, setLoading] = useState<'' | 'download' | 'share' | 'print' | 'printL'>('')
  const [showPreview, setShowPreview] = useState(false)
  const [previewLandscape, setPreviewLandscape] = useState(false)
  const [sharePrompt, setSharePrompt] = useState(false)

  // 備註版面：'col' = 含稅金額右側欄位（預設）、'row' = 品項下方整列
  // 切換方式是在列印容器上加減 class，兩種版面的 HTML 都已存在，由 CSS 決定顯示哪個，
  // 所以列印與 PDF 擷取到的一定是畫面上看到的那一版。
  const [noteMode, setNoteMode] = useState<'col' | 'row'>('col')
  useEffect(() => {
    const saved = (localStorage.getItem('gh-quote-note-mode') as 'col' | 'row' | null) ?? 'col'
    setNoteMode(saved)
  }, [])
  useEffect(() => {
    const page = document.getElementById('print-page-content')
    if (!page) return
    page.classList.toggle('note-mode-row', noteMode === 'row')
  }, [noteMode])
  // 金額顯示：給廠商看時可整組隱藏（單價、金額欄與總計區）
  const [showMoney, setShowMoney] = useState(true)
  useEffect(() => {
    setShowMoney(localStorage.getItem('gh-quote-hide-money') !== '1')
  }, [])
  useEffect(() => {
    document.getElementById('print-page-content')?.classList.toggle('hide-money', !showMoney)
  }, [showMoney])
  const toggleMoney = () => {
    setShowMoney(prev => {
      const next = !prev
      try { localStorage.setItem('gh-quote-hide-money', next ? '0' : '1') } catch { }
      return next
    })
  }

  const toggleNoteMode = () => {
    setNoteMode(prev => {
      const next = prev === 'col' ? 'row' : 'col'
      try { localStorage.setItem('gh-quote-note-mode', next) } catch { }
      return next
    })
  }
  const router = useRouter()

  /** 直向／橫向都先開預覽，確認版面後再由預覽視窗下載或分享 —— 不直接送印 */
  const openPreview = (landscape: boolean) => {
    setPreviewLandscape(landscape)
    setShowPreview(true)
  }

  /**
   * 關閉
   *
   * window.close() 只有「由程式開啟」的分頁（window.open）才有效；
   * 從列表直接點連結或自行輸入網址進來的分頁，Chrome 會直接忽略 —— 按了沒反應。
   * 因此先嘗試關閉，200ms 後若分頁還在，就退回上一頁／單據列表。
   */
  const handleClose = () => {
    window.close()
    setTimeout(() => {
      if (window.history.length > 1) router.back()
      else router.push('/quotes')
    }, 200)
  }

  // 由詳情頁帶 ?preview=1 進來時自動開啟列印預覽
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('preview') === '1') setShowPreview(true)
  }, [])

  /**
   * 列印（2026-07 改版）
   *
   * 走 printPdf()：先產生固定版面的 PDF（與「分享／下載 PDF」同一套分頁邏輯），
   * 再交給瀏覽器列印該 PDF。這樣列印對話框的「邊界／縮放」不會重排內容，
   * 印出的張數永遠等於排版頁數。
   *
   * 方向也一樣烤進 PDF：橫向不再依賴 `@page { size }`（會被 Chrome 記住的
   * 對話框設定蓋掉），而是直接產生橫向紙張的 PDF，列印必定是橫向。
   */
  const handlePrint = async (landscape = false) => {
    if (loading) return
    setLoading(landscape ? 'printL' : 'print')
    try {
      // 直向與橫向一致：都先產生 PDF 再開列印對話框，讓使用者確認後才印。
      // （不再走 queueCurrentDocument 直送印表機 —— 按下去就印，沒有反悔機會）
      const r = await printPdf(getFileName(), landscape)
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

  // 由詳情頁帶 ?share=1 進來時，顯示一鍵分享提示。
  //   為什麼不自動送出：navigator.share() 規格要求必須由使用者手勢直接觸發，
  //   用計時器自動呼叫會被瀏覽器擋掉（手機上就是「按了沒反應」）。
  //   因此改成跳一個大按鈕，讓那一下點擊帶著手勢進去。
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('share') === '1') setSharePrompt(true)
  }, [])

  return (
    <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 50 }}>
      <button
        onClick={() => setShowPreview(true)}
        style={{ padding: '8px 20px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
      >
        預覽列印
      </button>
      <button
        onClick={toggleMoney}
        title="隱藏後單價、金額與總計都不會出現，適合給廠商看"
        style={{ padding: '8px 14px', background: showMoney ? '#fff' : '#fef3c7', color: showMoney ? '#334155' : '#92400e', border: `1px solid ${showMoney ? '#cbd5e1' : '#fcd34d'}`, borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
      >
        金額：{showMoney ? '顯示' : '隱藏'}
      </button>
      <button
        onClick={toggleNoteMode}
        title="切換品項備註的位置，設定會記住"
        style={{ padding: '8px 14px', background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
      >
        備註：{noteMode === 'col' ? '右側欄' : '下方列'}
      </button>
      <button
        onClick={() => handlePrint(false)}
        disabled={!!loading}
        style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: loading ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: loading ? 0.7 : 1 }}
      >
        {loading === 'print' ? '排版中…' : '直向列印'}
      </button>
      <button
        onClick={() => handlePrint(true)}
        disabled={!!loading}
        style={{ padding: '8px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: loading ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: loading ? 0.7 : 1 }}
      >
        {loading === 'printL' ? '排版中…' : '橫向列印'}
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
        onClick={handleClose}
        style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
      >
        關閉
      </button>

      {sharePrompt && (
        <div className="no-print"
          style={{
            position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(15,23,42,.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => setSharePrompt(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, padding: 24, width: 'min(360px,92vw)', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>分享報價單</div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, marginBottom: 16 }}>
              點下方按鈕選擇要傳送的應用程式
            </div>
            <button
              onClick={async () => { setSharePrompt(false); await handleSharePdf() }}
              disabled={!!loading}
              style={{
                width: '100%', padding: '13px', background: '#2563eb', color: '#fff',
                border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}>
              {loading === 'share' ? '產生中…' : '選擇應用程式分享'}
            </button>
            <button onClick={() => setSharePrompt(false)}
              style={{ width: '100%', marginTop: 8, padding: 10, background: 'none', color: '#94a3b8', border: 'none', fontSize: 13, cursor: 'pointer' }}>
              取消
            </button>
          </div>
        </div>
      )}

      <PrintPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        fileName={getFileName()}
        landscape={previewLandscape}
      />
    </div>
  )
}
