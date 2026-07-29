'use client'

/**
 * 桌機版 LINE 分享
 *
 * 問題：LINE for Windows（UWP）沒有註冊「檔案」share target，只吃 text / URL。
 *      所以 navigator.share({ files }) 在桌機會跳出 Windows 分享匣、LINE 圖示也在，
 *      但點下去不會帶入 PDF —— 這不是本站的 bug，是 LINE 桌機版的限制。
 *
 * 解法：桌機不送檔案，改把 PDF 上傳到 Supabase Storage，取簽章連結後送給 LINE。
 *      手機／平板維持原本的 navigator.share({ files })，行為完全不變。
 */

import { createClient } from './supabase'

/** 私有 bucket，需先在 Supabase 建立（見 supabase/migrations 內的 SQL） */
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

/** 移除檔名不合法字元 */
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|\r\n\t]/g, '').trim().slice(0, 80) || '單據'
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
  if (!user) throw new Error('請先登入後再分享')

  const id = crypto.randomUUID()
  const now = new Date()
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const path = `${yyyymm}/${id}/${safeName(fileName)}.pdf`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'application/pdf',
    upsert: false,
    // 讓客戶點連結時是「線上預覽」而不是直接下載
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

  return data.signedUrl
}

/** 組 LINE 訊息內容 */
export function buildLineMessage(fileName: string, url: string): string {
  return [`${fileName}`, '', '請點擊連結查看：', url, '', '光輝影音科技'].join('\n')
}

/**
 * ⚠ 必須在使用者點擊事件的**同步階段**呼叫。
 *
 * 若等 await 完才 window.open，Chrome / Edge 的 popup blocker 會攔截 ——
 * 表現就是「按了完全沒反應」。所以先開空白視窗佔位，拿到網址後再導向。
 */
export function openPlaceholderWindow(): Window | null {
  return window.open('', '_blank', 'width=600,height=700')
}

/**
 * 把佔位視窗導向 LINE 分享頁。
 *
 * 若視窗被 popup blocker 擋掉，**不**改用同分頁導向 —— 那會把列印預覽頁整個換掉，
 * 使用者辛苦調好的預覽就沒了。改為把訊息複製到剪貼簿並告知，讓他自己貼到 LINE。
 */
export async function redirectToLineShare(
  popup: Window | null,
  message: string,
): Promise<'opened' | 'copied'> {
  const lineUrl = `https://line.me/R/share?text=${encodeURIComponent(message)}`

  if (popup && !popup.closed) {
    popup.location.href = lineUrl
    return 'opened'
  }

  try {
    await navigator.clipboard.writeText(message)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = message
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }

  alert('瀏覽器擋下了 LINE 視窗。\n分享內容已複製到剪貼簿，請直接貼到 LINE 對話框。')
  return 'copied'
}
