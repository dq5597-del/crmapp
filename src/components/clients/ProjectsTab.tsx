'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { ProjectStatus } from '@/types'
import { Plus, Pencil, Trash2, Briefcase, ChevronDown, ChevronRight, X, Camera, ImageIcon } from 'lucide-react'
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

const BLUE  = { header: 'bg-blue-600',    light: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700'    }
const GREEN = { header: 'bg-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' }
const ORG   = { header: 'bg-orange-500',  light: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700'  }

const CAT_LABELS: Record<number, string> = { 1: '施工前', 2: '施工中', 3: '完工' }
const BUCKET = 'project-photos'

type Photo = {
  id: string
  project_id: string
  category: 1 | 2 | 3
  storage_path: string
  notes: string
  created_at: string
}

type SurveyForm = {
  survey_date: string; surveyor: string; contact_name: string; contact_phone: string
  venue_address: string; space_usage: string; space_length: string; space_width: string
  space_height: string; capacity: string; ceiling_type: string; wall_material: string
  can_construct: boolean; space_form: string; noise_factors: string
  power_panel_location: string; outlet_count: string; voltage_capacity: string
  network_info: string; need_power_expansion: boolean; av_system_needs: string
  other_special_needs: string; no_drilling: boolean; special_construction_time: string
  hanging_limits: string; construction_issues: string; existing_equipment: string
  other_observations: string; client_expected_functions: string
  preliminary_budget_range: string; need_procurement: boolean; travel_time_minutes: string
  parking_location: string; distance_to_storage: string; elevator_size: string
  rf_interference: string; ambient_noise_db: string; acoustics: string
  natural_light: string; audience_factors: string; survey_notes: string
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
  project_name: string; scene_name: string; user_type: string; status: ProjectStatus
  start_date: string; end_date: string; budget: string; description: string; notes: string
  main_function: string; equipment_needs: string; interaction_needs: string; audio_needs: string
  video_needs: string; control_needs: string; other_needs: string; venue_specs: string
}

const emptyProject: ProjectForm = {
  project_name: '', scene_name: '', user_type: '', status: '規劃中',
  start_date: '', end_date: '', budget: '', description: '', notes: '',
  main_function: '', equipment_needs: '', interaction_needs: '', audio_needs: '',
  video_needs: '', control_needs: '', other_needs: '', venue_specs: '',
}

// ── Photo Section (inline, embedded in edit form) ────────────
function PhotoSection({ projectId, supabase }: {
  projectId: string
  supabase: ReturnType<typeof createClient>
}) {
  const [cat, setCat] = useState<1 | 2 | 3>(1)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({})
  const camRef  = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchPhotos() }, [projectId])

  async function fetchPhotos() {
    setLoading(true)
    const { data } = await supabase
      .from('project_photos').select('*')
      .eq('project_id', projectId)
      .order('created_at')
    const list = (data ?? []) as Photo[]
    setPhotos(list)
    const n: Record<string, string> = {}
    list.forEach(p => { n[p.id] = p.notes ?? '' })
    setLocalNotes(n)
    setLoading(false)
  }

  function getUrl(path: string) {
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  }

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
      const path = `${projectId}/${cat}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (error) throw error
      await supabase.from('project_photos').insert({
        project_id: projectId, category: cat, storage_path: path, notes: '',
      })
      await fetchPhotos()
    } catch (e: any) {
      alert('上傳失敗: ' + e.message)
    }
    setUploading(false)
  }

  async function handleDelete(photo: Photo) {
    if (!confirm('確認刪除此照片？')) return
    await supabase.storage.from(BUCKET).remove([photo.storage_path])
    await supabase.from('project_photos').delete().eq('id', photo.id)
    setPhotos(prev => prev.filter(p => p.id !== photo.id))
  }

  async function saveNotes(photoId: string) {
    await supabase.from('project_photos')
      .update({ notes: localNotes[photoId] ?? '' })
      .eq('id', photoId)
  }

  const catPhotos = photos.filter(p => p.category === cat)

  return (
    <div>
      {/* Category Tabs */}
      <div className="flex border border-gray-200 rounded-xl overflow-hidden mb-3">
        {([1, 2, 3] as const).map(c => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              cat === c
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {CAT_LABELS[c]}
            <span className="ml-1 text-xs opacity-70">
              ({photos.filter(p => p.category === c).length})
            </span>
          </button>
        ))}
      </div>

      {/* Upload Controls */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleUpload(f)
            e.target.value = ''
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleUpload(f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => camRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
        >
          <Camera size={14} /> 拍照上傳
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
        >
          <ImageIcon size={14} /> 開啟舊檔
        </button>
        {uploading && <span className="text-xs text-gray-400 animate-pulse">上傳中...</span>}
        <span className="ml-auto text-xs text-gray-400">上傳至「{CAT_LABELS[cat]}」</span>
      </div>

      {/* Photo Grid */}
      {loading ? (
        <div className="text-center py-6 text-gray-400 text-sm">載入中...</div>
      ) : catPhotos.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">
          尚無「{CAT_LABELS[cat]}」照片，點上方按鈕新增
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {catPhotos.map(photo => (
            <div key={photo.id} className="flex flex-col gap-1.5">
              <div className="relative group">
                <img
                  src={getUrl(photo.storage_path)}
                  alt={localNotes[photo.id] || '照片'}
                  className="w-full aspect-square object-cover rounded-xl border border-gray-100 bg-gray-50"
                  loading="lazy"
                />
                <button
                  type="button"
                  onClick={() => handleDelete(photo)}
                  className="absolute top-1.5 right-1.5 bg-black/50 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="刪除照片"
                >
                  <X size={11} />
                </button>
                <div className="absolute bottom-1.5 left-1.5 text-[10px] text-white bg-black/40 rounded px-1.5 py-0.5">
                  {new Date(photo.created_at).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })}
                </div>
              </div>
              {/* Notes per photo */}
              <textarea
                rows={2}
                value={localNotes[photo.id] ?? ''}
                onChange={e => setLocalNotes(prev => ({ ...prev, [photo.id]: e.target.value }))}
                onBlur={() => saveNotes(photo.id)}
                placeholder="照片備註..."
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Accordion ───────────────────────────────────────────────
function Accordion({ title, color, defaultOpen = false, children }: {
  title: string; color: typeof BLUE; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`rounded-xl border ${color.border} overflow-hidden`}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-2.5 ${color.header} text-white text-sm font-medium`}>
        <span>{title}</span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && <div className={`${color.light} p-4`}>{children}</div>}
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

// ── Main Component ───────────────────────────────────────────
export default function ProjectsTab({ clientId }: { clientId: string }) {
  const supabase = createClient()
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isNewProject, setIsNewProject] = useState(false)
  const [form, setForm] = useState<ProjectForm>(emptyProject)
  const [survey, setSurvey] = useState<SurveyForm>(emptySurvey)
  const [surveyId, setSurveyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchProjects() }, [clientId])

  async function fetchProjects() {
    const { data } = await supabase.from('projects').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
    setProjects(data ?? [])
    setLoading(false)
  }

  async function startEdit(p?: any) {
    if (p) {
      setForm({
        project_name: p.project_name ?? '', scene_name: p.scene_name ?? '',
        user_type: p.user_type ?? '', status: p.status ?? '規劃中',
        start_date: p.start_date ?? '', end_date: p.end_date ?? '',
        budget: p.budget ? String(p.budget) : '', description: p.description ?? '',
        notes: p.notes ?? '', main_function: p.main_function ?? '',
        equipment_needs: p.equipment_needs ?? '', interaction_needs: p.interaction_needs ?? '',
        audio_needs: p.audio_needs ?? '', video_needs: p.video_needs ?? '',
        control_needs: p.control_needs ?? '', other_needs: p.other_needs ?? '',
        venue_specs: p.venue_specs ?? '',
      })
      setEditingId(p.id)
      setSurvey(emptySurvey)
      setSurveyId(null)
      fetch(`/api/site-surveys?project_id=${p.id}`)
        .then(r => r.json())
        .then(d => {
          if (d.survey) {
            const s = d.survey
            setSurveyId(s.id)
            setSurvey({
              survey_date: s.survey_date ?? '', surveyor: s.surveyor ?? '',
              contact_name: s.contact_name ?? '', contact_phone: s.contact_phone ?? '',
              venue_address: s.venue_address ?? '', space_usage: s.space_usage ?? '',
              space_length: s.space_length ?? '', space_width: s.space_width ?? '',
              space_height: s.space_height ?? '', capacity: s.capacity ?? '',
              ceiling_type: s.ceiling_type ?? '', wall_material: s.wall_material ?? '',
              can_construct: s.can_construct ?? false, space_form: s.space_form ?? '',
              noise_factors: s.noise_factors ?? '', power_panel_location: s.power_panel_location ?? '',
              outlet_count: s.outlet_count ?? '', voltage_capacity: s.voltage_capacity ?? '',
              network_info: s.network_info ?? '', need_power_expansion: s.need_power_expansion ?? false,
              av_system_needs: s.av_system_needs ?? '', other_special_needs: s.other_special_needs ?? '',
              no_drilling: s.no_drilling ?? false, special_construction_time: s.special_construction_time ?? '',
              hanging_limits: s.hanging_limits ?? '', construction_issues: s.construction_issues ?? '',
              existing_equipment: s.existing_equipment ?? '', other_observations: s.other_observations ?? '',
              client_expected_functions: s.client_expected_functions ?? '',
              preliminary_budget_range: s.preliminary_budget_range ?? '',
              need_procurement: s.need_procurement ?? false, travel_time_minutes: s.travel_time_minutes ?? '',
              parking_location: s.parking_location ?? '', distance_to_storage: s.distance_to_storage ?? '',
              elevator_size: s.elevator_size ?? '', rf_interference: s.rf_interference ?? '',
              ambient_noise_db: s.ambient_noise_db ?? '', acoustics: s.acoustics ?? '',
              natural_light: s.natural_light ?? '', audience_factors: s.audience_factors ?? '',
              survey_notes: s.survey_notes ?? '',
            })
          }
        })
    } else {
      setForm(emptyProject)
      setSurvey(emptySurvey)
      setSurveyId(null)
      setIsNewProject(true)
      setEditingId(crypto.randomUUID())
    }
  }

  async function handleSave() {
    if (!form.project_name.trim()) return
    setSaving(true)
    try {
      const projectPayload = {
        ...form,
        budget: form.budget ? Number(form.budget) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      }
      if (isNewProject) {
        await supabase.from('projects').insert({ id: editingId, ...projectPayload, client_id: clientId })
        setIsNewProject(false)
      } else {
        await supabase.from('projects').update(projectPayload).eq('id', editingId)
      }
      if (editingId) {
        const surveyPayload = {
          ...survey,
          project_id: editingId,
          space_length: survey.space_length ? Number(survey.space_length) : null,
          space_width: survey.space_width ? Number(survey.space_width) : null,
          space_height: survey.space_height ? Number(survey.space_height) : null,
          capacity: survey.capacity ? Number(survey.capacity) : null,
          travel_time_minutes: survey.travel_time_minutes ? Number(survey.travel_time_minutes) : null,
          ambient_noise_db: survey.ambient_noise_db ? Number(survey.ambient_noise_db) : null,
          survey_date: survey.survey_date || null,
        }
        if (surveyId) {
          await fetch('/api/site-surveys', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: surveyId, ...surveyPayload }) })
        } else {
          await fetch('/api/site-surveys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(surveyPayload) })
        }
      }
    } finally {
      setSaving(false)
      setEditingId(null)
      fetchProjects()
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('確認刪除此專案？')) return
    await supabase.from('projects').delete().eq('id', id)
    fetchProjects()
  }

  const setP = (k: keyof ProjectForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))
  const setS = (k: keyof SurveyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setSurvey(p => ({ ...p, [k]: e.target.value }))
  const setSB = (k: keyof SurveyForm) => (v: boolean) =>
    setSurvey(p => ({ ...p, [k]: v }))

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
            <span className="font-semibold text-gray-800 text-sm">{isNewProject ? '新增專案' : '編輯專案'}</span>
            <button onClick={() => setEditingId(null)}><X size={16} className="text-gray-400" /></button>
          </div>
          <div className="p-4 space-y-3">

            <Accordion title="① 上類 — 基本資訊" color={BLUE} defaultOpen>
              <div className="grid grid-cols-2 gap-3">
                <Field label="專案名稱 *" span2>
                  <input value={form.project_name} onChange={setP('project_name')} className={inp} placeholder="例：台東延平鄉公所新建案" />
                </Field>
                <Field label="場景名稱">
                  <input value={form.scene_name} onChange={setP('scene_name')} className={inp} placeholder="如：會議室、禮堂" />
                </Field>
                <Field label="使用者類型">
                  <input value={form.user_type} onChange={setP('user_type')} className={inp} placeholder="例：政府機關/企業/教育" />
                </Field>
                <Field label="專案狀態">
                  <select value={form.status} onChange={setP('status')} className={inp}>
                    {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="預算（NT$）">
                  <input type="number" value={form.budget} onChange={setP('budget')} className={inp} />
                </Field>
                <Field label="施工日期">
                  <input type="date" value={form.start_date} onChange={setP('start_date')} className={inp} />
                </Field>
                <Field label="預計完工日">
                  <input type="date" value={form.end_date} onChange={setP('end_date')} className={inp} />
                </Field>
                <Field label="說明／備注" span2>
                  <textarea rows={2} value={form.description} onChange={setP('description')} className={ta} />
                </Field>
              </div>
            </Accordion>

            <Accordion title="② 上類 — 需求分析" color={BLUE}>
              <div className="grid grid-cols-1 gap-3">
                <Field label="主要功能定位">
                  <input value={form.main_function} onChange={setP('main_function')} className={inp} placeholder="例：多媒體簡報、活動直播、教學互動" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="設備需求"><textarea rows={2} value={form.equipment_needs} onChange={setP('equipment_needs')} className={ta} /></Field>
                  <Field label="音響需求"><textarea rows={2} value={form.audio_needs} onChange={setP('audio_needs')} className={ta} /></Field>
                  <Field label="影像需求"><textarea rows={2} value={form.video_needs} onChange={setP('video_needs')} className={ta} /></Field>
                  <Field label="互動需求"><textarea rows={2} value={form.interaction_needs} onChange={setP('interaction_needs')} className={ta} /></Field>
                  <Field label="控制需求"><textarea rows={2} value={form.control_needs} onChange={setP('control_needs')} className={ta} /></Field>
                  <Field label="其他需求"><textarea rows={2} value={form.other_needs} onChange={setP('other_needs')} className={ta} /></Field>
                </div>
                <Field label="場地規格">
                  <textarea rows={2} value={form.venue_specs} onChange={setP('venue_specs')} className={ta} />
                </Field>
              </div>
            </Accordion>

            <Accordion title="③ 下類 — 場勘基本資訊" color={GREEN}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="場勘日期"><input type="date" value={survey.survey_date} onChange={setS('survey_date')} className={inp} /></Field>
                <Field label="場勘負責人"><input value={survey.surveyor} onChange={setS('surveyor')} className={inp} /></Field>
                <Field label="現場聯絡姓名"><input value={survey.contact_name} onChange={setS('contact_name')} className={inp} /></Field>
                <Field label="現場聯絡電話"><input value={survey.contact_phone} onChange={setS('contact_phone')} className={inp} /></Field>
                <Field label="場地地址" span2><input value={survey.venue_address} onChange={setS('venue_address')} className={inp} /></Field>
              </div>
            </Accordion>

            <Accordion title="④ 下類 — 空間規格資訊" color={GREEN}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="空間用途" span2><input value={survey.space_usage} onChange={setS('space_usage')} className={inp} /></Field>
                <Field label="長度（公尺）"><input type="number" value={survey.space_length} onChange={setS('space_length')} className={inp} /></Field>
                <Field label="寬度（公尺）"><input type="number" value={survey.space_width} onChange={setS('space_width')} className={inp} /></Field>
                <Field label="高度（公尺）"><input type="number" value={survey.space_height} onChange={setS('space_height')} className={inp} /></Field>
                <Field label="容納人數"><input type="number" value={survey.capacity} onChange={setS('capacity')} className={inp} /></Field>
                <Field label="天花板類型/材質"><input value={survey.ceiling_type} onChange={setS('ceiling_type')} className={inp} /></Field>
                <Field label="牆面材質"><input value={survey.wall_material} onChange={setS('wall_material')} className={inp} /></Field>
                <Field label="空間形狀"><input value={survey.space_form} onChange={setS('space_form')} className={inp} /></Field>
                <div className="col-span-2"><BoolField label="是否可施工裝設" value={survey.can_construct} onChange={setSB('can_construct')} /></div>
              </div>
            </Accordion>

            <Accordion title="⑤ 下類 — 電力與網路" color={GREEN}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="電源總笱位置說明"><input value={survey.power_panel_location} onChange={setS('power_panel_location')} className={inp} /></Field>
                <Field label="現有插座數量位置"><input value={survey.outlet_count} onChange={setS('outlet_count')} className={inp} /></Field>
                <Field label="電壓容量說明"><input value={survey.voltage_capacity} onChange={setS('voltage_capacity')} className={inp} /></Field>
                <Field label="電源射頻干擾情況"><input value={survey.rf_interference} onChange={setS('rf_interference')} className={inp} /></Field>
                <Field label="網路設備說明資訊" span2><input value={survey.network_info} onChange={setS('network_info')} className={inp} /></Field>
                <div className="col-span-2"><BoolField label="是否需要擴充電源容量" value={survey.need_power_expansion} onChange={setSB('need_power_expansion')} /></div>
              </div>
            </Accordion>

            <Accordion title="⑥ 下類 — 聲學與環境" color={GREEN}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="空間內存在噪音來源" span2><input value={survey.noise_factors} onChange={setS('noise_factors')} className={inp} /></Field>
                <Field label="環境噪音（dB）"><input type="number" value={survey.ambient_noise_db} onChange={setS('ambient_noise_db')} className={inp} /></Field>
                <Field label="空間聲學特性"><input value={survey.acoustics} onChange={setS('acoustics')} className={inp} /></Field>
                <Field label="自然光源情況"><input value={survey.natural_light} onChange={setS('natural_light')} className={inp} /></Field>
                <Field label="觀眾視角潛在因素"><input value={survey.audience_factors} onChange={setS('audience_factors')} className={inp} /></Field>
              </div>
            </Accordion>

            <Accordion title="⑦ 中類 — 施工條件限制" color={ORG}>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex gap-6 flex-wrap">
                  <BoolField label="是否禁止酷孔打牆壁" value={survey.no_drilling} onChange={setSB('no_drilling')} />
                  <BoolField label="是否需要採購/代購材料設備" value={survey.need_procurement} onChange={setSB('need_procurement')} />
                </div>
                <Field label="特殊施工時間限制"><input value={survey.special_construction_time} onChange={setS('special_construction_time')} className={inp} /></Field>
                <Field label="懸挂載重限制"><input value={survey.hanging_limits} onChange={setS('hanging_limits')} className={inp} /></Field>
                <Field label="現場施工限制說明" span2><textarea rows={2} value={survey.construction_issues} onChange={setS('construction_issues')} className={ta} /></Field>
                <Field label="搜運時間（分鐘）"><input type="number" value={survey.travel_time_minutes} onChange={setS('travel_time_minutes')} className={inp} /></Field>
                <Field label="電梯尺寸規格"><input value={survey.elevator_size} onChange={setS('elevator_size')} className={inp} /></Field>
                <Field label="停車場距離地點資訊"><input value={survey.parking_location} onChange={setS('parking_location')} className={inp} /></Field>
                <Field label="下樓到倉庫距離長度"><input value={survey.distance_to_storage} onChange={setS('distance_to_storage')} className={inp} /></Field>
              </div>
            </Accordion>

            <Accordion title="⑧ 中類 — 現況設備補充" color={ORG}>
              <div className="grid grid-cols-1 gap-3">
                <Field label="現有 AV 系統需求"><textarea rows={2} value={survey.av_system_needs} onChange={setS('av_system_needs')} className={ta} /></Field>
                <Field label="現有在場設備說明"><textarea rows={2} value={survey.existing_equipment} onChange={setS('existing_equipment')} className={ta} /></Field>
                <Field label="其他現場觀察記錄"><textarea rows={2} value={survey.other_observations} onChange={setS('other_observations')} className={ta} /></Field>
                <Field label="客戶期望功能/期望達成目標"><textarea rows={2} value={survey.client_expected_functions} onChange={setS('client_expected_functions')} className={ta} /></Field>
                <Field label="其他特殊需求說明"><textarea rows={2} value={survey.other_special_needs} onChange={setS('other_special_needs')} className={ta} /></Field>
                <Field label="初步預算範圍"><input value={survey.preliminary_budget_range} onChange={setS('preliminary_budget_range')} className={inp} /></Field>
              </div>
            </Accordion>

            <Accordion title="⑨ 中類 — 場勘備註" color={ORG}>
              <Field label="場勘備註內容">
                <textarea rows={4} value={survey.survey_notes} onChange={setS('survey_notes')} className={ta} />
              </Field>
            </Accordion>

            <Accordion title="📷 照片紀錄（施工前／施工中／完工）" color={BLUE}>
              <PhotoSection projectId={editingId as string} supabase={supabase} />
            </Accordion>

          </div>

          <div className="px-4 py-3 border-t bg-gray-50 flex justify-end gap-2">
            <button onClick={() => setEditingId(null)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-white">取消</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? '儲存中...' : '儲存專案'}
            </button>
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
          </div>
        ))
      )}

    </div>
  )
}
