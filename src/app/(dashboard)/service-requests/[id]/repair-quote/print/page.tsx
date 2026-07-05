import { Fragment } from 'react'
import type { Metadata } from 'next'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import PrintButtons from './PrintButtons'

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createClient()
  const { data: rq } = await supabase
    .from('service_repair_quotes')
    .select('repair_quote_no')
    .eq('service_request_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!rq) return {}
  return { title: `維修報價單_${rq.repair_quote_no}` }
}

export default async function RepairQuotePrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [{ data: req }, { data: rq }] = await Promise.all([
    supabase.from('service_requests').select('*, client:clients(company_name, phone, address)').eq('id', params.id).single(),
    supabase.from('service_repair_quotes').select('*, items:service_repair_quote_items(*)').eq('service_request_id', params.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (!req || !rq) return notFound()

  const clientName = (req as any).client?.company_name ?? ''
  const clientAddress = (req as any).client?.address ?? ''
  const items = ((rq as any).items ?? []).slice().sort((a: any, b: any) => a.seq_no - b.seq_no)

  const fmt = (n: number) => Number(n ?? 0).toLocaleString('zh-TW')

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
        .logo { display: flex; align-items: center; width: 210px; flex-shrink: 0; }
        .logo-img { width: 100%; height: auto; display: block; }
        .header-spacer { width: 210px; flex-shrink: 0; }
        .title-block { flex: 1; text-align: center; }
        h1 { font-size: 18px; font-weight: 700; text-align: center; margin: 4px 0 4px; }
        .sub-header { text-align: center; font-size: 12px; color: #333; margin-bottom: 16px; }
        .info-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 2px; }
        .section { margin-top: 14px; }
        .section-title { font-weight: 700; font-size: 13px; background: #d9d9d9; padding: 4px 8px; border: 1px solid #888; }
        table { border-collapse: collapse; width: 100%; }
        .field-table td { border: 1px solid #aaa; padding: 6px 8px; font-size: 12px; vertical-align: top; }
        .field-label { background: #f2f2f2; font-weight: 600; width: 110px; white-space: nowrap; }
        .field-value { width: 40%; }
        .textarea-box { border: 1px solid #aaa; border-top: none; padding: 8px; min-height: 40px; font-size: 12px; white-space: pre-wrap; }
        .item-table th { background: #d9d9d9; font-weight: 700; font-size: 12px; border: 1px solid #888; padding: 5px 6px; text-align: center; }
        .item-table td { border: 1px solid #aaa; padding: 5px 6px; font-size: 12px; vertical-align: top; }
        .num { text-align: right; }
        .center { text-align: center; }
        .notes-row td { border-top: none; color: #555; font-size: 11px; padding: 3px 8px 6px; }
        .total-row td { font-weight: 700; font-size: 13px; }
        .status-badge { display: inline-block; padding: 2px 10px; border: 1px solid #888; border-radius: 12px; font-size: 12px; font-weight: 600; }
        .sign-row { display: flex; justify-content: space-between; margin-top: 32px; }
        .sign-box { width: 45%; }
        .sign-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 4px; font-size: 12px; color: #444; text-align: center; }
      `}</style>

      <PrintButtons />

      <div className="page" id="print-page-content">
        {/* Header: logo + title */}
        <div className="header-row">
          <div className="logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="光輝影音科技" className="logo-img" />
          </div>
          <div className="title-block">
            <h1>維 修 報 價 單</h1>
            <div className="sub-header">單號：{rq.repair_quote_no}　原叫修單號：{req.service_no}</div>
          </div>
          <div className="header-spacer" />
        </div>

        <div className="info-row">
          <span>單據日期：{rq.created_at ? new Date(rq.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : ''}</span>
          {rq.customer_decision && (
            <span>客戶決定：<span className="status-badge">{rq.customer_decision}</span></span>
          )}
        </div>

        {/* 客戶資訊 */}
        <div className="section">
          <div className="section-title">客戶資訊</div>
          <table className="field-table">
            <tbody>
              <tr>
                <td className="field-label">客戶名稱</td>
                <td className="field-value">{clientName || '—'}</td>
                <td className="field-label">聯絡人</td>
                <td className="field-value">{rq.contact_name || '—'}</td>
              </tr>
              <tr>
                <td className="field-label">聯絡電話</td>
                <td className="field-value">{rq.client_phone || '—'}</td>
                <td className="field-label">預計完工天數</td>
                <td className="field-value">{rq.estimated_days != null ? `${rq.estimated_days} 天` : '—'}</td>
              </tr>
              {clientAddress && (
                <tr>
                  <td className="field-label">客戶地址</td>
                  <td className="field-value" colSpan={3}>{clientAddress}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 設備資訊 */}
        <div className="section">
          <div className="section-title">設備資訊</div>
          <table className="field-table">
            <tbody>
              <tr>
                <td className="field-label">設備名稱</td>
                <td className="field-value">{rq.equipment_name || '—'}</td>
                <td className="field-label">型號</td>
                <td className="field-value">{rq.equipment_model || '—'}</td>
              </tr>
              <tr>
                <td className="field-label">序號 (S/N)</td>
                <td className="field-value" colSpan={3}>{rq.serial_no || '—'}</td>
              </tr>
            </tbody>
          </table>
          {rq.diagnosis_note && (
            <>
              <div className="section-title" style={{ marginTop: 6 }}>廠商診斷說明</div>
              <div className="textarea-box">{rq.diagnosis_note}</div>
            </>
          )}
        </div>

        {/* 維修項目 */}
        <div className="section">
          <div className="section-title">維修項目</div>
          <table className="item-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th style={{ textAlign: 'left' }}>項目描述</th>
                <th style={{ textAlign: 'left', width: 100 }}>型號</th>
                <th style={{ width: 44 }}>單位</th>
                <th style={{ width: 44 }}>數量</th>
                <th style={{ width: 84 }}>單價</th>
                <th style={{ width: 96 }}>金額</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <Fragment key={item.id}>
                  <tr>
                    <td className="center">{item.seq_no}</td>
                    <td style={{ fontWeight: 500 }}>{item.description}</td>
                    <td style={{ color: '#444' }}>{item.model ?? ''}</td>
                    <td className="center">{item.unit}</td>
                    <td className="center">{item.quantity}</td>
                    <td className="num">{fmt(item.unit_price)}</td>
                    <td className="num">{fmt(item.quantity * item.unit_price)}</td>
                  </tr>
                  <tr className="notes-row">
                    <td colSpan={7}>備註：{item.notes ?? '—'}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row"><td colSpan={5} className="num">含稅總金額</td><td colSpan={2} className="num">NT$ {fmt(rq.total_amount)}</td></tr>
            </tfoot>
          </table>
        </div>

        {/* 備註 */}
        {rq.notes && (
          <div className="section">
            <div className="section-title">備註</div>
            <div className="textarea-box">{rq.notes}</div>
          </div>
        )}

        {/* 簽名欄 */}
        <div className="sign-row">
          <div className="sign-box">
            <div className="sign-line">客戶簽名 / 日期</div>
          </div>
          <div className="sign-box">
            <div className="sign-line">經辦人員簽名 / 日期</div>
          </div>
        </div>
      </div>
    </>
  )
}
