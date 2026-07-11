// 智慧分頁 PDF 產生器：
// 將 #print-page-content 截成長圖後，切頁點自動對齊表格列（tr）、
// 區塊（.section 等）的上緣，避免內容被切成兩半。頁數不限。

export async function buildPaginatedPdf(opts?: { landscape?: boolean }) {
  const landscape = opts?.landscape ?? false
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const el = document.getElementById('print-page-content')
  if (!el) throw new Error('找不到文件內容')

  // ── 手機修正 ────────────────────────────────────────────────
  // html2canvas 會依元素「當下實際寬度」截圖。手機視窗只有 3xx px，
  // 版面會被壓縮後再拉伸成 A4，導致內容擠在一起。
  // 因此截圖前先暫時把內容固定成 A4 寬度（96dpi），截完再還原。
  const A4_W_PX = landscape ? 1123 : 794
  const prevStyle = {
    width: el.style.width,
    minWidth: el.style.minWidth,
    maxWidth: el.style.maxWidth,
  }
  el.style.width = `${A4_W_PX}px`
  el.style.minWidth = `${A4_W_PX}px`
  el.style.maxWidth = 'none'
  // 等一次 layout，確保新寬度已套用
  await new Promise(r => requestAnimationFrame(() => r(null)))

  let canvas: HTMLCanvasElement
  let rootRect: DOMRect
  let candidates: number[]
  try {
    canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: A4_W_PX,
      windowWidth: A4_W_PX,
    })

    // 切點必須在「固定寬度」狀態下量測，否則手機上比例會錯
    rootRect = el.getBoundingClientRect()
    const scale = canvas.width / rootRect.width
    const SELECTOR = [
      'tr', 'thead',
      '.section', '.section-title',
      '.photo-cell', '.photo-grid',
      '.warn-box', '.notes-stamp-row', '.declare',
      '.info-row', 'h1', 'li',
    ].join(', ')
    const cutSet = new Set<number>([0])
    el.querySelectorAll(SELECTOR).forEach(node => {
      const r = (node as HTMLElement).getBoundingClientRect()
      const top = Math.round((r.top - rootRect.top) * scale)
      if (top > 0 && top < canvas.height) cutSet.add(top)
    })
    candidates = Array.from(cutSet).sort((a, b) => a - b)
  } finally {
    // 還原畫面樣式
    el.style.width = prevStyle.width
    el.style.minWidth = prevStyle.minWidth
    el.style.maxWidth = prevStyle.maxWidth
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const marginTop = 8   // 每頁上邊界 (mm)
  const marginBottom = 8

  const pxPerMm = canvas.width / pageW                      // canvas 像素 ↔ mm 換算
  const capacity = Math.floor((pageH - marginTop - marginBottom) * pxPerMm) // 每頁可放的 canvas 高度

  let y = 0
  let firstPage = true
  while (y < canvas.height - 4) {
    let end = y + capacity
    if (end >= canvas.height) {
      end = canvas.height
    } else {
      // 在 (y + 40% 頁高, y + 頁高] 內找最靠下的安全切點；找不到才硬切
      let best = -1
      for (const c of candidates) {
        if (c > y + capacity * 0.4 && c <= end) best = c
        if (c > end) break
      }
      if (best > 0) end = best
    }

    const sliceH = end - y
    const tmp = document.createElement('canvas')
    tmp.width = canvas.width
    tmp.height = sliceH
    const ctx = tmp.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, tmp.width, tmp.height)
    ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH)

    if (!firstPage) pdf.addPage()
    pdf.addImage(tmp.toDataURL('image/jpeg', 0.95), 'JPEG', 0, marginTop, pageW, sliceH / pxPerMm)
    firstPage = false
    y = end
  }

  return pdf
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
