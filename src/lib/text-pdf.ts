// 文字版 PDF 列印器（2026-07）：
// 用「真實 HTML」把 #print-page-content 重新排成多頁（每頁重複表頭、補白列、本頁小計、
// 續下頁、頁碼；最後一頁收總金額/備註/印章），再交給瀏覽器「另存為 PDF」。
// 好處：文字可選取/搜尋、中文完美、不必內嵌字型；且保留所有自訂分頁功能。

const ROOT_ID = 'tp-print-root'
const STYLE_ID = 'tp-print-style'

const fmtNT = (n: number) => 'NT$ ' + Math.round(n).toLocaleString('en-US')

/** 觸發文字版列印（另存為 PDF）。landscape 決定紙張方向。 */
export async function printTextPdf(landscape = false): Promise<void> {
  const el = document.getElementById('print-page-content')
  if (!el) throw new Error('找不到文件內容')

  const tableEl = el.querySelector('table') as HTMLTableElement | null
  const thead = el.querySelector('thead') as HTMLElement | null
  const tfoot = el.querySelector('tfoot') as HTMLElement | null
  if (!tableEl || !thead) { // 結構不完整：直接原生列印
    window.print()
    return
  }

  // A4 尺寸（96dpi）；內距
  //
  // ⚠ 刻意比實際紙張小一點（A4 = 793.7 × 1122.5 px @96dpi）：
  //   列印時每頁只要超出紙張 1~2px（body 位移、捨入誤差、印表機可列印區差異），
  //   那 1~2px 就會被推到下一張紙 → 3 頁變成 5、6 張紙，且頁尾小計被切到次頁。
  //   保留約 16px（≈4mm）安全邊界，contentH 與補白列數會跟著自動縮小。
  const A4 = landscape ? { w: 1118, h: 786 } : { w: 790, h: 1106 }
  const PAD_T = 30, PAD_B = 42, PAD_X = 30
  const contentH = A4.h - PAD_T - PAD_B

  // ── 暫時把來源固定成 A4 寬度並等圖片/字型載入，量測各高度 ──
  const prev = { width: el.style.width, minWidth: el.style.minWidth, maxWidth: el.style.maxWidth }
  el.style.width = `${A4.w}px`
  el.style.minWidth = `${A4.w}px`
  el.style.maxWidth = 'none'
  try { await (document as any).fonts?.ready } catch { /* ignore */ }
  await Promise.all(
    (Array.from(el.querySelectorAll('img')) as HTMLImageElement[]).map(img =>
      img.complete ? Promise.resolve() : new Promise<void>(res => {
        img.addEventListener('load', () => res(), { once: true })
        img.addEventListener('error', () => res(), { once: true })
        setTimeout(res, 800)
      })
    )
  )
  // ⚠ 分頁不能只等 requestAnimationFrame：分頁在背景（visibilityState === 'hidden'）
  //   時 rAF 會被瀏覽器凍結，整個列印流程會卡在這裡、按鈕永遠停在「排版中…」。
  //   例如使用者按下列印後立刻切到別的分頁。故一律加上逾時保險。
  await new Promise(r => {
    let done = false
    const fin = () => { if (!done) { done = true; r(null) } }
    requestAnimationFrame(fin)
    setTimeout(fin, 150)
  })

  const elTop = el.getBoundingClientRect().top
  const kids = Array.from(el.children) as HTMLElement[]
  const tableIdx = kids.indexOf(tableEl)
  const headerNodes = kids.slice(0, tableIdx)          // logo/標題/單位資訊
  const afterNodes = kids.slice(tableIdx + 1)          // 備註/印章區塊

  const headerH = tableEl.getBoundingClientRect().top - elTop
  const theadH = thead.getBoundingClientRect().height
  let footerBlockH = tfoot ? tfoot.getBoundingClientRect().height : 0
  for (const n of afterNodes) footerBlockH += n.getBoundingClientRect().height + 8

  const bodyRows = Array.from(tableEl.querySelectorAll('tbody tr')) as HTMLElement[]
  let rowH = 26
  for (const tr of bodyRows) {
    if (tr.classList.contains('cat-row') || tr.classList.contains('notes-row')) continue
    rowH = tr.getBoundingClientRect().height; break
  }
  const colCount = thead.querySelectorAll('th').length || 8

  // ── 把列組成「單元」：前導分類列 + 品項主列 + 其備註列（整組不拆、分類不孤立）──
  type Unit = { rows: HTMLElement[]; h: number; amount: number }
  const units: Unit[] = []
  {
    let i = 0
    while (i < bodyRows.length) {
      const rows: HTMLElement[] = []
      while (i < bodyRows.length && bodyRows[i].classList.contains('cat-row')) { rows.push(bodyRows[i]); i++ }
      let amount = 0
      if (i < bodyRows.length) {
        const tr = bodyRows[i]
        rows.push(tr); i++
        if (!tr.classList.contains('notes-row')) {
          const tds = tr.querySelectorAll('td')
          const v = Number((tds[tds.length - 1]?.textContent || '').replace(/[^0-9.-]/g, ''))
          amount = isFinite(v) ? v : 0
        }
      }
      while (i < bodyRows.length && bodyRows[i].classList.contains('notes-row')) { rows.push(bodyRows[i]); i++ }
      const h = rows.reduce((s, r) => s + r.getBoundingClientRect().height, 0)
      units.push({ rows, h, amount })
    }
  }

  const stripH = 30                                     // 頁尾（續下頁/頁碼）保留
  const subRowH = Math.round(rowH * 1.15)
  const nonLastBudget = contentH - headerH - theadH - subRowH - stripH

  // ── 分頁：貪婪填入單元 ──
  const pages: Unit[][] = []
  let cur: Unit[] = []
  let curH = 0
  for (const u of units) {
    if (curH > 0 && curH + u.h > nonLastBudget) { pages.push(cur); cur = []; curH = 0 }
    cur.push(u); curH += u.h
  }
  if (cur.length) pages.push(cur)
  if (pages.length === 0) pages.push([])

  // 最後一頁能否容納頁尾區（總金額/備註/印章）？不行就另起一頁專放頁尾。
  const lastRowsH = pages[pages.length - 1].reduce((s, u) => s + u.h, 0)
  const footerFits = headerH + theadH + lastRowsH + footerBlockH + stripH <= contentH

  type PageDef = { units: Unit[]; footer: boolean; subtotal: boolean }
  const pageDefs: PageDef[] = pages.map(u => ({ units: u, footer: false, subtotal: true }))
  if (footerFits) {
    const lp = pageDefs[pageDefs.length - 1]
    lp.footer = true; lp.subtotal = false
  } else {
    pageDefs.push({ units: [], footer: true, subtotal: false })
  }
  const totalPages = pageDefs.length

  // ── 建立列印用 DOM ──
  const root = document.createElement('div')
  root.id = ROOT_ID

  pageDefs.forEach((def, idx) => {
    const page = document.createElement('div')
    page.className = 'tp-page'

    // 表頭（每頁重複）
    for (const n of headerNodes) page.appendChild(n.cloneNode(true))

    // 表格
    const table = document.createElement('table')
    table.style.width = '100%'
    table.style.borderCollapse = 'collapse'
    table.style.marginTop = '6px'
    table.appendChild(thead.cloneNode(true))
    const tbody = document.createElement('tbody')
    let usedH = 0
    let subtotal = 0
    for (const u of def.units) {
      for (const r of u.rows) tbody.appendChild(r.cloneNode(true))
      usedH += u.h
      subtotal += u.amount
    }

    if (def.subtotal) {
      // 補白列：把欄位框線補到接近頁尾
      const fillSpace = nonLastBudget - usedH
      const fillCount = Math.max(0, Math.floor(fillSpace / rowH))
      for (let k = 0; k < fillCount; k++) {
        const tr = document.createElement('tr')
        for (let c = 0; c < colCount; c++) {
          const td = document.createElement('td')
          td.innerHTML = '&nbsp;'
          tr.appendChild(td)
        }
        tbody.appendChild(tr)
      }
      // 本頁小計列
      const tr = document.createElement('tr')
      tr.className = 'tp-subtotal-row'
      const left = document.createElement('td')
      left.colSpan = Math.max(1, colCount - 2)
      left.innerHTML = '&nbsp;'
      const lab = document.createElement('td')
      lab.textContent = '本頁小計'
      lab.style.textAlign = 'center'
      lab.style.fontWeight = '700'
      const amt = document.createElement('td')
      amt.textContent = fmtNT(subtotal)
      amt.style.textAlign = 'right'
      amt.style.fontWeight = '700'
      tr.appendChild(left); tr.appendChild(lab); tr.appendChild(amt)
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)
    if (def.footer && tfoot) table.appendChild(tfoot.cloneNode(true))
    page.appendChild(table)

    // 最後一頁：備註/印章區塊
    if (def.footer) for (const n of afterNodes) page.appendChild(n.cloneNode(true))

    // 頁尾：續下頁 + 頁碼（絕對定位在頁底）
    const foot = document.createElement('div')
    foot.className = 'tp-foot'
    if (def.subtotal) {
      const cont = document.createElement('span')
      cont.className = 'tp-continue'
      cont.textContent = '～ 續下頁 ～'
      foot.appendChild(cont)
    }
    const pn = document.createElement('span')
    pn.className = 'tp-pageno'
    pn.textContent = `第 ${idx + 1} 頁 / 共 ${totalPages} 頁`
    foot.appendChild(pn)
    page.appendChild(foot)

    root.appendChild(page)
  })

  // ── 樣式 ──
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${ROOT_ID} { position: absolute; left: -10000px; top: 0; }
    #${ROOT_ID} .tp-page {
      position: relative; width: ${A4.w}px; height: ${A4.h}px;
      box-sizing: border-box; padding: ${PAD_T}px ${PAD_X}px ${PAD_B}px;
      background: #fff; overflow: hidden;
    }
    #${ROOT_ID} .tp-subtotal-row td { background: #f3f4f6; font-size: 13px; }
    #${ROOT_ID} .tp-foot {
      position: absolute; left: ${PAD_X}px; right: ${PAD_X}px; bottom: ${Math.round(PAD_B / 2)}px;
      display: flex; justify-content: space-between; align-items: flex-end;
      font-size: 12px; color: #6b7280;
    }
    #${ROOT_ID} .tp-continue { color: #1d4ed8; font-weight: 700; margin-left: auto; }
    #${ROOT_ID} .tp-pageno { position: absolute; left: 50%; transform: translateX(-50%); }
    @media print {
      @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 0; }
      html, body {
        background: #fff !important;
        margin: 0 !important; padding: 0 !important;
        height: auto !important; overflow: visible !important;
      }
      body > *:not(#${ROOT_ID}) { display: none !important; }
      #${ROOT_ID} { position: static !important; left: 0 !important; top: 0 !important; margin: 0 !important; }
      #${ROOT_ID} .tp-page {
        page-break-after: always; break-after: page;
        page-break-inside: avoid; break-inside: avoid;
        margin: 0 !important;
      }
      #${ROOT_ID} .tp-page:last-child { page-break-after: auto; break-after: auto; }
      tr { break-inside: avoid; page-break-inside: avoid; }
    }
  `

  // 還原來源寬度
  el.style.width = prev.width
  el.style.minWidth = prev.minWidth
  el.style.maxWidth = prev.maxWidth

  document.body.appendChild(style)
  document.body.appendChild(root)

  // 除錯用：?tpdebug=1 時把排好的頁面顯示在畫面上（不列印），方便檢視分頁/版面
  if (typeof location !== 'undefined' && location.search.includes('tpdebug')) {
    root.style.left = '0'
    root.style.zIndex = '99999'
    root.style.background = '#e5e7eb'
    ;(root.querySelectorAll('.tp-page') as NodeListOf<HTMLElement>).forEach(p => {
      p.style.margin = '12px auto'; p.style.boxShadow = '0 2px 12px rgba(0,0,0,.3)'
    })
    return
  }

  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup)
    root.remove(); style.remove()
  }
  window.addEventListener('afterprint', cleanup)
  // 給瀏覽器一拍完成 layout 再列印
  await new Promise(r => setTimeout(r, 120))
  window.print()
  setTimeout(() => { if (document.getElementById(ROOT_ID)) cleanup() }, 60000)
}
