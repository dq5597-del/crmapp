// 智慧分頁 PDF 產生器（2026-07 v4 表頭重複版）：
// 1) 切頁點只允許落在「每一列 tr 的下緣」→ 數學上不可能穿過任一列的文字/格線
// 2) 每一頁都重複「表頭」（LOGO＋標題＋單位/聯絡人/地址/案名/日期/單號＋欄位標題列）
// 3) 未完的頁：底部固定留 ≥¼ 空白，並印「～ 續下頁 ～」；第 2 頁起頂端印「（承上頁）」
// 4) 總金額 / 備註事項 / 印章 只出現在最後一頁
// 5) 每頁置底印「第 X 頁 / 共 Y 頁」
// 若頁面結構缺少 table/thead/tbody/tfoot，會自動退回單純的列邊界切頁（不重複表頭）。

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

  // ── 在 A4 版面下、截圖前，量出各區塊的 DOM 座標（CSS px，相對於容器頂端）──
  const containerTop = el.getBoundingClientRect().top
  const cssHeight = el.getBoundingClientRect().height

  const table = el.querySelector('table') as HTMLElement | null
  const firstBodyRow = el.querySelector('tbody tr') as HTMLElement | null
  const tfoot = el.querySelector('tfoot') as HTMLElement | null
  const bodyRows = Array.from(el.querySelectorAll('tbody tr')) as HTMLElement[]

  // 表頭高度 = 第一列品項的上緣（含 LOGO/標題/單位資訊/欄位標題列 thead）
  const headerBottomCss = firstBodyRow
    ? firstBodyRow.getBoundingClientRect().top - containerTop
    : 0
  // 頁尾區（總金額列 + 備註 + 印章）的上緣
  const footerTopCss = tfoot
    ? tfoot.getBoundingClientRect().top - containerTop
    : cssHeight

  // 品項列的可切點（下緣）：排除分類標題列、排除品項與其備註列之間
  const rowCutsCss: number[] = []
  for (const tr of bodyRows) {
    if (tr.classList.contains('cat-row')) continue
    const next = tr.nextElementSibling as HTMLElement | null
    if (next && next.classList.contains('notes-row')) continue
    const b = tr.getBoundingClientRect().bottom - containerTop
    if (b > 2) rowCutsCss.push(b)
  }
  rowCutsCss.sort((a, b) => a - b)

  const canUseHeaderRepeat = !!(table && firstBodyRow && tfoot && bodyRows.length > 0)

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
  const W = canvas.width

  const pages: string[] = []

  // ── 分支 A：結構完整 → 表頭重複 + 續下頁 + 頁碼 ──
  if (canUseHeaderRepeat) {
    const headerH = Math.round(headerBottomCss * scale)            // 表頭高度（px）
    const rowsStart = headerH                                      // 品項區起點（= 表頭下緣）
    const rowsEnd = Math.round(footerTopCss * scale)               // 品項區終點（= 總金額列上緣）
    const footerBlockH = canvas.height - rowsEnd                   // 總金額+備註+印章 高度
    const rowCutsPx = rowCutsCss
      .map(v => Math.round(v * scale) + 1)
      .filter(v => v > rowsStart && v <= rowsEnd)

    const stripH = Math.round(42 * (scale / 2))                    // 頁尾文字帶（續下頁/頁碼）
    // 未完頁：內容（表頭+品項+文字帶）最多用 ¾ 頁高，底部留 ≥¼ 空白
    const rowsAreaMax = Math.floor(capacity * 0.75) - headerH - stripH

    function lastCutWithin(from: number, limit: number): number {
      let best = -1
      for (const c of rowCutsPx) if (c > from && c <= limit && c > best) best = c
      return best
    }

    // Pass 1：切出每頁的品項範圍
    type Range = { start: number; end: number; last: boolean }
    const ranges: Range[] = []
    let cursor = rowsStart
    let guard = 0
    while (cursor < rowsEnd - 2 && guard++ < 500) {
      const remaining = rowsEnd - cursor
      // 剩餘品項 + 頁尾區(總金額/備註/印章) 能否整個放進本頁（不留¼）→ 這就是最後一頁
      if (headerH + remaining + footerBlockH + stripH <= capacity) {
        ranges.push({ start: cursor, end: rowsEnd, last: true })
        cursor = rowsEnd
        break
      }
      // 未完頁：在 ¾ 高度內找最靠下的列邊界
      const limit = Math.min(cursor + Math.max(rowsAreaMax, 1), rowsEnd)
      let cut = lastCutWithin(cursor, limit)
      if (cut <= cursor) cut = limit   // 極端：單列高於可用區 → 硬切（罕見）
      ranges.push({ start: cursor, end: cut, last: false })
      cursor = cut
    }
    if (ranges.length === 0) ranges.push({ start: rowsStart, end: rowsEnd, last: true })

    const total = ranges.length
    const cjkFont = `"Microsoft JhengHei","Noto Sans TC","PingFang TC",sans-serif`

    // Pass 2：合成每一頁
    ranges.forEach((r, idx) => {
      const page = document.createElement('canvas')
      page.width = W
      page.height = capacity
      const ctx = page.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, capacity)

      // 1) 表頭（每頁重複）
      ctx.drawImage(canvas, 0, 0, W, headerH, 0, 0, W, headerH)

      // 2) 品項區
      const rh = r.end - r.start
      ctx.drawImage(canvas, 0, r.start, W, rh, 0, headerH, W, rh)
      let dy = headerH + rh

      // 3) 最後一頁 → 接上總金額/備註/印章
      if (r.last && footerBlockH > 0) {
        ctx.drawImage(canvas, 0, rowsEnd, W, footerBlockH, 0, dy, W, footerBlockH)
        dy += footerBlockH
      }

      // 4) 頂端「（承上頁）」（第 2 頁起）
      if (idx > 0) {
        ctx.fillStyle = '#1d4ed8'
        ctx.font = `${Math.round(20 * (scale / 2))}px ${cjkFont}`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText('（承上頁）', Math.round(30 * (scale / 2)), headerH + Math.round(3 * (scale / 2)))
      }

      // 5) 未完頁 → 底部留白區印「～ 續下頁 ～」
      if (!r.last) {
        ctx.fillStyle = '#1d4ed8'
        ctx.font = `bold ${Math.round(24 * (scale / 2))}px ${cjkFont}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText('～ 續下頁 ～', W - Math.round(40 * (scale / 2)), capacity - stripH - Math.round(6 * (scale / 2)))
      }

      // 6) 置底頁碼
      ctx.fillStyle = '#6b7280'
      ctx.font = `${Math.round(20 * (scale / 2))}px ${cjkFont}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(`第 ${idx + 1} 頁 / 共 ${total} 頁`, W / 2, capacity - Math.round(12 * (scale / 2)))

      const dataUrl = page.toDataURL('image/jpeg', 0.95)
      pages.push(dataUrl)
      if (idx > 0) pdf.addPage()
      pdf.addImage(dataUrl, 'JPEG', 0, marginTop, pageW, capacity / pxPerMm)
    })

    return { pdf, pages }
  }

  // ── 分支 B：結構不完整 → 單純列邊界切頁（v3 行為，不重複表頭）──
  const cutsCanvas = rowCutsCss
    .map(v => Math.round(v * scale) + 1)
    .filter(v => v > 0 && v < canvas.height)
  function rowCut(y: number, limit: number): number {
    let best = -1
    for (const c of cutsCanvas) if (c > y && c <= limit && c > best) best = c
    return best
  }
  let y = 0
  let firstPage = true
  while (y < canvas.height - 4) {
    let end = Math.min(y + capacity, canvas.height)
    if (end < canvas.height) {
      const cut = rowCut(y, end)
      if (cut > 0) end = cut
    }
    const sliceH = end - y
    const tmp = document.createElement('canvas')
    tmp.width = W
    tmp.height = sliceH
    const ctx = tmp.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, sliceH)
    ctx.drawImage(canvas, 0, y, W, sliceH, 0, 0, W, sliceH)
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
