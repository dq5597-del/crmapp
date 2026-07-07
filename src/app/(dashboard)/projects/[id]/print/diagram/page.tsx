import type { Metadata } from 'next'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import PrintDocButtons from '@/components/PrintDocButtons'
import DocSignatures from '@/components/DocSignatures'
import EquipmentMapPrint, { EquipmentLegend } from '@/components/EquipmentMapPrint'
import { EQUIP_TYPES, isMarkerUnlabeled, EquipMarker } from '@/lib/project-doc-spec'

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createClient()
  const { data } = await supabase.from('projects').select('project_name').eq('id', params.id).single()
  return { title: data ? `設備標示圖_${data.project_name}` : '設備標示圖' }
}

export default async function DiagramPrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [{ data: project }, { data: survey }, { data: markers }] = await Promise.all([
    supabase.from('projects').select('*, clients(company_name)').eq('id', params.id).single(),
    supabase.from('site_surveys').select('space_length, space_width, survey_date, surveyor')
      .eq('project_id', params.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('project_equipment_markers').select('*').eq('project_id', params.id).order('created_at'),
  ])

  if (!project) return notFound()

  const markerList = (markers ?? []) as EquipMarker[]
  const unlabeled = markerList.filter(isMarkerUnlabeled)
  const roomL = Number(survey?.space_length) || 10
  const roomW = Number(survey?.space_width) || 8
  const typeLabel = (k: string) => EQUIP_TYPES.find(t => t.key === k)?.label ?? k

  return (
    <>
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          @page { margin: 10mm 12mm; size: A4 landscape; }
        }
        * { box-sizing: border-box; }
        html, body { background: #fff; }
        .app-shell { background: #fff !important; }
        body { font-family: 'Noto Sans TC', 'Microsoft JhengHei', '微軟正黑體', sans-serif; font-size: 12px; color: #000; margin: 0; }
        .page { max-width: 297mm; margin: 0 auto; padding: 20px 26px; background: #fff; }
        h1 { font-size: 17px; font-weight: 700; text-align: center; margin: 2px 0; }
        .sub-header { text-align: center; font-size: 12px; color: #333; margin-bottom: 10px; }
        .info-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px; }
        .layout { display: flex; gap: 14px; align-items: flex-start; }
        .map-col { flex: 1.6; border: 1px solid #94a3b8; border-radius: 4px; padding: 8px; }
        .list-col { flex: 1; }
        .warn-box { border: 2px solid #dc2626; background: #fef2f2; border-radius: 6px; padding: 6px 10px; margin-bottom: 8px; font-size: 11px; color: #7f1d1d; }
        .missing { color: #dc2626; font-weight: 700; }
        table { border-collapse: collapse; width: 100%; }
        th { background: #eef2ff; border: 1px solid #94a3b8; padding: 3px 6px; font-size: 10px; }
        td { border: 1px solid #94a3b8; padding: 3px 6px; font-size: 10px; }
      `}</style>

      <PrintDocButtons fileName={`設備標示圖_${project.project_name ?? ''}`} landscape />

      <div className="page" id="print-page-content">
        <h1>現場設備標示圖／工程規劃圖</h1>
        <div className="sub-header">{(project as any).clients?.company_name}｜{project.project_name}</div>
        <div className="info-row">
          <span>房間尺寸：{roomL}m × {roomW}m　場勘日期：{survey?.survey_date ?? '—'}　繪製：{survey?.surveyor || '—'}</span>
          <span>列印日期：{new Date().toLocaleDateString('zh-TW')}</span>
        </div>

        {unlabeled.length > 0 && (
          <div className="warn-box">
            ⚠ 本圖有 <strong>{unlabeled.length}</strong> 個標記點未標示名稱（圖上以紅字「未標示」顯示），請補充設備名稱後再交付。
          </div>
        )}

        <div className="layout">
          <div className="map-col">
            {markerList.length > 0 ? (
              <>
                <EquipmentMapPrint markers={markerList} roomL={roomL} roomW={roomW} />
                <EquipmentLegend />
              </>
            ) : (
              <div className="missing" style={{ padding: 30, textAlign: 'center' }}>尚未繪製任何標記</div>
            )}
          </div>
          <div className="list-col">
            <table>
              <thead>
                <tr><th style={{ width: 26 }}>#</th><th>設備類型</th><th>標籤／設備名稱</th><th>備註</th></tr>
              </thead>
              <tbody>
                {markerList.map((m, i) => (
                  <tr key={m.id}>
                    <td style={{ textAlign: 'center' }}>{i + 1}</td>
                    <td>{typeLabel(m.equipment_type)}</td>
                    <td>{isMarkerUnlabeled(m) ? <span className="missing">未標示</span> : m.label}</td>
                    <td>{m.notes || ''}</td>
                  </tr>
                ))}
                {markerList.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8' }}>無標記資料</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <DocSignatures docType="diagram" refId={params.id} />
      </div>
    </>
  )
}
