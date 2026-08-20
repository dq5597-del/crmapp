import { Fragment } from 'react'
import type { Metadata } from 'next'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import PrintButtons from './PrintButtons'
import PrintHeaderQr from '@/components/PrintHeaderQr'
import { buildQuoteFileName } from '@/lib/utils'
import { knownBrandLogoUrl } from '@/lib/brand-logos'

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createClient()
  const { data: quote } = await supabase
    .from('quotes')
    .select('quote_no, project_name, clients(company_name)')
    .eq('id', params.id)
    .single()

  if (!quote) return {}

  const fileName = buildQuoteFileName(quote, (quote as any).clients?.company_name)
  return { title: fileName }
}

function numToChineseCapital(amount: number): string {
  const digitsCn = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖']
  const unitsCn = ['', '拾', '佰', '仟']
  const bigUnitsCn = ['', '萬', '億', '兆']
  const n = Math.floor(Math.abs(amount))
  if (n === 0) return '零元整'

  let numStr = String(n)
  const groups: string[] = []
  while (numStr.length > 0) {
    groups.unshift(numStr.slice(-4))
    numStr = numStr.slice(0, -4)
  }

  let result = ''
  groups.forEach((group, idx) => {
    let groupResult = ''
    let zeroFlag = false
    for (let i = 0; i < group.length; i++) {
      const digit = parseInt(group[i], 10)
      const unitIdx = group.length - 1 - i
      if (digit === 0) {
        zeroFlag = true
      } else {
        if (zeroFlag) {
          groupResult += '零'
          zeroFlag = false
        }
        groupResult += digitsCn[digit] + unitsCn[unitIdx]
      }
    }
    if (groupResult) {
      result += groupResult + bigUnitsCn[groups.length - 1 - idx]
    } else if (result) {
      result += '零'
    }
  })
  result = result.replace(/零+$/, '')
  return `${result}元整`
}

export default async function QuotePrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [{ data: quote }, { data: items }, { data: settings }] = await Promise.all([
    supabase.from('quotes').select('*, clients(company_name, phone, address)').eq('id', params.id).single(),
    supabase.from('quote_items').select('*').eq('quote_id', params.id).order('seq_no'),
    supabase.from('system_settings').select('*').single(),
  ])

  if (!quote) return notFound()

  const clientName = (quote as any).clients?.company_name ?? ''
  const clientAddress = (quote as any).client_address || (quote as any).clients?.address || ''
  const bankInfo = settings?.bank_name
    ? `${settings.bank_name}（代號：${settings.bank_code ?? ''}）／戶名：${settings.bank_account_name ?? ''}／帳號：${settings.bank_account ?? ''}`
    : ''

  const fmt = (n: number) => n.toLocaleString('zh-TW')

  // Build notes items:
  // 1. 結構化欄位（有效期限、交貨工期、付款條件、匯款帳號）
  // 2. 系統設定的動態備註條目（default_note_items）
  // 3. 本張報價單的自訂備註
  const noteItems: string[] = []
  if (quote.valid_until) {
    const baseDateRaw = quote.created_at ? new Date(quote.created_at) : new Date()
    const base = new Date(baseDateRaw.getFullYear(), baseDateRaw.getMonth(), baseDateRaw.getDate())
    const untilParts = quote.valid_until.split('-').map(Number)
    const until = new Date(untilParts[0], untilParts[1] - 1, untilParts[2])
    const diffDays = Math.round((until.getTime() - base.getTime()) / 86400000)
    noteItems.push(`報價有效天數：${diffDays} 天`)
  }
  if (quote.delivery_days) noteItems.push(`交貨工期：${quote.delivery_days} 天`)
  if (bankInfo) noteItems.push(`匯款帳號：${bankInfo}`)
  if (quote.payment_terms) noteItems.push(`付款條件：${quote.payment_terms}`)
  // 動態備註條目（從系統設定新增/刪除）
  const defaultNoteItems: string[] = Array.isArray((settings as any)?.default_note_items)
    ? (settings as any).default_note_items
    : []
  noteItems.push(...defaultNoteItems.filter((n: string) => n?.trim()))
  if (quote.notes) noteItems.push(quote.notes)

  const totalChinese = numToChineseCapital(Number(quote.total_amount))
  const origAmt = Number(quote.subtotal ?? quote.total_amount)
  const discAmt = origAmt - Number(quote.total_amount)
  // 單價本身含稅，未稅由含稅反算，確保未稅＋稅額必定等於含稅合計（不會差一元）
  const netAmt = Math.round(Number(quote.total_amount) / 1.05)
  const taxAmt = Number(quote.total_amount) - netAmt
  const hasDiscount = discAmt > 0

  // 分類標題列：品項編號在每個分類內重新從 1 起算
  let dispNo = 0
  const rowItems = (items ?? []).map((item: any) => {
    if (item.is_category) { dispNo = 0; return { ...item, display_no: 0 } }
    dispNo += 1
    return { ...item, display_no: dispNo }
  })

  return (
    <>
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          @page { margin: 15mm 14mm; }
          .page { max-width: none; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          .notes-stamp-row { break-inside: avoid; page-break-inside: avoid; }
          thead { display: table-header-group; }
        }
        * { box-sizing: border-box; }
        html, body { background: #fff; }
        .app-shell { background: #fff !important; }
        body { font-family: 'Noto Sans TC', 'Microsoft JhengHei', '微軟正黑體', sans-serif; font-size: 12px; color: #000; margin: 0; background: #fff; }
        .page { max-width: 210mm; margin: 0 auto; padding: 14px 28px 16px; background: #fff; }
        .header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .logo { display: flex; flex-direction: column; align-items: flex-start; width: 210px; flex-shrink: 0; gap: 2px; }
        .logo-img { width: 100%; height: auto; display: block; }
        .logo-url { width: 100%; font-size: 11px; font-weight: 700; color: #000; }
        .header-spacer { width: 210px; flex-shrink: 0; }
        .title-block { flex: 1; text-align: center; align-self: flex-start; margin-top: -10px; }
        h1 { font-size: 32px; font-weight: 700; text-align: center; margin: 2px 0 2px; letter-spacing: 6px; }
        .sub-header { text-align: center; font-size: 16px; color: #333; margin-bottom: 8px; }
        .info-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 3px; }
        table { border-collapse: collapse; width: 100%; margin-top: 16px; }
        th { background: #d9d9d9; font-weight: 700; font-size: 14px; border: 1px solid #888; padding: 5px 6px; text-align: center; }
        td { border: 1px solid #aaa; padding: 4px 6px; font-size: 14px; vertical-align: top; }
        .num { text-align: right; }
        .center { text-align: center; }
        .notes-row td { border-top: none; color: #555; font-size: 12.5px; padding: 1px 8px 3px; }
        /* 品項備註兩種版面（由列印頁的「備註位置」切換，預設欄位版）
           欄位版：備註在含稅金額右側，長字串強制斷行避免撐開表格
           整列版：備註獨立一列跨滿寬度，長內容不會把該列撐高 */
        .item-note-cell { color: #555; font-size: 12px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
        .notes-row { display: none; }
        .note-mode-row .notes-row { display: table-row; }
        .note-mode-row .item-note-cell,
        .note-mode-row .note-col-head { display: none; }
        /* 隱藏金額（給廠商看的版本）：單價、金額欄與整個總計區都不顯示。
           tfoot 本身保留（只隱藏其中的列），否則分頁程式會量到錯誤座標。 */
        .hide-money .col-money { display: none; }
        .hide-money tfoot tr { display: none; }
        .total-row td { font-weight: 700; font-size: 15px; }
        /* 未稅／稅額／含稅合計框成一個粗框區塊 */
        .tax-row td { border-left: none; border-right: none; }
        .tax-row td:first-child { border-left: 2.5px solid #333; }
        .tax-row td:last-child  { border-right: 2.5px solid #333; }
        .tax-top td    { border-top: 2.5px solid #333; }
        .tax-bottom td { border-bottom: 2.5px solid #333; }
        .cat-row td { background: #ececec; font-weight: 700; }
        .notes-stamp-row { display: flex; align-items: flex-start; gap: 20px; margin-top: 5px; }
        .notes-section { flex: 1; min-width: 0; }
        .notes-title { font-weight: 700; font-size: 13.5px; margin-bottom: 4px; }
        .notes-section ol { margin: 0; padding-left: 20px; list-style: decimal; }
        .notes-section li { font-size: 13.5px; line-height: 1.5; }
        .stamp-box { width: 112px; flex-shrink: 0; display: flex; justify-content: center; }
        .stamp-box img { width: 104px; height: auto; }
      `}</style>

      <PrintButtons />

      <div className="page" id="print-page-content">
        {/* Header: logo + title */}
        <div className="header-row">
          <div className="logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="光輝影音科技" className="logo-img" />
            <div className="logo-url">購物車網站：https://av-shop.com</div>
          </div>
          <div className="title-block">
            <h1>報 價 單</h1>
            {quote.project_name && <div className="sub-header">{quote.project_name}</div>}
          </div>
          <div className="header-spacer" style={{ width: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, alignSelf: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <PrintHeaderQr url="https://line.me/R/ti/p/@807wvsuu" size={46} />
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontSize: 10, color: '#333', fontWeight: 700 }}>LINE ID</div>
                <div style={{ fontSize: 10, color: '#333', letterSpacing: 0.2 }}>@807wvsuu</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 13, color: '#333', lineHeight: 1.75, whiteSpace: 'nowrap' }}>
              <div>服務電話：03-8321087</div>
              <div>地址：花蓮市民權三街十號</div>
            </div>
          </div>
        </div>

        {/* Client + quote info (merged into 2 rows) */}
        <div className="info-row">
          <span>
            客戶名稱：<strong>{clientName}</strong>
            {quote.contact_name && `　聯絡人：${quote.contact_name}`}
            {quote.client_phone && `　電話：${quote.client_phone}`}
          </span>
          <span>單據日期：{quote.created_at ? new Date(quote.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : ''}</span>
        </div>
        <div className="info-row">
          <span>{clientAddress && `地址：${clientAddress}`}</span>
          <span>單號：{quote.quote_no}</span>
        </div>

        {/* Items table */}
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>編號</th>
              <th style={{ textAlign: 'left' }}>產品名稱</th>
              <th style={{ textAlign: 'left', width: 110 }}>規格型號</th>
              <th style={{ width: 44 }}>單位</th>
              <th style={{ width: 44 }}>數量</th>
              <th className="col-money" style={{ width: 88 }}>含稅單價</th>
              <th className="col-money" style={{ width: 96 }}>含稅金額</th>
              <th className="note-col-head" style={{ textAlign: 'left', width: 150 }}>備註</th>
            </tr>
          </thead>
          <tbody>
            {rowItems.map((item: any) => (
              <Fragment key={item.id}>
                {item.is_category ? (
                  <tr className="cat-row">
                    <td colSpan={8}>{item.product_name}</td>
                  </tr>
                ) : (
                <tr>
                  <td className="center">{item.display_no}</td>
                  <td style={{ fontWeight: 500 }}>{item.product_name}</td>
                  <td style={{ color: '#444' }}>{item.model ?? ''}</td>
                  <td className="center">{item.unit}</td>
                  <td className="center">{item.quantity}</td>
                  <td className="num col-money">{fmt(Number(item.unit_price))}</td>
                  <td className="num col-money">{fmt(item.quantity * Number(item.unit_price))}</td>
                  <td className="item-note-cell">{item.item_notes?.trim() || ''}</td>
                </tr>
                )}
                {/* 備註「下方整列」版本：預設隱藏，切換到 note-mode-row 時才顯示 */}
                {!item.is_category && !!item.item_notes?.trim() && (
                  <tr className="notes-row">
                    <td colSpan={8}>備註：{item.item_notes}</td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            {hasDiscount && (
              <>
                <tr className="total-row">
                  <td colSpan={5}>原價合計</td>
                  <td colSpan={3} className="num">NT$ {fmt(origAmt)}</td>
                </tr>
                <tr className="total-row">
                  <td colSpan={5}>折扣</td>
                  <td colSpan={3} className="num">- NT$ {fmt(discAmt)}</td>
                </tr>
              </>
            )}
            <tr className="total-row tax-row tax-top">
              <td colSpan={5}>未稅金額</td>
              <td colSpan={3} className="num">NT$ {fmt(netAmt)}</td>
            </tr>
            <tr className="total-row tax-row">
              <td colSpan={5}>營業稅 5%</td>
              <td colSpan={3} className="num">NT$ {fmt(taxAmt)}</td>
            </tr>
            <tr className="total-row tax-row tax-bottom">
              <td colSpan={5}>含稅合計　{totalChinese}</td>
              <td colSpan={3} className="num">NT$ {fmt(Number(quote.total_amount))}</td>
            </tr>
          </tfoot>
        </table>

        {/* Notes + 估價單章 */}
        <div className="notes-stamp-row">
          {noteItems.length > 0 && (
            <div className="notes-section">
              <div className="notes-title">備註事項</div>
              <ol>
                {noteItems.map((n, i) => <li key={i}>{n}</li>)}
              </ol>
            </div>
          )}
          <div className="stamp-box">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/stamp.png" alt="估價單專用章" />
          </div>
        </div>

      </div>
    </>
  )
}
