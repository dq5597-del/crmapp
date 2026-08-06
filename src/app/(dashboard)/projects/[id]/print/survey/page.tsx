import type { Metadata } from 'next'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import PrintDocButtons from '@/components/PrintDocButtons'
import DocSignatures from '@/components/DocSignatures'
import EquipmentMapPrint, { EquipmentLegend } from '@/components/EquipmentMapPrint'
import {
  REPORT_SECTIONS, PHOTO_CATS, photoCatLabel,
  isEmptyValue, displayValue, isMarkerUnlabeled, EquipMarker,
} from '@/lib/project-doc-spec'

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createClient()
  const { data } = await supabase.from('projects').select('project_name').eq('id', params.id).single()
  return { title: data ? `場勘報告_${data.project_name}` : '場勘報告' }
}

const BUCKET = 'project-photos'

export default async function SurveyReportPrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [{ data: project }, { data: survey }, { data: photos }, { data: markers }] = await Promise.all([
    supabase.from('projects').select('*, clients(company_name, phone, address)').eq('id', params.id).single(),
    supabase.from('site_surveys').select('*').eq('project_id', params.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('project_photos').select('*').eq('project_id', params.id).order('category').order('created_at'),
    supabase.from('project_equipment_markers').select('*').eq('project_id', params.id).order('created_at'),
  ])

  if (!project) return notFound()

  const clientName = (project as any).clients?.company_name ?? ''
  const photoList = photos ?? []
  const markerList = (markers ?? []) as EquipMarker[]
  const publicUrl = (path: string) =>
    supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

  // ── 未標示檢查 ──────────────────────────────────────────────
  const missingFields: { section: string; label: string }[] = []
  for (const sec of REPORT_SECTIONS) {
    const src: any = sec.source === 'project' ? project : (survey ?? {})
    for (const f of sec.fields) {
      if (isEmptyValue(f, src?.[f.key])) missingFields.push({ section: sec.title, label: f.label })
    }
  }
  const missingPhotoCats = PHOTO_CATS.filter(c => !photoList.some((p: any) => p.category === c.value))
  const unlabeledMarkers = markerList.filter(isMarkerUnlabeled)
  const hasWarnings = missingFields.length > 0 || missingPhotoCats.length > 0 || unlabeledMarkers.length > 0

  const roomL = Number(survey?.space_length) || 10
  const roomW = Number(survey?.space_width) || 8

  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : ''

  return (
    <>
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          @page { margin: 12mm 12mm; size: A4; }
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
        .section-title { background: #1e40af; color: #fff; font-weight: 700; font-size: 12px; padding: 4px 10px; border-radius: 4px 4px 0 0; }
        table.fields { border-collapse: collapse; width: 100%; }
        table.fields th { background: #eef2ff; border: 1px solid #94a3b8; padding: 4px 8px; font-size: 11px; text-align: left; width: 150px; font-weight: 600; color: #334155; vertical-align: top; }
        table.fields td { border: 1px solid #94a3b8; padding: 4px 8px; font-size: 11px; white-space: pre-wrap; }
        .missing { color: #dc2626; font-weight: 700; }
        .warn-box { border: 2px solid #dc2626; background: #fef2f2; border-radius: 6px; padding: 10px 14px; margin-top: 14px; }
        .warn-title { color: #dc2626; font-weight: 700; font-size: 13px; margin-bottom: 6px; }
        .warn-box ul { margin: 0; padding-left: 18px; }
        .warn-box li { font-size: 11px; color: #7f1d1d; line-height: 1.7; }
        .photo-grid { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; border: 1px solid #94a3b8; border-top: none; }
        .photo-cell { width: calc(25% - 5px); }
        .photo-cell img { width: 100%; height: 96px; object-fit: cover; border: 1px solid #cbd5e1; border-radius: 4px; display: block; }
        .photo-note { font-size: 9px; color: #475569; margin-top: 2px; line-height: 1.3; }
        .photo-cat-title { font-size: 11px; font-weight: 700; color: #334155; width: 100%; }
        .no-photo { font-size: 11px; padding: 8px; }
        .map-box { border: 1px solid #94a3b8; border-top: none; padding: 10px; }
        .marker-table { border-collapse: collapse; width: 100%; margin-top: 8px; }
        .marker-table th { background: #eef2ff; border: 1px solid #94a3b8; padding: 3px 6px; font-size: 10px; }
        .marker-table td { border: 1px solid #94a3b8; padding: 3px 6px; font-size: 10px; }
      `}</style>

      <PrintDocButtons fileName={`場勘報告_${project.project_name ?? ''}`} />

      <div className="page" id="print-page-content">
        {/* Header */}
        <div className="header-row">
          <div className="logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="光輝影音科技" />
          </div>
          <div style={{ flex: 1 }}>
            <h1>場 勘 報 告</h1>
            <div className="sub-header">{project.project_name}</div>
          </div>
          <div className="header-spacer" />
        </div>

        <div className="info-row">
          <span>客戶名稱：<strong>{clientName}</strong></span>
          <span>報告日期：{fmtDate(new Date().toISOString())}</span>
        </div>
        <div className="info-row">
          <span>場勘日期：{fmtDate(survey?.survey_date)}　場勘負責人：{survey?.surveyor || '—'}</span>
          <span>專案狀態：{project.status}</span>
        </div>

        {/* 未標示提醒 */}
        {hasWarnings && (
          <div className="warn-box section">
            <div className="warn-title">⚠ 未標示／未填寫項目提醒（共 {missingFields.length + missingPhotoCats.length + unlabeledMarkers.length} 項）</div>
            <ul>
              {missingFields.length > 0 && (
                <li>未填寫欄位 {missingFields.length} 項：{missingFields.map(m => m.label).join('、')}</li>
              )}
              {missingPhotoCats.length > 0 && (
                <li>未提供照片分類 {missingPhotoCats.length} 項：{missingPhotoCats.map(c => photoCatLabel(c.value)).join('、')}</li>
              )}
              {unlabeledMarkers.length > 0 && (
                <li>標示圖上未命名標記點 {unlabeledMarkers.length} 個（圖面上以紅字「未標示」顯示）</li>
              )}
            </ul>
          </div>
        )}

        {/* ①-⑨ 欄位區塊 */}
        {REPORT_SECTIONS.map(sec => {
          const src: any = sec.source === 'project' ? project : (survey ?? {})
          const catIds = sec.photoCats ?? []
          const secPhotos = photoList.filter((p: any) => catIds.includes(p.category))
          return (
            <div className="section" key={sec.title}>
              <div className="section-title">{sec.title}</div>
              <table className="fields">
                <tbody>
                  {sec.fields.map(f => {
                    const empty = isEmptyValue(f, src?.[f.key])
                    return (
                      <tr key={f.key}>
                        <th>{f.label}</th>
                        <td>{empty
                          ? <span className="missing">未填寫</span>
                          : displayValue(f, src?.[f.key])}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {catIds.length > 0 && (
                secPhotos.length > 0 ? (
                  <div className="photo-grid">
                    {secPhotos.map((p: any) => (
                      <div className="photo-cell" key={p.id}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={publicUrl(p.storage_path)} alt={photoCatLabel(p.category)} />
                        <div className="photo-note">{photoCatLabel(p.category)}{p.notes ? `：${p.notes}` : ''}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="photo-grid no-photo">
                    <span className="missing">未提供照片（{catIds.map(photoCatLabel).join('、')}）</span>
                  </div>
                )
              )}
            </div>
          )
        })}

        {/* 設備類 — 現場設備記錄照片（8-13） */}
        <div className="section">
          <div className="section-title">🔧 設備類 — 現場設備記錄</div>
          {([[8, 9, '控制台'], [10, 11, '機櫃設備'], [12, 13, '現場設備']] as const).map(([oldCat, newCat, group]) => {
            const groupPhotos = photoList.filter((p: any) => p.category === oldCat || p.category === newCat)
            return (
              <div className="photo-grid" key={group}>
                <div className="photo-cat-title">{group}</div>
                {groupPhotos.length > 0 ? groupPhotos.map((p: any) => (
                  <div className="photo-cell" key={p.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={publicUrl(p.storage_path)} alt={photoCatLabel(p.category)} />
                    <div className="photo-note">{photoCatLabel(p.category)}{p.notes ? `：${p.notes}` : ''}</div>
                  </div>
                )) : <span className="missing no-photo">未提供照片（{group} 舊有/新設設備）</span>}
              </div>
            )
          })}
        </div>

        {/* 現場設備標示圖 */}
        <div className="section">
          <div className="section-title">🗺️ 現場設備標示圖（{roomL}m × {roomW}m）</div>
          <div className="map-box">
            {markerList.length > 0 ? (
              <>
                <EquipmentMapPrint markers={markerList} roomL={roomL} roomW={roomW} />
                <EquipmentLegend />
                <table className="marker-table">
                  <thead>
                    <tr><th style={{ width: 30 }}>#</th><th>設備類型</th><th>標籤</th><th>形狀</th><th>備註</th></tr>
                  </thead>
                  <tbody>
                    {markerList.map((m, i) => (
                      <tr key={m.id}>
                        <td style={{ textAlign: 'center' }}>{i + 1}</td>
                        <td>{(['network','info','audio','video','env','phone','aircon'].includes(m.equipment_type)
                          ? { network:'網路設備',info:'資訊設備',audio:'音響設備',video:'影像設備',env:'環控設備',phone:'電話設備',aircon:'空調設備' }[m.equipment_type]
                          : m.equipment_type)}</td>
                        <td>{isMarkerUnlabeled(m)
                          ? <span className="missing">未標示</span>
                          : m.label}</td>
                        <td>{{ circle: '圓點', rect: '矩形', line: '線段', arrow: '箭頭' }[m.shape_type ?? 'circle']}</td>
                        <td>{m.notes || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <span className="missing">未繪製設備標示圖</span>
            )}
          </div>
        </div>

        {/* 照片記錄（施工前/中/完工） */}
        <div className="section">
          <div className="section-title">📷 照片記錄（施工前／施工中／完工）</div>
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
                )) : <span className="missing no-photo">未提供照片</span>}
              </div>
            )
          })}
        </div>

        {/* 三方簽名 */}
        <DocSignatures docType="survey" refId={params.id} />
      </div>
    </>
  )
}
