import { Fragment } from 'react'
import type { Metadata } from 'next'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import PrintButtons from './PrintButtons'
import PrintHeaderQr from '@/components/PrintHeaderQr'

function buildOrderFileName(order: { order_no?: string | null }, name?: string | null): string {
  const orderNo = order.order_no ?? ''
  const datePart = orderNo.slice(3, 9)
  const seqRaw = orderNo.slice(9).replace(/^-/, '')
  const seqNum = parseInt(seqRaw || '0', 10)
  const seqPart = String(seqNum || 0).padStart(2, '0')
  const namePart = (name?.trim() || '').replace(/[\\/:*?"<>|]/g, '').trim()
  return ['(光輝)訂購單', namePart, datePart, seqPart].filter(Boolean).join('_')
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createClient()
  const { data: order } = await supabase
    .from('purchase_orders')
    .select('order_no, vendor_name')
    .eq('id', params.id)
    .single()

  if (!order) return {}
  return { title: buildOrderFileName(order, order.vendor_name) }
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

export default async function PurchaseOrderPrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [{ data: order }, { data: items }] = await Promise.all([
    supabase.from('purchase_orders').select('*, salesperson:user_profiles(full_name)').eq('id', params.id).single(),
    supabase.from('purchase_order_items').select('*').eq('order_id', params.id).order('seq_no'),
  ])

  if (!order) return notFound()

  const fmt = (n: number) => n.toLocaleString('zh-TW')

  const noteItems: string[] = []
  if (order.payment_terms) noteItems.push(`付款條件：${order.payment_terms}`)
  if (order.notes) noteItems.push(order.notes)

  const totalChinese = numToChineseCapital(Number(order.total_amount))
  const origAmt = Number(order.subtotal ?? order.total_amount)
  const discAmt = origAmt - Number(order.total_amount)
  // 單價含稅，未稅由含稅反算，確保未稅＋稅額必定等於含稅合計
  const netAmt = Math.round(Number(order.total_amount) / 1.05)
  const taxAmt = Number(order.total_amount) - netAmt
  const hasDiscount = discAmt > 0

  return (
    <>
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          @page { margin: 15mm 14mm; }
          .page { max-width: none; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          .notes-stamp-row, .sign-row { break-inside: avoid; page-break-inside: avoid; }
          thead { display: table-header-group; }
        }
        * { box-sizing: border-box; }
        html, body { background: #fff; }
        .app-shell { background: #fff !important; }
        body { font-family: 'Noto Sans TC', 'Microsoft JhengHei', '微軟正黑體', sans-serif; font-size: 12px; color: #000; margin: 0; background: #fff; }
        .page { max-width: 210mm; margin: 0 auto; padding: 14px 28px 16px; background: #fff; }
        .header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .logo { display: flex; align-items: center; width: 210px; flex-shrink: 0; }
        .logo-img { width: 100%; height: auto; display: block; }
        .header-spacer { width: 210px; flex-shrink: 0; }
        .title-block { flex: 1; text-align: center; align-self: flex-start; margin-top: -10px; }
        h1 { font-size: 32px; font-weight: 700; text-align: center; margin: 2px 0 2px; letter-spacing: 6px; }
        .info-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 3px; }
        table { border-collapse: collapse; width: 100%; margin-top: 16px; }
        th { background: #d9d9d9; font-weight: 700; font-size: 14px; border: 1px solid #888; padding: 5px 6px; text-align: center; }
        td { border: 1px solid #aaa; padding: 4px 6px; font-size: 14px; vertical-align: top; }
        .num { text-align: right; }
        .center { text-align: center; }
        .notes-row td { border-top: none; color: #555; font-size: 12.5px; padding: 1px 8px 3px; }
        /* 品項備註兩種版面（由列印頁的「備註位置」切換，預設欄位版） */
        .item-note-cell { color: #555; font-size: 12px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
        .notes-row { display: none; }
        .note-mode-row .notes-row { display: table-row; }
        .note-mode-row .item-note-cell,
        .note-mode-row .note-col-head { display: none; }
        .total-row td { font-weight: 700; font-size: 15px; }
        .tax-row td { border-left: none; border-right: none; }
        .tax-row td:first-child { border-left: 2.5px solid #333; }
        .tax-row td:last-child  { border-right: 2.5px solid #333; }
        .tax-top td    { border-top: 2.5px solid #333; }
        .tax-bottom td { border-bottom: 2.5px solid #333; }
        .notes-stamp-row { display: flex; align-items: flex-start; gap: 20px; margin-top: 5px; }
        .notes-section { flex: 1; min-width: 0; }
        .notes-title { font-weight: 700; font-size: 13.5px; margin-bottom: 4px; }
        .notes-section ol { margin: 0; padding-left: 20px; list-style: decimal; }
        .notes-section li { font-size: 13.5px; line-height: 1.5; }
        .stamp-box { width: 112px; flex-shrink: 0; display: flex; justify-content: center; }
        .stamp-box img { width: 104px; height: auto; }
        .sign-row { display: flex; gap: 40px; margin-top: 14px; }
        .sign-box { flex: 1; }
        .sign-title { font-weight: 700; font-size: 12px; margin-bottom: 6px; }
        .sign-line { border-bottom: 1px solid #999; height: 22px; margin-bottom: 4px; }
        .sign-meta { font-size: 11px; color: #444; }
      `}</style>

      <PrintButtons />

      <div className="page" id="print-page-content">
        <div className="header-row">
          <div className="logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="光輝影音科技" className="logo-img" />
          </div>
          <div className="title-block">
            <h1>訂 購 單</h1>
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

        <div className="info-row">
          <span>
            單位名稱：<strong>{order.vendor_name}</strong>
            {order.vendor_contact && `　聯絡人：${order.vendor_contact}`}
            {order.vendor_phone && `　電話：${order.vendor_phone}`}
          </span>
          <span>單據日期：{order.created_at ? new Date(order.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : ''}</span>
        </div>
        <div className="info-row">
          <span>{(order as any).salesperson?.full_name && `業務員：${(order as any).salesperson.full_name}`}</span>
          <span>單號：{order.order_no}</span>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>編號</th>
              <th style={{ textAlign: 'left' }}>產品名稱</th>
              <th style={{ textAlign: 'left', width: 110 }}>規格型號</th>
              <th style={{ width: 44 }}>單位</th>
              <th style={{ width: 44 }}>數量</th>
              <th style={{ width: 88 }}>含稅單價</th>
              <th style={{ width: 96 }}>含稅金額</th>
              <th className="note-col-head" style={{ textAlign: 'left', width: 150 }}>備註</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              // 分類標題列：編號在每個分類內重新起算
              let dispNo = 0
              return (items ?? []).map((item: any) => {
                if (item.is_category) {
                  dispNo = 0
                  return (
                    <tr key={item.id} style={{ background: '#ececec' }}>
                      <td colSpan={8} style={{ fontWeight: 700 }}>{item.product_name}</td>
                    </tr>
                  )
                }
                dispNo += 1
                return (
                  <Fragment key={item.id}>
                    <tr>
                      <td className="center">{dispNo}</td>
                      <td style={{ fontWeight: 500 }}>{item.product_name}</td>
                      <td style={{ color: '#444' }}>{item.model ?? ''}</td>
                      <td className="center">{item.unit}</td>
                      <td className="center">{item.quantity}</td>
                      <td className="num">{fmt(Number(item.unit_price))}</td>
                      <td className="num">{fmt(item.quantity * Number(item.unit_price))}</td>
                      <td className="item-note-cell">{item.item_notes?.trim() || ''}</td>
                    </tr>
                    {!!item.item_notes?.trim() && (
                      <tr className="notes-row">
                        <td colSpan={8}>備註：{item.item_notes}</td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            })()}
          </tbody>
          {/* 訂單已成立，不再列原價與折扣；金額需與發票對得起來 */}
          <tfoot>
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
              <td colSpan={3} className="num">NT$ {fmt(Number(order.total_amount))}</td>
            </tr>
          </tfoot>
        </table>

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
            <img src="/stamp.png" alt="訂購單專用章" />
          </div>
        </div>

        <div className="sign-row">
          <div className="sign-box">
            <div className="sign-title">單位簽名確認</div>
            <div className="sign-line"></div>
            <div className="sign-meta">
              簽署人：{order.signer_name || '＿＿＿＿＿＿＿＿'}　　簽署日期：{order.signed_date ? new Date(order.signed_date).toLocaleDateString('zh-TW') : '＿＿＿＿＿＿＿＿'}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
