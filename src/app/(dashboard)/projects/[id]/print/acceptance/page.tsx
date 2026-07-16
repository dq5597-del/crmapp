import type { Metadata } from 'next'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import PrintDocButtons from '@/components/PrintDocButtons'
import DocSignatures from '@/components/DocSignatures'
import { photoCatLabel } from '@/lib/project-doc-spec'

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createClient()
  const { data } = await supabase.from('projects').select('project_name').eq('id', params.id).single()
  return { title: data ? `驗收單_${data.project_name}` : '驗收單' }
}

const BUCKET = 'project-photos'

export default async function AcceptancePrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [{ data: project }, { data: photos }, { data: markers }] = await Promise.all([
    supabase.from('projects').select('*, clients(company_name, phone, address)').eq('id', params.id).single(),
    supabase.from('project_photos').select('*').eq('project_id', params.id)
      .in('category', [1, 2, 3]).order('category').order('created_at'),
    supabase.from('project_equipment_markers').select('*').eq('project_id', params.id).order('created_at'),
  ])

  if (!project) return notFound()

  const photoList = photos ?? []
  const publicUrl = (path: string) =>
    supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—'

  // 完工項目：以標示圖標記為主（有命名的），供逐項驗收
  const items = (markers ?? []).filter((m: any) => (m.label ?? '').trim())

  const missingCats = [1, 2, 3].filter(c => !photoList.some((p: any) => p.category === c))

  return (
    <>
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          @page { margin: 15mm 14mm; size: A4; }
          .section { break-inside: avoid; }
        }
        * { box-sizing: border-box; }
        html, body { background: #fff; }
        .app-shell { background: #fff !important; }
        body { font-family: 'Noto Sans TC', 'Microsoft JhengHei', '微軟正黑體', sans-serif; font-size: 12px; color: #000; margin: 0; }
        .page { max-width: 210mm; margin: 0 auto; padding: 24px 28px; background: #fff; }
        .header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .logo { width: 210px; flex-shrink: 0; }
        .logo img { width: 100%; height: auto; display: block; }
        .header-spacer { width: 210px; flex-shrink: 0; }
        h1 { font-size: 18px; font-weight: 700; text-align: center; margin: 4px 0; }
        .sub-header { text-align: center; font-size: 12px; color: #333; margin-bottom: 14px; }
        .info-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 2px; }
        .section { margin-top: 14px; }
        .section-title { background: #166534; color: #fff; font-weight: 700; font-size: 12px; padding: 4px 10px; border-radius: 4px 4px 0 0; }
        table { border-collapse: collapse; width: 100%; }
        th { background: #f0fdf4; border: 1px solid #94a3b8; padding: 4px 8px; font-size: 11px; }
        td { border: 1px solid #94a3b8; padding: 4px 8px; font-size: 11px; }
        .missing { color: #dc2626; font-weight: 700; }
        .warn-box { border: 2px solid #dc2626; background: #fef2f2; border-radius: 6px; padding: 8px 12px; margin-top: 12px; font-size: 11px; color: #7f1d1d; }
        .photo-grid { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; border: 1px solid #94a3b8; border-top: none; }
        .photo-cell { width: calc(25% - 5px); }
        .photo-cell img { width: 100%; height: 96px; object-fit: cover; border: 1px solid #cbd5e1; border-radius: 4px; display: block; }
        .photo-note { font-size: 9px; color: #475569; margin-top: 2px; }
        .photo-cat-title { font-size: 11px; font-weight: 700; color: #334155; width: 100%; }
        .check-cell { width: 70px; text-align: center; }
        .declare { border: 1px solid #94a3b8; padding: 10px 14px; font-size: 11px; line-height: 1.9; margin-top: 14px; }
      `}</style>

      <PrintDocButtons fileName={`驗收單_${project.project_name ?? ''}`} />

      <div className="page" id="print-page-content">
        <div className="header-row">
          <div className="logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="光輝影音科技" />
          </div>
          <div style={{ flex: 1 }}>
            <h1>工 程 驗 收 ／ 完 工 確 認 單</h1>
            <div className="sub-header">{project.project_name}</div>
          </div>
          <div className="header-spacer" />
        </div>

        <div className="info-row">
          <span>單位名稱：<strong>{(project as any).clients?.company_name ?? ''}</strong></span>
          <span>驗收日期：{new Date().toLocaleDateString('zh-TW')}</span>
        </div>
        <div className="info-row">
          <span>施工日期：{fmtDate(project.start_date)}　完工日期：{fmtDate(project.end_date)}</span>
          <span>專案狀態：{project.status}</span>
        </div>

        {missingCats.length > 0 && (
          <div className="warn-box">
            ⚠ 提醒：尚未上傳 {missingCats.map(photoCatLabel).join('、')} 照片，驗收前請補齊。
          </div>
        )}

        {/* 驗收項目 */}
        <div className="section">
          <div className="section-title">驗收項目清單</div>
          <table>
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th style={{ textAlign: 'left' }}>設備／工程項目</th>
                <th className="check-cell">安裝完成</th>
                <th className="check-cell">功能正常</th>
                <th style={{ textAlign: 'left' }}>驗收備註</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? items.map((m: any, i: number) => (
                <tr key={m.id}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td>{m.label}</td>
                  <td className="check-cell">□</td>
                  <td className="check-cell">□</td>
                  <td></td>
                </tr>
              )) : (
                <>
                  {[1, 2, 3, 4, 5].map(i => (
                    <tr key={i}>
                      <td style={{ textAlign: 'center' }}>{i}</td>
                      <td></td>
                      <td className="check-cell">□</td>
                      <td className="check-cell">□</td>
                      <td></td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* 施工前中後照片 */}
        <div className="section">
          <div className="section-title">照片記錄（施工前／施工中／完工）</div>
          {[1, 2, 3].map(cat => {
            const catPhotos = photoList.filter((p: any) => p.category === cat)
            return (
              <div className="photo-grid" key={cat}>
                <div className="photo-cat-title">{photoCatLabel(cat)}</div>
                {catPhotos.length > 0 ? catPhotos.map((p: any) => (
                  <div className="photo-cell" key={p.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={publicUrl(p.storage_path)} alt={photoCatLabel(p.category)} />
                    <div className="photo-note">{p.notes || ''}</div>
                  </div>
                )) : <span className="missing">未提供照片</span>}
              </div>
            )
          })}
        </div>

        {/* 驗收聲明 */}
        <div className="declare section">
          茲證明上列工程項目業經雙方會同檢驗完竣，設備安裝與功能運作均符合約定規格。
          單位簽認後即視同驗收完成；保固期間依合約約定，自驗收日起算。
          如有未盡事項，雙方同意於備註欄註明並依約處理。
        </div>

        {/* 三方簽名 */}
        <DocSignatures docType="acceptance" refId={params.id} />
      </div>
    </>
  )
}
