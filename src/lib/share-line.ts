'use client'

/**
 * 桌機版 LINE 分享
 *
 * 問題：LINE for Windows（UWP）沒有註冊「檔案」share target，只吃 text / URL。
 *      所以 navigator.share({ files }) 在桌機會跳出 Windows 分享匣、LINE 圖示也在，
 *      但點下去不會帶入 PDF —— 這不是本站的 bug，是 LINE 桌機版的限制。
 *
 * 解法：桌機不送檔案，改把 PDF 上傳到 Supabase Storage，取簽章連結後給使用者。
 *      手機／平板維持原本的 navigator.share({ files })，行為完全不變。
 *
 * ⚠ 為什麼不用 window.open 直接跳 LINE？
 *   實測（2026-07-29）在 Chrome 桌機會被 popup blocker 擋掉，症狀是「按了沒反應」。
 *   即使先開佔位視窗也不保險。因此改為顯示一個面板，讓使用者按面板上的
 *   真實連結 —— 使用者親自點 <a> 永遠不會被擋。
 */

import { createClient } from './supabase'

/** 私有 bucket，需先執行 supabase/schema_shared_docs.sql 建立 */
const BUCKET = 'shared-docs'

/** 連結有效期：7 天 */
export const SHARE_EXPIRY_SECONDS = 7 * 24 * 60 * 60

/**
 * 是否為「LINE 檔案分享真的可用」的平台。
 *
 * 不能只看 navigator.canShare —— Windows Chrome 對 PDF 也會回 true
 * （系統分享匣確實接受，但 LINE 那個 target 不接受），這正是本 bug 的根因。
 */
export function supportsNativeFileShare(): boolean {
  if (typeof navigator === 'undefined') return false

  const uaData = (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData
  const isMobileUA = uaData?.mobile ?? /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

  // iPadOS 13+ 會偽裝成 Mac，用觸控點數補判
  const isIPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1

  return (isMobileUA || isIPadOS) && typeof navigator.share === 'function'
}

/**
 * 供 Content-Disposition 使用的檔名（可含中文）。
 * 只需擋掉會破壞 header 的字元。
 */
/**
 * 下載檔名（給簽章連結的 download 參數用）
 *
 * 保留中文，只清掉檔案系統不接受的字元與換行。
 * 中文本身可以放在網址裡 —— 但必須做百分比編碼，見下方 appendDownloadName()。
 */
function safeDownloadName(name: string): string {
  return name.replace(/[\\/:*?"<>|\r\n\t]/g, '').trim().slice(0, 80) || '單據'
}

/**
 * 把下載檔名以百分比編碼掛回簽章連結。
 *
 * 不倚賴 SDK 是否有幫忙編碼 —— 先移除它可能已加上的 download 參數，
 * 再用 encodeURIComponent 自己接一次，確保中文與括號都被正確編碼，
 * 產生的網址不會夾帶空白或非法字元。
 */
function appendDownloadName(signedUrl: string, fileName: string): string {
  const base = signedUrl.replace(/([?&])download=[^&]*/i, '$1').replace(/[?&]$/, '')
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}download=${encodeURIComponent(`${safeDownloadName(fileName)}.pdf`)}`
}

/**
 * 上傳 PDF 到 Storage 並取得限時簽章連結。
 *
 * 路徑含 UUID，無法被猜到；bucket 為 private，只有簽章連結能讀。
 */
export async function uploadAndCreateSignedUrl(
  blob: Blob,
  fileName: string,
): Promise<string> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('登入狀態已失效，請重新登入後再分享')

  // ⚠ Supabase Storage 的 object key 只接受 ASCII 安全字元。
  //   中文、全形括號都會被拒（400 InvalidKey），所以路徑一律用 UUID，
  //   真正的中文檔名改由簽章連結的 download 參數帶出。
  const now = new Date()
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const path = `${yyyymm}/${crypto.randomUUID()}.pdf`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'application/pdf',
    upsert: false,
    cacheControl: '3600',
  })
  if (uploadError) {
    throw new Error(`PDF 上傳失敗：${uploadError.message}`)
  }

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SHARE_EXPIRY_SECONDS)

  if (signError || !data?.signedUrl) {
    throw new Error(`產生分享連結失敗：${signError?.message ?? '未知錯誤'}`)
  }

  // 讓客戶存檔時拿到中文檔名，而不是一串 UUID
  return appendDownloadName(data.signedUrl, fileName)
}

/** 組 LINE 訊息內容 */
export function buildLineMessage(fileName: string, url: string): string {
  // 網址放最後且獨立成行：後面若接文字，部分聊天軟體會把它一起併進連結而失效
  return [fileName, '光輝影音科技', '', '請點擊連結查看：', url].join('\n')
}

/** LINE 分享網址 */
export function buildLineShareUrl(message: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(message)}`
}

/**
 * 顯示分享面板。
 *
 * 刻意用原生 DOM 而非 React —— 這樣六支 PrintButtons.tsx 都不必改，
 * 報價單／銷貨單／訂購單／送修單／維修報價單一次到位。
 *
 * 不使用 alert()：alert 會凍結整個分頁，使用者以為當掉。
 */
export function showShareLinkPanel(fileName: string, url: string): void {
  document.getElementById('gh-share-panel')?.remove()

  const message = buildLineMessage(fileName, url)
  const expiry = new Date(Date.now() + SHARE_EXPIRY_SECONDS * 1000)
  const expiryText = new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(expiry)

  const overlay = document.createElement('div')
  overlay.id = 'gh-share-panel'
  overlay.className = 'no-print'
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999',
    'background:rgba(15,23,42,.45)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'font-family:system-ui,-apple-system,"Noto Sans TC","Microsoft JhengHei",sans-serif',
  ].join(';')

  const card = document.createElement('div')
  card.style.cssText = [
    'width:min(460px,92vw)', 'background:#fff', 'border-radius:16px',
    'padding:24px', 'box-shadow:0 20px 50px rgba(0,0,0,.25)',
  ].join(';')

  card.innerHTML = `
    <div style="font-size:16px;font-weight:600;color:#0f172a;margin-bottom:6px">分享單據</div>
    <div style="font-size:12px;color:#94a3b8;margin-bottom:16px;line-height:1.6">
      LINE 電腦版無法直接接收 PDF 附件，因此改用連結分享。<br>
      連結 ${expiryText} 到期。
    </div>
    <input id="gh-share-url" readonly value="${url.replace(/"/g, '&quot;')}"
      style="width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #e2e8f0;
             border-radius:8px;font-size:12px;color:#475569;background:#f8fafc;margin-bottom:14px">
    <div style="display:flex;gap:8px">
      <a id="gh-share-line" href="${buildLineShareUrl(message).replace(/"/g, '&quot;')}"
         target="_blank" rel="noopener noreferrer"
         style="flex:1;text-align:center;padding:10px;background:#06C755;color:#fff;
                border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
        開啟 LINE 傳送
      </a>
      <button id="gh-share-copy"
        style="flex:1;padding:10px;background:#fff;color:#334155;border:1px solid #cbd5e1;
               border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">
        複製連結
      </button>
      <button id="gh-share-copy-msg"
        style="flex:1;padding:10px;background:#fff;color:#334155;border:1px solid #cbd5e1;
               border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">
        複製訊息
      </button>
    </div>
    <button id="gh-share-close"
      style="width:100%;margin-top:8px;padding:9px;background:none;color:#94a3b8;
             border:none;font-size:13px;cursor:pointer">關閉</button>
  `

  overlay.appendChild(card)
  document.body.appendChild(overlay)

  const close = () => overlay.remove()

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })
  card.querySelector<HTMLButtonElement>('#gh-share-close')?.addEventListener('click', close)
  card.querySelector<HTMLAnchorElement>('#gh-share-line')?.addEventListener('click', () => {
    setTimeout(close, 300)
  })

  // 按鈕寫「複製連結」就只複製網址 —— 複製整段訊息會讓人貼到網址列變成搜尋
  const copyBtn = card.querySelector<HTMLButtonElement>('#gh-share-copy')
  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const input = card.querySelector<HTMLInputElement>('#gh-share-url')
      input?.select()
      document.execCommand('copy')
    }
    copyBtn.textContent = '已複製 ✓'
    setTimeout(() => (copyBtn.textContent = '複製連結'), 2000)
  })

  // 另外提供複製完整訊息（檔名＋說明＋連結），方便直接貼到聊天室
  const copyMsgBtn = card.querySelector<HTMLButtonElement>('#gh-share-copy-msg')
  copyMsgBtn?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(message) } catch { /* 忽略 */ }
    copyMsgBtn.textContent = '已複製 ✓'
    setTimeout(() => (copyMsgBtn.textContent = '複製訊息'), 2000)
  })

  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') {
      close()
      document.removeEventListener('keydown', esc)
    }
  })
}
