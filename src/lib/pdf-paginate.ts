// 智慧分頁 PDF 產生器（2026-07 v5）：
// 1) 切頁點落在「每一列 tr 的下緣」，再用像素微調對齊框線 → 絕不切到文字
// 2) 每一頁都重複「表頭」（LOGO＋標題＋單位/聯絡人/地址/日期/單號＋欄位標題列）
// 3) 未完的頁：底部留 ≥¼ 空白，印「本頁小計 NT$ ___」與「～ 續下頁 ～」
// 4) 總金額 / 備註事項 / 印章 只出現在最後一頁
// 5) 每頁置底印「第 X 頁 / 共 Y 頁」
// 若頁面結構缺少 table/thead/tbody/tfoot，會自動退回單純的列邊界切頁。

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
  await new Promise(r => {
    let done = false
    const fin = () => { if (!done) { done = true; r(null) } }
    requestAnimationFrame(fin)
    setTimeout(fin, 150)
  })

  // ── 量出各區塊 DOM 座標（CSS px，相對容器頂端/左緣）──
  const containerRect = el.getBoundingClientRect()
  const containerTop = containerRect.top
  const containerLeft = containerRect.left
  const cssHeight = containerRect.height

  const table = el.querySelector('table') as HTMLElement | null
  const firstBodyRow = el.querySelector('tbody tr') as HTMLElement | null
  const tfoot = el.querySelector('tfoot') as HTMLElement | null
  const bodyRows = Array.from(el.querySelectorAll('tbody tr')) as HTMLElement[]

  // 表格欄位 X 邊界（CSS px，相對容器左緣）→ 供補空白列時對齊直線
  const theadThs = Array.from(el.querySelectorAll('thead th')) as HTMLElement[]
  const colEdgesCss: number[] = []
  if (theadThs.length) {
    for (const th of theadThs) colEdgesCss.push(th.getBoundingClientRect().left - containerLeft)
    colEdgesCss.push(theadThs[theadThs.length - 1].getBoundingClientRect().right - containerLeft)
  }
  // 代表性列高（取第一個「品項主列」的高度）
  let rowHcss = 0
  for (const tr of bodyRows) {
    if (tr.classList.contains('cat-row') || tr.classList.contains('notes-row')) continue
    rowHcss = tr.getBoundingClientRect().height
    break
  }
  if (rowHcss < 8) rowHcss = 26

  const headerBottomCss = firstBodyRow
    ? firstBodyRow.getBoundingClientRect().top - containerTop
    : 0
  const footerTopCss = tfoot
    ? tfoot.getBoundingClientRect().top - containerTop
    : cssHeight

  // 可切點（列下緣）：排除分類標題列、排除品項與其備註列之間
  const rowCutsCss: number[] = []
  // 每個品項主列的下緣 + 金額 + 項次（供計算本頁小計、補列編號）
  const itemAmountsCss: { bottom: number; amount: number; no: number }[] = []
  for (const tr of bodyRows) {
    const isCat = tr.classList.contains('cat-row')
    const isNote = tr.classList.contains('notes-row')
    if (!isCat && !isNote) {
      // 主列金額 = 最後一格數字；項次 = 第一格數字
      const cells = tr.querySelectorAll('td')
      const last = cells[cells.length - 1]
      const first = cells[0]
      const amt = last ? Number((last.textContent || '').replace(/[^0-9.-]/g, '')) : 0
      const no = first ? parseInt((first.textContent || '').replace(/[^0-9]/g, ''), 10) : NaN
      itemAmountsCss.push({
        bottom: tr.getBoundingClientRect().bottom - containerTop,
        amount: isFinite(amt) ? amt : 0,
        no: isFinite(no) ? no : 0,
      })
    }
    if (isCat) continue
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

  const srcCtx = canvas.getContext('2d', { willReadFrequently: true })!

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const marginTop = 8
  const marginBottom = 8

  const pxPerMm = canvas.width / pageW
  const capacity = Math.floor((pageH - marginTop - marginBottom) * pxPerMm)

  const scale = canvas.height / cssHeight
  const sc = scale / 2                      // 字級縮放（scale=2 時 sc=1）
  const W = canvas.width
  const fmtNT = (n: number) => 'NT$ ' + Math.round(n).toLocaleString('en-US')

  /**
   * 像素微調：在候選切點 yc 附近的小窗內，找「整條橫框線」（暗點最多且過半），
   * 把切點對齊到框線正下方 2px → 消除 DOM 與 html2canvas 的幾像素誤差，絕不切到字。
   */
  function snapToBorder(yc: number): number {
    const win = Math.round(15 * sc)
    const top = Math.max(0, yc - win)
    const bot = Math.min(canvas.height, yc + win)
    const h = bot - top
    if (h < 4) return yc
    const d = srcCtx.getImageData(0, top, W, h).data
    const step = 3
    const samples = Math.ceil(W / step)
    let bestRow = -1, bestDark = -1
    for (let r = 0; r < h; r++) {
      let dk = 0
      const base = r * W * 4
      for (let x = 0; x < W; x += step) {
        const i = base + x * 4
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        if (lum < 180) dk++
      }
      if (dk > bestDark) { bestDark = dk; bestRow = r }
    }
    // 找到明顯的整條框線 → 切在框線下方
    if (bestDark >= samples * 0.5) return Math.min(canvas.height, top + bestRow + 2)
    return yc
  }

  const pages: string[] = []

  // ── 分支 A：結構完整 → 表頭重複 + 本頁小計 + 續下頁 + 頁碼 ──
  if (canUseHeaderRepeat) {
    const headerH = Math.round(headerBottomCss * scale)
    const rowsStart = headerH
    const rowsEnd = Math.round(footerTopCss * scale)
    const footerBlockH = canvas.height - rowsEnd
    const rowCutsPx = rowCutsCss
      .map(v => Math.round(v * scale))
      .filter(v => v > rowsStart && v <= rowsEnd + 4)
    const items = itemAmountsCss.map(it => ({ bottom: Math.round(it.bottom * scale), amount: it.amount, no: it.no }))

    // 欄位 X 邊界（canvas px）、列高、5/6 補白線
    const scaleX = canvas.width / containerRect.width
    const colEdges = colEdgesCss.map(x => Math.round(x * scaleX))
    const hasGrid = colEdges.length >= 3
    const gx0 = hasGrid ? colEdges[0] : 0
    const gx1 = hasGrid ? colEdges[colEdges.length - 1] : W
    const rowHpx = Math.max(20, Math.round(rowHcss * scale))
    const subRowH = Math.round(rowHpx * 1.15)          // 本頁小計列高
    const footerStripH = Math.round(58 * sc)           // 頁尾（續下頁＋頁碼）兩行
    // 表格（含補白列）填到接近頁尾，只留小計列＋頁尾文字的高度
    const fillBottom = capacity - footerStripH - subRowH

    const stripH = Math.round(70 * sc)
    const rowsAreaMax = fillBottom - headerH            // 未完頁品項最多填到 fillBottom

    function lastCutWithin(from: number, limit: number): number {
      let best = -1
      for (const c of rowCutsPx) if (c > from && c <= limit && c > best) best = c
      return best
    }
    function pageSubtotal(start: number, end: number): number {
      let s = 0
      for (const it of items) if (it.bottom > start && it.bottom <= end + 4) s += it.amount
      return s
    }

    // Pass 1：切每頁品項範圍（切點做像素微調）
    type Range = { start: number; end: number; last: boolean }
    const ranges: Range[] = []
    let cursor = rowsStart
    let guard = 0
    while (cursor < rowsEnd - 2 && guard++ < 500) {
      const remaining = rowsEnd - cursor
      if (headerH + remaining + footerBlockH + stripH <= capacity) {
        ranges.push({ start: cursor, end: rowsEnd, last: true })
        cursor = rowsEnd
        break
      }
      const limit = Math.min(cursor + Math.max(rowsAreaMax, 1), rowsEnd)
      let cut = lastCutWithin(cursor, limit)
      if (cut <= cursor) cut = limit
      cut = snapToBorder(cut)
      if (cut <= cursor) cut = limit
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

      // 3) 最後一頁 → 接總金額/備註/印章
      if (r.last && footerBlockH > 0) {
        ctx.drawImage(canvas, 0, rowsEnd, W, footerBlockH, 0, dy, W, footerBlockH)
        dy += footerBlockH
      }

      // 4) 未完頁 → 欄線補空白列填滿到頁尾，本頁小計接下一行
      if (!r.last && hasGrid) {
        ctx.strokeStyle = '#aaaaaa'
        ctx.lineWidth = Math.max(1, Math.round(scale * 0.6))
        // 補白列（不編號，避免與下一頁真實品項號碼衝突；僅延伸欄位格線）
        let fy = dy
        while (fy + rowHpx <= fillBottom) {
          ctx.beginPath(); ctx.moveTo(gx0, fy + 0.5); ctx.lineTo(gx1, fy + 0.5); ctx.stroke()
          fy += rowHpx
        }
        // 補白區底線 + 直向欄線（品項下緣 dy → fy）
        ctx.beginPath(); ctx.moveTo(gx0, fy + 0.5); ctx.lineTo(gx1, fy + 0.5); ctx.stroke()
        for (const xe of colEdges) { ctx.beginPath(); ctx.moveTo(xe + 0.5, dy); ctx.lineTo(xe + 0.5, fy); ctx.stroke() }

        // 本頁小計列（接在補白列下一行）
        const subTop = fy
        const subBot = fy + subRowH
        const amtLeft = colEdges[colEdges.length - 2]
        const labLeft = colEdges[colEdges.length - 3]
        ctx.beginPath(); ctx.moveTo(gx0, subBot + 0.5); ctx.lineTo(gx1, subBot + 0.5); ctx.stroke()
        for (const xe of [gx0, labLeft, amtLeft, gx1]) { ctx.beginPath(); ctx.moveTo(xe + 0.5, subTop); ctx.lineTo(xe + 0.5, subBot); ctx.stroke() }
        const midY = (subTop + subBot) / 2
        ctx.fillStyle = '#111827'
        ctx.font = `bold ${Math.round(13 * scale)}px ${cjkFont}`
        ctx.textAlign = 'center'
        ctx.fillText('本頁小計', (labLeft + amtLeft) / 2, midY)
        ctx.textAlign = 'right'
        ctx.fillText(fmtNT(pageSubtotal(r.start, r.end)), gx1 - Math.round(6 * scale), midY)

        // 續下頁（頁碼上方）
        ctx.fillStyle = '#1d4ed8'
        ctx.font = `bold ${Math.round(13 * scale)}px ${cjkFont}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText('～ 續下頁 ～', gx1, capacity - Math.round(34 * sc))
      } else if (!r.last) {
        // 無欄位資訊時退回純文字
        const sub = pageSubtotal(r.start, r.end)
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'
        ctx.fillStyle = '#111827'; ctx.font = `bold ${Math.round(22 * sc)}px ${cjkFont}`
        ctx.fillText(`本頁小計　${fmtNT(sub)}`, W - Math.round(40 * sc), capacity - Math.round(46 * sc))
        ctx.fillStyle = '#1d4ed8'
        ctx.fillText('～ 續下頁 ～', W - Math.round(40 * sc), capacity - Math.round(16 * sc))
      }

      // 5) 置底頁碼
      ctx.fillStyle = '#6b7280'
      ctx.font = `${Math.round(19 * sc)}px ${cjkFont}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(`第 ${idx + 1} 頁 / 共 ${total} 頁`, W / 2, capacity - Math.round(14 * sc))

      const dataUrl = page.toDataURL('image/jpeg', 0.95)
      pages.push(dataUrl)
      if (idx > 0) pdf.addPage()
      pdf.addImage(dataUrl, 'JPEG', 0, marginTop, pageW, capacity / pxPerMm)
    })

    return { pdf, pages }
  }

  // ── 分支 B：結構不完整 → 單純列邊界切頁（不重複表頭）──
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
