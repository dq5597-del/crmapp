import type { Metadata } from 'next'
import { createServerSupabaseClient as createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import PrintDocButtons from '@/components/PrintDocButtons'

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createClient()
  const { data } = await supabase.from('projects').select('project_name').eq('id', params.id).single()
  return { title: data ? `專案總覽_${data.project_name}` : '專案總覽' }
}

export default async function ProjectOverviewPrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('*, clients(company_name, phone, address)')
    .eq('id', params.id)
    .single()

  if (!project) return notFound()

  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—'
  const client = (project as any).clients ?? {}
  const budget = project.budget != null ? `NT$${Number(project.budget).toLocaleString()}` : '—'

  const rows: [string, string][] = [
    ['客戶名稱', client.company_name ?? '—'],
    ['聯絡電話', client.phone ?? '—'],
    ['地址', client.address ?? '—'],
    ['專案狀態', project.status ?? '—'],
    ['場景／地點', project.scene_name ?? '—'],
    ['使用單位', project.user_type ?? '—'],
    ['施工日期', fmtDate(project.start_date)],
    ['完工日期', fmtDate(project.end_date)],
    ['預算', budget],
  ]

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
        .section { margin-top: 14px; }
        .section-title { background: #1d4ed8; color: #fff; font-weight: 700; font-size: 12px; padding: 4px 10px; border-radius: 4px 4px 0 0; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #94a3b8; padding: 6px 10px; font-size: 12px; }
        th { background: #eff6ff; text-align: left; width: 130px; white-space: nowrap; }
        .textbox { border: 1px solid #94a3b8; border-top: none; padding: 10px 12px; font-size: 12px; line-height: 1.8; white-space: pre-wrap; min-height: 48px; }
      `}</style>

      <PrintDocButtons fileName={`專案總覽_${project.project_name ?? ''}`} />

      <div className="page" id="print-page-content">
        <div className="header-row">
          <div className="logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="光輝影音科技" />
          </div>
          <div style={{ flex: 1 }}>
            <h1>專 案 資 料 表</h1>
            <div className="sub-header">{project.project_name}</div>
          </div>
          <div className="header-spacer" />
        </div>

        <div className="section">
          <div className="section-title">專案基本資料</div>
          <table>
            <tbody>
              {rows.map(([k, v], i) => (
                i % 2 === 0 ? (
                  <tr key={k}>
                    <th>{k}</th><td>{v}</td>
                    {rows[i + 1] ? <><th>{rows[i + 1][0]}</th><td>{rows[i + 1][1]}</td></> : <><th></th><td></td></>}
                  </tr>
                ) : null
              ))}
            </tbody>
          </table>
        </div>

        <div className="section">
          <div className="section-title">專案描述</div>
          <div className="textbox">{project.description || '—'}</div>
        </div>

        <div className="section">
          <div className="section-title">需求分析</div>
          <table>
            <tbody>
              <tr><th>主要功能定位</th><td colSpan={3}>{project.main_function || '—'}</td></tr>
              <tr><th>設備需求</th><td>{project.equipment_needs || '—'}</td><th>音響需求</th><td>{project.audio_needs || '—'}</td></tr>
              <tr><th>影像需求</th><td>{project.video_needs || '—'}</td><th>互動需求</th><td>{project.interaction_needs || '—'}</td></tr>
              <tr><th>控制需求</th><td>{project.control_needs || '—'}</td><th>其他需求</th><td>{project.other_needs || '—'}</td></tr>
              <tr><th>場地規格</th><td colSpan={3}>{project.venue_specs || '—'}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="section">
          <div className="section-title">備註</div>
          <div className="textbox">{project.notes || '—'}</div>
        </div>

        <div className="section" style={{ marginTop: 24, fontSize: 11, color: '#555', textAlign: 'right' }}>
          列印日期：{new Date().toLocaleDateString('zh-TW')}
        </div>
      </div>
    </>
  )
}
