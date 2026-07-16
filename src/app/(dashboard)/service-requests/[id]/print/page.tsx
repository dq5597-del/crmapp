import type { Metadata } from 'next'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import PrintButtons from './PrintButtons'

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createClient()
  const { data: req } = await supabase
    .from('service_requests')
    .select('service_no')
    .eq('id', params.id)
    .single()

  if (!req) return {}
  return { title: `叫修單_${req.service_no}` }
}

export default async function ServiceRequestPrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: req } = await supabase
    .from('service_requests')
    .select('*, client:clients(company_name, phone, address)')
    .eq('id', params.id)
    .single()

  if (!req) return notFound()

  const clientName = (req as any).client?.company_name ?? ''
  const clientAddress = (req as any).client?.address ?? ''

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
        .full-row td { width: auto; }
        .textarea-box { border: 1px solid #aaa; border-top: none; padding: 8px; min-height: 50px; font-size: 12px; white-space: pre-wrap; }
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
            <h1>叫 修 單</h1>
            <div className="sub-header">單號：{req.service_no}</div>
          </div>
          <div className="header-spacer" />
        </div>

        <div className="info-row">
          <span>通報日期：{req.reported_date}</span>
          <span>目前狀態：<span className="status-badge">{req.status}</span></span>
        </div>

        {/* 客戶資訊 */}
        <div className="section">
          <div className="section-title">單位資訊</div>
          <table className="field-table">
            <tbody>
              <tr>
                <td className="field-label">單位名稱</td>
                <td className="field-value">{clientName || '—'}</td>
                <td className="field-label">聯絡人</td>
                <td className="field-value">{req.contact_name || '—'}</td>
              </tr>
              <tr>
                <td className="field-label">聯絡電話</td>
                <td className="field-value">{req.phone || '—'}</td>
                <td className="field-label">負責人員</td>
                <td className="field-value">{req.assigned_to || '—'}</td>
              </tr>
              {clientAddress && (
                <tr>
                  <td className="field-label">單位地址</td>
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
                <td className="field-value">{req.equipment_name || '—'}</td>
                <td className="field-label">型號</td>
                <td className="field-value">{req.equipment_model || '—'}</td>
              </tr>
              <tr>
                <td className="field-label">序號 (S/N)</td>
                <td className="field-value">{req.serial_no || '—'}</td>
                <td className="field-label">維修方式</td>
                <td className="field-value">{req.service_type || '—'}</td>
              </tr>
              <tr>
                <td className="field-label">保固狀態</td>
                <td className="field-value">{req.warranty_status || '—'}</td>
                <td className="field-label">保固到期日</td>
                <td className="field-value">{req.warranty_expiry || '—'}</td>
              </tr>
            </tbody>
          </table>
          <div className="section-title" style={{ marginTop: 6 }}>故障描述</div>
          <div className="textarea-box">{req.issue_description || '—'}</div>
        </div>

        {/* 結案資訊（若已結案） */}
        {req.is_closed && (
          <div className="section">
            <div className="section-title">結案資訊</div>
            <table className="field-table">
              <tbody>
                <tr>
                  <td className="field-label">結案日期</td>
                  <td className="field-value">{req.closed_date || '—'}</td>
                  <td className="field-label">實際維修費用</td>
                  <td className="field-value">{req.actual_repair_cost != null ? `NT$ ${Number(req.actual_repair_cost).toLocaleString('zh-TW')}` : '—'}</td>
                </tr>
                <tr>
                  <td className="field-label">收款確認</td>
                  <td className="field-value">{req.payment_confirmed ? '是' : '否'}</td>
                  <td className="field-label">取件確認</td>
                  <td className="field-value">{req.pickup_confirmed ? '是' : '否'}</td>
                </tr>
              </tbody>
            </table>
            {req.close_notes && (
              <>
                <div className="section-title" style={{ marginTop: 6 }}>結案備註</div>
                <div className="textarea-box">{req.close_notes}</div>
              </>
            )}
          </div>
        )}

        {/* 備註 */}
        {req.notes && (
          <div className="section">
            <div className="section-title">備註</div>
            <div className="textarea-box">{req.notes}</div>
          </div>
        )}

        {/* 簽名欄 */}
        <div className="sign-row">
          <div className="sign-box">
            <div className="sign-line">單位簽名 / 日期</div>
          </div>
          <div className="sign-box">
            <div className="sign-line">經辦人員簽名 / 日期</div>
          </div>
        </div>
      </div>
    </>
  )
}
