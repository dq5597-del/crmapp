'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { ProjectStatus } from '@/types'
import { Plus, Pencil, Trash2, Briefcase, ChevronDown, ChevronRight, Save, X } from 'lucide-react'
import { formatDate } from '@/lib/utils'

const STATUS_OPTIONS: ProjectStatus[] = ['規劃中', '進行中', '施工中', '完工', '暫停', '取消']
const STATUS_COLORS: Record<string, string> = {
  '規劃中': 'bg-purple-100 text-purple-700',
  '進行中': 'bg-blue-100 text-blue-700',
  '施工中': 'bg-orange-100 text-orange-700',
  '完工':   'bg-green-100 text-green-700',
  '暫停':   'bg-yellow-100 text-yellow-700',
  '取消':   'bg-gray-100 text-gray-600',
}

// Color tokens
const BLUE  = { header: 'bg-blue-600',    light: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700'    }
const GREEN = { header: 'bg-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' }
const ORG   = { header: 'bg-orange-500',  light: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700'  }

type SurveyForm = {
  id?: string
  project_id?: string
  survey_date: string
  surveyor: string
  contact_name: string
  contact_phone: string
  venue_address: string
  space_usage: string
  space_length: string
  space_width: string
  space_height: string
  capacity: string
  ceiling_type: string
  wall_material: string
  can_construct: boolean
  space_form: string
  noise_factors: string
  power_panel_location: string
  outlet_count: string
  voltage_capacity: string
  network_info: string
  need_power_expansion: boolean
  av_system_needs: string
  other_special_needs: string
  no_drilling: boolean
  special_construction_time: string
  hanging_limits: string
  construction_issues: string
  existing_equipment: string
  other_observations: string
  client_expected_functions: string
  preliminary_budget_range: string
  need_procurement: boolean
  travel_time_minutes: string
  parking_location: string
  distance_to_storage: string
  elevator_size: string
  rf_interference: string
  ambient_noise_db: string
  acoustics: string
  natural_light: string
  audience_factors: string
  survey_notes: string
}

const emptySurvey: SurveyForm = {
  survey_date: '', surveyor: '', contact_name: '', contact_phone: '', venue_address: '',
  space_usage: '', space_length: '', space_width: '', space_height: '', capacity: '',
  ceiling_type: '', wall_material: '', can_construct: false, space_form: '', noise_factors: '',
  power_panel_location: '', outlet_count: '', voltage_capacity: '', network_info: '',
  need_power_expansion: false, av_system_needs: '', other_special_needs: '',
  no_drilling: false, special_construction_time: '', hanging_limits: '', construction_issues: '',
  existing_equipment: '', other_observations: '', client_expected_functions: '',
  preliminary_budget_range: '', need_procurement: false, travel_time_minutes: '',
  parking_location: '', distance_to_storage: '', elevator_size: '', rf_interference: '',
  ambient_noise_db: '', acoustics: '', natural_light: '', audience_factors: '', survey_notes: '',
}

type ProjectForm = {
  project_name: string
  scene_name: string
  user_type: string
  status: ProjectStatus
  start_date: string
  end_date: string
  budget: string
  description: string
  notes: string
  main_function: string
  equipment_needs: string
  interaction_needs: string
  audio_needs: string
  video_needs: string
  control_needs: string
  other_needs: string
  venue_specs: string
}

const emptyProject: ProjectForm = {
  project_name: '', scene_name: '', user_type: '', status: '規劃中',
  start_date: '', end_date: '', budget: '', description: '', notes: '',
  main_function: '', equipment_needs: '', interaction_needs: '', audio_needs: '',
  video_needs: '', control_needs: '', other_needs: '', venue_specs: '',
}

function Accordion({ title, color, defaultOpen = false, children }: {
  title: string
  color: typeof BLUE
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`rounded-xl border ${color.border} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-2.5 ${color.header} text-white text-sm font-medium`}
      >
        <span>{title}</span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && (
        <div className={`${color.light} p-4`}>
          {children}
        </div>
      )}
    </div>
  )
}

const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400'
const ta  = inp + ' resize-none'

function Field({ label, children, span2 = false }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

function BoolField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-300 text-blue-600" />
      <span className="text-sm text-gray-700">{label}</span>
    </div>
  )
}

function SurveyPanel({ projectId }: { projectId: string }) {
  const [form, setForm] = useState<SurveyForm>(emptySurvey)
  const [surveyId, setSurveyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/site-surveys?project_id=${projectId}`)
      .then(r => r.json())
      .then(d => {
        if (d.survey) {
          const s = d.survey
          setSurveyId(s.id)
          setForm({
            survey_date: s.survey_date ?? '',
            surveyor: s.surveyor ?? '',
            contact_name: s.contact_name ?? '',
            contact_phone: s.contact_phone ?? '',
            venue_address: s.venue_address ?? '',
            space_usage: s.space_usage ?? '',
            space_length: s.space_length ?? '',
            space_width: s.space_width ?? '',
            space_height: s.space_height ?? '',
            capacity: s.capacity ?? '',
            ceiling_type: s.ceiling_type ?? '',
            wall_material: s.wall_material ?? '',
            can_construct: s.can_construct ?? false,
            space_form: s.space_form ?? '',
            noise_factors: s.noise_factors ?? '',
            power_panel_location: s.power_panel_location ?? '',
            outlet_count: s.outlet_count ?? '',
            voltage_capacity: s.voltage_capacity ?? '',
            network_info: s.network_info ?? '',
            need_power_expansion: s.need_power_expansion ?? false,
            av_system_needs: s.av_system_needs ?? '',
            other_special_needs: s.other_special_needs ?? '',
            no_drilling: s.no_drilling ?? false,
            special_construction_time: s.special_construction_time ?? '',
            hanging_limits: s.hanging_limits ?? '',
            construction_issues: s.construction_issues ?? '',
            existing_equipment: s.existing_equipment ?? '',
            other_observations: s.other_observations ?? '',
            client_expected_functions: s.client_expected_functions ?? '',
            preliminary_budget_range: s.preliminary_budget_range ?? '',
            need_procurement: s.need_procurement ?? false,
            travel_time_minutes: s.travel_time_minutes ?? '',
            parking_location: s.parking_location ?? '',
            distance_to_storage: s.distance_to_storage ?? '',
            elevator_size: s.elevator_size ?? '',
            rf_interference: s.rf_interference ?? '',
            ambient_noise_db: s.ambient_noise_db ?? '',
            acoustics: s.acoustics ?? '',
            natural_light: s.natural_light ?? '',
            audience_factors: s.audience_factors ?? '',
            survey_notes: s.survey_notes ?? '',
          })
        }
        setLoaded(true)
      })
  }, [projectId])

  const set = (k: keyof SurveyForm) => (v: any) => setForm(p => ({ ...p, [k]: v }))
  const txt = (k: keyof SurveyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k)(e.target.value)

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        ...form,
        project_id: projectId,
        space_length: form.space_length ? Number(form.space_length) : null,
        space_width: form.space_width ? Number(form.space_width) : null,
        space_height: form.space_height ? Number(form.space_height) : null,
        capacity: form.capacity ? Number(form.capacity) : null,
        travel_time_minutes: form.travel_time_minutes ? Number(form.travel_time_minutes) : null,
        ambient_noise_db: form.ambient_noise_db ? Number(form.ambient_noise_db) : null,
        survey_date: form.survey_date || null,
      }
      if (surveyId) {
        await fetch('/api/site-surveys', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: surveyId, ...payload }) })
      } else {
        const res = await fetch('/api/site-surveys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const d = await res.json()
        if (d.survey?.id) setSurveyId(d.survey.id)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return <div className="py-4 text-center text-gray-400 text-sm">載入中…</div>

  return (
    <div className="space-y-3">
      <Accordion title="③ 下類 — 場勘基本資訊" color={GREEN} defaultOpen>
        <div className="grid grid-cols-2 gap-3">
          <Field label="場勘日期"><input type="date" value={form.survey_date} onChange={txt('survey_date')} className={inp} /></Field>
          <Field label="場勘負責人"><input value={form.surveyor} onChange={txt('surveyor')} className={inp} /></Field>
          <Field label="現場聯絡姓名"><input value={form.contact_name} onChange={txt('contact_name')} className={inp} /></Field>
          <Field label="現場聯絡電話"><input value={form.contact_phone} onChange={txt('contact_phone')} className={inp} /></Field>
          <Field label="場地地址" span2><input value={form.venue_address} onChange={txt('venue_address')} className={inp} /></Field>
        </div>
      </Accordion>

      <Accordion title="④ 下類 — 空間規格資訊" color={GREEN}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="空間用途" span2><input value={form.space_usage} onChange={txt('space_usage')} className={inp} /></Field>
          <Field label="長度（公尺）"><input type="number" value={form.space_length} onChange={txt('space_length')} className={inp} /></Field>
          <Field label="寬度（公尺）"><input type="number" value={form.space_width} onChange={txt('space_width')} className={inp} /></Field>
          <Field label="高度（公尺）"><input type="number" value={form.space_height} onChange={txt('space_height')} className={inp} /></Field>
          <Field label="容納人數"><input type="number" value={form.capacity} onChange={txt('capacity')} className={inp} /></Field>
          <Field label="天花板類型/材質"><input value={form.ceiling_type} onChange={txt('ceiling_type')} className={inp} /></Field>
          <Field label="牆面材質"><input value={form.wall_material} onChange={txt('wall_material')} className={inp} /></Field>
          <Field label="空間形狀"><input value={form.space_form} onChange={txt('space_form')} className={inp} /></Field>
          <div className="col-span-2"><BoolField label="是否可施工裝設" value={form.can_construct} onChange={set('can_construct')} /></div>
        </div>
      </Accordion>

      <Accordion title="⑤ 下類 — 電力與網路" color={GREEN}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="電源總箱位置說明"><input value={form.power_panel_location} onChange={txt('power_panel_location')} className={inp} /></Field>
          <Field label="現有插座數量位置"><input value={form.outlet_count} onChange={txt('outlet_count')} className={inp} /></Field>
          <Field label="電壓容量說明"><input value={form.voltage_capacity} onChange={txt('voltage_capacity')} className={inp} /></Field>
          <Field label="電源射頻干擾情況"><input value={form.rf_interference} onChange={txt('rf_interference')} className={inp} /></Field>
          <Field label="網路設備說明資訊" span2><input value={form.network_info} onChange={txt('network_info')} className={inp} /></Field>
          <div className="col-span-2"><BoolField label="是否需要擴充電源容量" value={form.need_power_expansion} onChange={set('need_power_expansion')} /></div>
        </div>
      </Accordion>

      <Accordion title="⑥ 下類 — 聲學與環境" color={GREEN}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="空間內存在噪音來源" span2><input value={form.noise_factors} onChange={txt('noise_factors')} className={inp} /></Field>
          <Field label="環境噪音（dB）"><input type="number" value={form.ambient_noise_db} onChange={txt('ambient_noise_db')} className={inp} /></Field>
          <Field label="空間聲學特性"><input value={form.acoustics} onChange={txt('acoustics')} className={inp} /></Field>
          <Field label="自然光源情況"><input value={form.natural_light} onChange={txt('natural_light')} className={inp} /></Field>
          <Field label="觀眾視角潛在因素"><input value={form.audience_factors} onChange={txt('audience_factors')} className={inp} /></Field>
        </div>
      </Accordion>

      <Accordion title="⑦ 中類 — 施工條件限制" color={ORG}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex gap-6 flex-wrap">
            <BoolField label="是否禁止鑽孔打牆壁" value={form.no_drilling} onChange={set('no_drilling')} />
            <BoolField label="是否需要採購/代購材料設備" value={form.need_procurement} onChange={set('need_procurement')} />
          </div>
          <Field label="特殊施工時間限制"><input value={form.special_construction_time} onChange={txt('special_construction_time')} className={inp} /></Field>
          <Field label="懸掛載重限制"><input value={form.hanging_limits} onChange={txt('hanging_limits')} className={inp} /></Field>
          <Field label="現場施工限制說明" span2><textarea rows={2} value={form.construction_issues} onChange={txt('construction_issues')} className={ta} /></Field>
          <Field label="搬運時間（分鐘）"><input type="number" value={form.travel_time_minutes} onChange={txt('travel_time_minutes')} className={inp} /></Field>
          <Field label="電梯尺寸規格"><input value={form.elevator_size} onChange={txt('elevator_size')} className={inp} /></Field>
          <Field label="停車場距離地點資訊"><input value={form.parking_location} onChange={txt('parking_location')} className={inp} /></Field>
          <Field label="下樓到倉庫距離長度"><input value={form.distance_to_storage} onChange={txt('distance_to_storage')} className={inp} /></Field>
        </div>
      </Accordion>

      <Accordion title="⑧ 中類 — 現況設備補充" color={ORG}>
        <div className="grid grid-cols-1 gap-3">
          <Field label="現有 AV 系統需求"><textarea rows={2} value={form.av_system_needs} onChange={txt('av_system_needs')} className={ta} /></Field>
          <Field label="現有在場設備說明"><textarea rows={2} value={form.existing_equipment} onChange={txt('existing_equipment')} className={ta} /></Field>
          <Field label="其他現場觀察記錄"><textarea rows={2} value={form.other_observations} onChange={txt('other_observations')} className={ta} /></Field>
          <Field label="客戶期望功能/期望達成目標"><textarea rows={2} value={form.client_expected_functions} onChange={txt('client_expected_functions')} className={ta} /></Field>
          <Field label="其他特殊需求說明"><textarea rows={2} value={form.other_special_needs} onChange={txt('other_special_needs')} className={ta} /></Field>
          <Field label="初步預算範圍"><input value={form.preliminary_budget_range} onChange={txt('preliminary_budget_range')} className={inp} /></Field>
        </div>
      </Accordion>

      <Accordion title="⑨ 中類 — 場勘備註" color={ORG}>
        <Field label="場勘備註內容"><textarea rows={4} value={form.survey_notes} onChange={txt('survey_notes')} className={ta} /></Field>
      </Accordion>

      <div className="flex justify-end pt-1">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm rounded-xl hover:bg-emerald-700 disabled:opacity-50">
          <Save size={14} /> {saving ? '儲存中...' : '儲存場勘'}
        </button>
      </div>
    </div>
  )
}

export default function ProjectsTab({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [expandedSurvey, setExpandedSurvey] = useState<string | null>(null)
  const [form, setForm] = useState<ProjectForm>(emptyProject)

  useEffect(() => { fetchProjects() }, [clientId])

  async function fetchProjects() {
    const { data } = await supabase.from('projects').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
    setProjects(data ?? [])
    setLoading(false)
  }

  function startEdit(p?: any) {
    if (p) {
      setForm({
        project_name: p.project_name ?? '',
        scene_name: p.scene_name ?? '',
        user_type: p.user_type ?? '',
        status: p.status ?? '規劃中',
        start_date: p.start_date ?? '',
        end_date: p.end_date ?? '',
        budget: p.budget ? String(p.budget) : '',
        description: p.description ?? '',
        notes: p.notes ?? '',
        main_function: p.main_function ?? '',
        equipment_needs: p.equipment_needs ?? '',
        interaction_needs: p.interaction_needs ?? '',
        audio_needs: p.audio_needs ?? '',
        video_needs: p.video_needs ?? '',
        control_needs: p.control_needs ?? '',
        other_needs: p.other_needs ?? '',
        venue_specs: p.venue_specs ?? '',
      })
      setEditingId(p.id)
    } else {
      setForm(emptyProject)
      setEditingId('new')
    }
  }

  async function handleSave() {
    if (!form.project_name.trim()) return
    const payload = {
      ...form,
      budget: form.budget ? Number(form.budget) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    }
    if (editingId === 'new') {
      await supabase.from('projects').insert({ ...payload, client_id: clientId })
    } else {
      await supabase.from('projects').update(payload).eq('id', editingId)
    }
    setEditingId(null)
    fetchProjects()
  }

  async function handleDelete(id: string) {
    if (!confirm('確認刪除此專案？')) return
    await supabase.from('projects').delete().eq('id', id)
    fetchProjects()
  }

  const set = (k: keyof ProjectForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">共 {projects.length} 個專案</span>
        <button onClick={() => startEdit()} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium">
          <Plus size={14} /> 新增專案
        </button>
      </div>

      {editingId !== null && (
        <div className="border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
            <span className="font-semibold text-gray-800 text-sm">{editingId === 'new' ? '新增專案' : '編輯中'}</span>
            <button onClick={() => setEditingId(null)}><X size={16} className="text-gray-400" /></button>
          </div>
          <div className="p-4 space-y-3">
            <Accordion title="① 上類 — 基本資訊" color={BLUE} defaultOpen>
              <div className="grid grid-cols-2 gap-3">
                <Field label="專案名稱 *" span2>
                  <input value={form.project_name} onChange={set('project_name')} className={inp} placeholder="例：台東延平鄉公所新建案" />
                </Field>
                <Field label="場景名稱">
                  <input value={form.scene_name} onChange={set('scene_name')} className={inp} placeholder="如：會議室、禮堂" />
                </Field>
                <Field label="使用者類型">
                  <input value={form.user_type} onChange={set('user_type')} className={inp} placeholder="例：政府機關/企業/教育" />
                </Field>
                <Field label="專案狀態">
                  <select value={form.status} onChange={set('status')} className={inp}>
                    {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="預算（NT$）">
                  <input type="number" value={form.budget} onChange={set('budget')} className={inp} />
                </Field>
                <Field label="施工日期">
                  <input type="date" value={form.start_date} onChange={set('start_date')} className={inp} />
                </Field>
                <Field label="預計完工日">
                  <input type="date" value={form.end_date} onChange={set('end_date')} className={inp} />
                </Field>
                <Field label="說明／備注" span2>
                  <textarea rows={2} value={form.description} onChange={set('description')} className={ta} />
                </Field>
              </div>
            </Accordion>

            <Accordion title="② 上類 — 需求分析" color={BLUE}>
              <div className="grid grid-cols-1 gap-3">
                <Field label="主要功能定位">
                  <input value={form.main_function} onChange={set('main_function')} className={inp} placeholder="例：多媒體簡報、活動直播、教學互動" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="設備需求"><textarea rows={2} value={form.equipment_needs} onChange={set('equipment_needs')} className={ta} /></Field>
                  <Field label="音響需求"><textarea rows={2} value={form.audio_needs} onChange={set('audio_needs')} className={ta} /></Field>
                  <Field label="影像需求"><textarea rows={2} value={form.video_needs} onChange={set('video_needs')} className={ta} /></Field>
                  <Field label="互動需求"><textarea rows={2} value={form.interaction_needs} onChange={set('interaction_needs')} className={ta} /></Field>
                  <Field label="控制需求"><textarea rows={2} value={form.control_needs} onChange={set('control_needs')} className={ta} /></Field>
                  <Field label="其他需求"><textarea rows={2} value={form.other_needs} onChange={set('other_needs')} className={ta} /></Field>
                </div>
                <Field label="場地規格">
                  <textarea rows={2} value={form.venue_specs} onChange={set('venue_specs')} className={ta} />
                </Field>
              </div>
            </Accordion>
          </div>

          <div className="px-4 py-3 border-t bg-gray-50 flex justify-end gap-2">
            <button onClick={() => setEditingId(null)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-white">取消</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">儲存專案</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">載入中...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">尚無專案紀錄</div>
      ) : (
        projects.map(p => (
          <div key={p.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <div className="flex items-center gap-2 min-w-0">
                <Briefcase size={14} className="text-gray-400 shrink-0" />
                <span className="font-semibold text-gray-900 truncate">{p.project_name}</span>
                {p.scene_name && <span className="text-xs text-gray-500 truncate">（{p.scene_name}）</span>}
                <span className={`text-xs px-2 py-0.5 rounded-lg font-medium shrink-0 ${STATUS_COLORS[p.status]}`}>{p.status}</span>
              </div>
              <div className="flex gap-1 shrink-0 ml-2">
                <button onClick={() => startEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"><Pencil size={13} /></button>
                <button onClick={() => handleDelete(p.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg"><Trash2 size={13} /></button>
              </div>
            </div>

            <div className="px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              {p.user_type && <span>類型：{p.user_type}</span>}
              {p.start_date && <span>施工：{formatDate(p.start_date)}</span>}
              {p.end_date && <span>完工：{formatDate(p.end_date)}</span>}
              {p.budget && <span>預算：NT${Number(p.budget).toLocaleString()}</span>}
              {p.main_function && <span>功能：{p.main_function}</span>}
            </div>

            <div className="border-t border-gray-50">
              <button
                onClick={() => setExpandedSurvey(expandedSurvey === p.id ? null : p.id)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs text-emerald-700 hover:bg-emerald-50 font-medium"
              >
                <span>🏗 下類場勘資料</span>
                {expandedSurvey === p.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {expandedSurvey === p.id && (
                <div className="px-4 pb-4">
                  <SurveyPanel projectId={p.id} />
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
