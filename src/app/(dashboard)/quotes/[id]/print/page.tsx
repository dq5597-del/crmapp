import { Fragment } from 'react'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import PrintButtons from './PrintButtons'

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
  const company = settings?.company_name ?? '光輝實業社'
  const companyPhone = settings?.company_phone ?? '0980-566-799'
  const companyAddress = settings?.company_address ?? ''
  const bankInfo = settings?.bank_name
    ? `${settings.bank_name}（代號：${settings.bank_code ?? ''}）／戶名：${settings.bank_account_name ?? ''}／帳號：${settings.bank_account ?? ''}`
    : ''

  const fmt = (n: number) => n.toLocaleString('zh-TW')

  // Build notes items:
  // 1. 結構化欄位（有效期限、交貨工期、付款條件、匯款帳號）
  // 2. 系統設定的動態備註條目（default_note_items）
  // 3. 本張報價單的自訂備註
  const noteItems: string[] = []
  if (quote.valid_until) noteItems.push(`報價單有效期限：${quote.valid_until}`)
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

  return (
    <>
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          @page { margin: 15mm 14mm; size: A4; }
        }
        * { box-sizing: border-box; }
        html, body { background: #fff; }
        .app-shell { background: #fff !important; }
        body { font-family: 'Noto Sans TC', 'Microsoft JhengHei', '微軟正黑體', sans-serif; font-size: 12px; color: #000; margin: 0; background: #fff; }
        .page { max-width: 210mm; margin: 0 auto; padding: 24px 28px; background: #fff; }
        .header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .logo { display: flex; align-items: center; gap: 10px; width: 210px; flex-shrink: 0; }
        .logo-mark { background: #2a9d94; color: #fff; font-weight: 700; font-size: 22px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; letter-spacing: -0.5px; }
        .logo-text-cn { font-size: 21px; font-weight: 700; color: #111; line-height: 1.15; white-space: nowrap; }
        .logo-text-en { font-size: 7px; font-weight: 700; letter-spacing: 1px; color: #111; white-space: nowrap; margin-top: 3px; }
        .header-spacer { width: 210px; flex-shrink: 0; }
        .title-block { flex: 1; text-align: center; }
        h1 { font-size: 18px; font-weight: 700; text-align: center; margin: 4px 0 4px; }
        .sub-header { text-align: center; font-size: 12px; color: #333; margin-bottom: 16px; }
        .info-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 2px; }
        table { border-collapse: collapse; width: 100%; margin-top: 10px; }
        th { background: #d9d9d9; font-weight: 700; font-size: 12px; border: 1px solid #888; padding: 5px 6px; text-align: center; }
        td { border: 1px solid #aaa; padding: 5px 6px; font-size: 12px; vertical-align: top; }
        .num { text-align: right; }
        .center { text-align: center; }
        .notes-row td { border-top: none; color: #555; font-size: 11px; padding: 3px 8px 6px; }
        .total-row td { font-weight: 700; font-size: 13px; }
        .notes-section { margin-top: 18px; }
        .notes-title { font-weight: 700; font-size: 12px; margin-bottom: 4px; }
        .notes-section ol { margin: 0; padding-left: 20px; list-style: decimal; }
        .notes-section li { font-size: 12px; line-height: 1.9; }
      `}</style>

      <PrintButtons />

      <div className="page">
        {/* Header: logo + title */}
        <div className="header-row">
          <div className="logo">
            <div className="logo-mark">GH</div>
            <div>
              <div className="logo-text-cn">光輝影音科技</div>
              <div className="logo-text-en">AUDIO VISUAL SYSTEM INTEGRATION</div>
            </div>
          </div>
          <div className="title-block">
            <h1>估 價 單</h1>
            <div className="sub-header">供應商：{company}{companyPhone ? `　電話：${companyPhone}` : ''}{companyAddress ? `　地址：${companyAddress}` : ''}</div>
          </div>
          <div className="header-spacer" />
        </div>

        {/* Client + quote info */}
        <div className="info-row">
          <span>客戶名稱：<strong>{clientName}</strong></span>
          <span>單據日期：{quote.created_at ? new Date(quote.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : ''}</span>
        </div>
        {(quote.contact_name || quote.client_phone) && (
          <div className="info-row">
            {quote.contact_name && <span>聯絡人：{quote.contact_name}</span>}
            {quote.client_phone && <span>電話：{quote.client_phone}</span>}
          </div>
        )}
        {quote.project_name && (
          <div className="info-row">
            <span>案名：{quote.project_name}</span>
            <span>單號：{quote.quote_no}</span>
          </div>
        )}
        {!quote.project_name && (
          <div className="info-row">
            <span></span>
            <span>單號：{quote.quote_no}</span>
          </div>
        )}

        {/* Items table */}
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>編號</th>
              <th style={{ textAlign: 'left' }}>產品名稱</th>
              <th style={{ textAlign: 'left', width: 110 }}>規格型號</th>
              <th style={{ width: 44 }}>單位</th>
              <th style={{ width: 44 }}>數量</th>
              <th style={{ width: 88 }}>單價</th>
              <th style={{ width: 96 }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item: any) => (
              <Fragment key={item.id}>
                <tr>
                  <td className="center">{item.seq_no}</td>
                  <td style={{ fontWeight: 500 }}>{item.product_name}</td>
                  <td style={{ color: '#444' }}>{item.model ?? ''}</td>
                  <td className="center">{item.unit}</td>
                  <td className="center">{item.quantity}</td>
                  <td className="num">{fmt(Number(item.unit_price))}</td>
                  <td className="num">{fmt(item.quantity * Number(item.unit_price))}</td>
                </tr>
                <tr className="notes-row">
                  <td colSpan={7}>備註：{item.item_notes ?? '—'}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td colSpan={4}>總金額　{totalChinese}</td>
              <td colSpan={3} className="num">NT$ {fmt(Number(quote.total_amount))}</td>
            </tr>
          </tfoot>
        </table>

        {/* Notes */}
        {noteItems.length > 0 && (
          <div className="notes-section">
            <div className="notes-title">備註事項</div>
            <ol>
              {noteItems.map((n, i) => <li key={i}>{n}</li>)}
            </ol>
          </div>
        )}

      </div>
    </>
  )
}
