// 智慧分頁 PDF 產生器（2026-07 v2 像素掃描版）：
// 將 #print-page-content 截成長圖後，切頁點以「畫布像素掃描」尋找空白橫帶，
// 保證切線不會穿過任何文字/格線內容（不依賴 DOM 座標，避免 html2canvas 高度漂移）。

export async function buildPaginatedPdf(opts?: { landscape?: boolean }) {
  const { pdf } = await buildPaginatedPdfWithPages(opts)
  return pdf
}

/** 產生 PDF，同時回傳每頁的圖片 dataURL（供列印預覽使用） */
export async function buildPaginatedPdfWithPages(opts?: { landscape?: boolean }) {
  const landscape = opts?.landscape ?? false
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const el = document.getElementById('print-page-content')
  if (!el) throw new Error('找不到文件內容')

  // ── 手機修正：截圖前暫時把內容固定成 A4 寬度（96dpi），截完再還原 ──
  const A4_W_PX = landscape ? 1123 : 794
  const prevStyle = {
    width: el.style.width,
    minWidth: el.style.minWidth,
    maxWidth: el.style.maxWidth,
  }
  el.style.width = `${A4_W_PX}px`
  el.style.minWidth = `${A4_W_PX}px`
  el.style.maxWidth = 'none'
  // 等一次 layout（背景分頁 rAF 不會觸發 → 加 timeout 保底，避免卡死）
  await new Promise(r => {
    let done = false
    const fin = () => { if (!done) { done = true; r(null) } }
    requestAnimationFrame(fin)
    setTimeout(fin, 150)
  })

  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: A4_W_PX,
      windowWidth: A4_W_PX,
    })
  } finally {
    el.style.width = prevStyle.width
    el.style.minWidth = prevStyle.minWidth
    el.style.maxWidth = prevStyle.maxWidth
  }

  const srcCtx = canvas.getContext('2d', { willReadFrequently: true })!

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const marginTop = 8
  const marginBottom = 8

  const pxPerMm = canvas.width / pageW
  const capacity = Math.floor((pageH - marginTop - marginBottom) * pxPerMm)

  /**
   * 在 [scanTop, scanBottom] 範圍內「由下往上」找安全切點：
   * 1) 優先：整條橫框線（暗點比例高）之正下方 = 表格列的正式邊界
   * 2) 其次：連續 ≥12px 的乾淨空白橫帶（段落間距）
   * 找不到回 -1（呼叫端硬切）。
   */
  function findCleanCut(scanTop: number, scanBottom: number): number {
    const h = scanBottom - scanTop
    if (h < 6) return -1
    const w = canvas.width
    const block = srcCtx.getImageData(0, scanTop, w, h).data
    const step = 2
    const samples = Math.ceil(w / step)
    const cleanLimit = Math.max(6, Math.floor(samples * 0.03))   // 容忍表格直線
    const borderLimit = Math.floor(samples * 0.5)                 // 過半是暗點 = 橫框線

    // 預先算每條像素列的暗點數
    const darkOf: number[] = new Array(h)
    for (let row = 0; row < h; row++) {
      let dark = 0
      const base = row * w * 4
      for (let x = 0; x < w; x += step) {
        const i = base + x * 4
        const lum = 0.299 * block[i] + 0.587 * block[i + 1] + 0.114 * block[i + 2]
        if (lum < 180) dark++
      }
      darkOf[row] = dark
    }

    // 1) 由下往上找「橫框線 + 其下方乾淨」→ 切在框線下緣
    for (let row = h - 4; row >= 0; row--) {
      if (darkOf[row] >= borderLimit && darkOf[row + 1] <= cleanLimit && darkOf[row + 2] <= cleanLimit) {
        return scanTop + row + 2
      }
    }
    // 2) 由下往上找連續 12px 乾淨白帶 → 切在白帶中間
    let run = 0
    for (let row = h - 1; row >= 0; row--) {
      if (darkOf[row] <= cleanLimit) {
        run++
        if (run >= 12) return scanTop + row + Math.floor(run / 2)
      } else run = 0
    }
    return -1
  }

  const pages: string[] = []
  let y = 0
  let firstPage = true
  while (y < canvas.height - 4) {
    let end = Math.min(y + capacity, canvas.height)
    if (end < canvas.height) {
      // 從整頁高度往上（最多回退 65%）找空白帶下刀；找不到才硬切
      const scanTop = y + Math.floor(capacity * 0.35)
      const cut = findCleanCut(scanTop, end)
      if (cut > 0) end = cut
    }

    const sliceH = end - y
    const tmp = document.createElement('canvas')
    tmp.width = canvas.width
    tmp.height = sliceH
    const ctx = tmp.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, tmp.width, tmp.height)
    ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH)

    const dataUrl = tmp.toDataURL('image/jpeg', 0.95)
    pages.push(dataUrl)

    if (!firstPage) pdf.addPage()
    pdf.addImage(dataUrl, 'JPEG', 0, marginTop, pageW, sliceH / pxPerMm)
    firstPage = false
    y = end
  }

  return { pdf, pages }
}

/** 下載 PDF */
export async function downloadPdf(fileName: string, landscape = false) {
  const pdf = await buildPaginatedPdf({ landscape })
  pdf.save(`${fileName}.pdf`)
}

/** 分享 PDF（手機開分享面板；不支援時退回下載） */
export async function sharePdf(fileName: string, landscape = false): Promise<'shared' | 'downloaded'> {
  const pdf = await buildPaginatedPdf({ landscape })
  const blob = pdf.output('blob')
  const file = new File([blob], `${fileName}.pdf`, { type: 'application/pdf' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: fileName })
    return 'shared'
  }
  pdf.save(`${fileName}.pdf`)
  return 'downloaded'
}
