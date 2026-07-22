// 智慧分頁 PDF 產生器（2026-07 v3 列邊界版）：
// 將 #print-page-content 截成長圖後，切頁點只允許落在「每一列 tr 的下緣」，
// 以單一全域比例把 DOM 座標換算成畫布座標 → 數學上不可能穿過任何一列的文字/格線。
// 另外：分類標題列不當切點（避免孤立在頁尾）、品項與其備註列不拆開。

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

  // ── 關鍵：在 A4 版面下、截圖前，先量出「每一列」允許的切點（DOM 座標，CSS px）──
  // 只允許切在列的下緣；並排除會造成問題的切點：
  //  · 分類標題列(.cat-row) 的下緣不當切點（避免標題被留在頁尾與內容分離；改由前一列切，把標題推到下一頁頂）
  //  · 品項主列若下面緊接著備註列(.notes-row)，該主列下緣不當切點（避免品項與備註被拆開）
  const containerTop = el.getBoundingClientRect().top
  const cssHeight = el.getBoundingClientRect().height
  const cutBoundariesCss: number[] = []
  const rows = Array.from(el.querySelectorAll('tr')) as HTMLElement[]
  for (const tr of rows) {
    if (tr.classList.contains('cat-row')) continue
    const next = tr.nextElementSibling as HTMLElement | null
    if (next && next.classList.contains('notes-row')) continue
    const b = tr.getBoundingClientRect().bottom - containerTop
    if (b > 2) cutBoundariesCss.push(b)
  }
  // 備註/印章區塊也可整塊切在其上緣（避免被上一列黏住切開）
  const stampRow = el.querySelector('.notes-stamp-row') as HTMLElement | null
  if (stampRow) {
    const topB = stampRow.getBoundingClientRect().top - containerTop
    if (topB > 2) cutBoundariesCss.push(topB)
  }
  cutBoundariesCss.sort((a, b) => a - b)

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

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const marginTop = 8
  const marginBottom = 8

  const pxPerMm = canvas.width / pageW
  const capacity = Math.floor((pageH - marginTop - marginBottom) * pxPerMm)

  // DOM(CSS px) → canvas 像素 的單一全域比例（無累積漂移）
  const scale = canvas.height / cssHeight
  const cutsCanvas = cutBoundariesCss
    .map(v => Math.round(v * scale) + 1)   // +1：切在框線下方，保留整條下框線
    .filter(v => v > 0 && v < canvas.height)

  /** 在 (y, y+capacity] 內找「最靠下的列邊界」當切點；找不到回 -1（呼叫端硬切） */
  function rowCut(y: number, limit: number): number {
    let best = -1
    for (const c of cutsCanvas) {
      if (c > y && c <= limit && c > best) best = c
    }
    return best
  }

  const pages: string[] = []
  let y = 0
  let firstPage = true
  while (y < canvas.height - 4) {
    let end = Math.min(y + capacity, canvas.height)
    if (end < canvas.height) {
      // 只切在列邊界；若整頁塞不下任何一整列（單列高於一頁，極罕見）才硬切
      const cut = rowCut(y, end)
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
