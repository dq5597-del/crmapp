import { Fragment } from 'react'
import type { Metadata } from 'next'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import PrintButtons from './PrintButtons'

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
        .page { max-width: 210mm; margin: 0 auto; padding: 24px 28px; background: #fff; }
        .header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .logo { display: flex; align-items: center; width: 210px; flex-shrink: 0; }
        .logo-img { width: 100%; height: auto; display: block; }
        .header-spacer { width: 210px; flex-shrink: 0; }
        .title-block { flex: 1; text-align: center; }
        h1 { font-size: 18px; font-weight: 700; text-align: center; margin: 4px 0 4px; }
        .info-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 2px; }
        table { border-collapse: collapse; width: 100%; margin-top: 10px; }
        th { background: #d9d9d9; font-weight: 700; font-size: 12px; border: 1px solid #888; padding: 5px 6px; text-align: center; }
        td { border: 1px solid #aaa; padding: 5px 6px; font-size: 12px; vertical-align: top; }
        .num { text-align: right; }
        .center { text-align: center; }
        .notes-row td { border-top: none; color: #555; font-size: 11px; padding: 3px 8px 6px; }
        .total-row td { font-weight: 700; font-size: 13px; }
        .notes-stamp-row { display: flex; align-items: flex-end; gap: 20px; margin-top: 18px; }
        .notes-section { flex: 1; min-width: 0; }
        .notes-title { font-weight: 700; font-size: 12px; margin-bottom: 4px; }
        .notes-section ol { margin: 0; padding-left: 20px; list-style: decimal; }
        .notes-section li { font-size: 12px; line-height: 1.9; }
        .stamp-box { width: 100px; flex-shrink: 0; display: flex; justify-content: center; }
        .stamp-box img { width: 92px; height: auto; }
        .sign-row { display: flex; gap: 40px; margin-top: 26px; }
        .sign-box { flex: 1; }
        .sign-title { font-weight: 700; font-size: 12px; margin-bottom: 6px; }
        .sign-line { border-bottom: 1px solid #999; height: 40px; margin-bottom: 4px; }
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
          <div className="header-spacer" style={{ textAlign: 'right', fontSize: 11, color: '#333', lineHeight: 1.9, alignSelf: 'flex-end' }}>
            <div>服務電話：03-8321087</div>
            <div>地址：花蓮市民權三街十號</div>
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
              <th style={{ textAlign: 'left', width: 80 }}>品牌</th>
              <th style={{ textAlign: 'left' }}>產品名稱</th>
              <th style={{ textAlign: 'left', width: 110 }}>規格型號</th>
              <th style={{ width: 44 }}>單位</th>
              <th style={{ width: 44 }}>數量</th>
              <th style={{ width: 88 }}>單價</th>
              <th style={{ width: 96 }}>金額</th>
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
                      <td>{item.brand ?? ''}</td>
                      <td style={{ fontWeight: 500 }}>{item.product_name}</td>
                      <td style={{ color: '#444' }}>{item.model ?? ''}</td>
                      <td className="center">{item.unit}</td>
                      <td className="center">{item.quantity}</td>
                      <td className="num">{fmt(Number(item.unit_price))}</td>
                      <td className="num">{fmt(item.quantity * Number(item.unit_price))}</td>
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
          <tfoot>
            <tr className="total-row">
              <td colSpan={5}>總金額　{totalChinese}</td>
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
