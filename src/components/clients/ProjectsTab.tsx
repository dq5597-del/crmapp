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

const BLUE   = { header: 'bg-blue-600',    light: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700'    }
const GREEN  = { header: 'bg-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' }
const ORG    = { header: 'bg-orange-500',  light: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700'  }
const PURPLE = { header: 'bg-purple-600',  light: 'bg-purple-50',  border: 'border-purple-200',  text: 'text-purple-700'  }

const BUCKET = 'project-photos'

type PhotoCat = { value: number; label: string }
const CATS_MAIN:  PhotoCat[] = [{ value: 1, label: '施工前' }, { value: 2, label: '施工中' }, { value: 3, label: '完工' }]
const CATS_SPACE: PhotoCat[] = [{ value: 4, label: '空間照片' }]
const CATS_POWER: PhotoCat[] = [{ value: 5, label: '電力照片' }]
const CATS_ACOU:  PhotoCat[] = [{ value: 6, label: '環境照片' }]
const CATS_CONS:  PhotoCat[] = [{ value: 7, label: '施工照片' }]
const CATS_CTRL:  PhotoCat[] = [{ value: 8, label: '舊有設備' }, { value: 9, label: '新設設備' }]
const CATS_RACK:  PhotoCat[] = [{ value: 10, label: '舊有設備' }, { value: 11, label: '新設設備' }]
const CATS_SITE:  PhotoCat[] = [{ value: 12, label: '舊有設備' }, { value: 13, label: '新設設備' }]

type Photo = {
  id: string
  project_id: string
  category: number
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
function PhotoSection({ projectId, supabase, cats, onBeforeUpload }: {
  projectId: string
  supabase: ReturnType<typeof createClient>
  cats: PhotoCat[]
  onBeforeUpload?: () => Promise<boolean>
}) {
  const [catIdx, setCatIdx] = useState(0)
  const cat = cats[catIdx]?.value ?? cats[0].value
  const catLabel = cats[catIdx]?.label ?? cats[0].label
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({})
  const camRef  = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchPhotos() }, [projectId])

  async function fetchPhotos() {
    setLoading(true)
    const catValues = cats.map(c => c.value)
    const { data } = await supabase
      .from('project_photos').select('*')
      .eq('project_id', projectId)
      .in('category', catValues)
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
    if (onBeforeUpload && !(await onBeforeUpload())) return
    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
      const path = `${projectId}/${cat}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (error) throw error
      const { error: dbErr } = await supabase.from('project_photos').insert({
        project_id: projectId, category: cat, storage_path: path, notes: '',
      })
      if (dbErr) throw dbErr
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
      {/* Category Tabs — only when multiple cats */}
      {cats.length > 1 && (
        <div className="flex border border-gray-200 rounded-xl overflow-hidden mb-3">
          {cats.map((c, i) => (
            <button key={c.value} type="button" onClick={() => setCatIdx(i)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                catIdx === i ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>
              {c.label}
              <span className="ml-1 text-xs opacity-70">({photos.filter(p => p.category === c.value).length})</span>
            </button>
          ))}
        </div>
      )}

      {/* Upload Controls */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
        <button type="button" onClick={() => camRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-60 transition-colors">
          <Camera size={14} /> 拍照上傳
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors">
          <ImageIcon size={14} /> 開啟舊檔
        </button>
        {uploading && <span className="text-xs text-gray-400 animate-pulse">上傳中...</span>}
        <span className="ml-auto text-xs text-gray-400">上傳至「{catLabel}」</span>
      </div>

      {/* Photo Grid */}
      {loading ? (
        <div className="text-center py-6 text-gray-400 text-sm">載入中...</div>
      ) : catPhotos.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">
          尚無「{catLabel}」照片，點上方按鈕新增
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {catPhotos.map(photo => (
            <div key={photo.id} className="flex flex-col gap-1.5">
              <div className="relative group">
                <img src={getUrl(photo.storage_path)} alt={localNotes[photo.id] || '照片'}
                  className="w-full aspect-square object-cover rounded-xl border border-gray-100 bg-gray-50" loading="lazy" />
                <button type="button" onClick={() => handleDelete(photo)}
                  className="absolute top-1.5 right-1.5 bg-black/50 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="刪除照片">
                  <X size={11} />
                </button>
                <div className="absolute bottom-1.5 left-1.5 text-[10px] text-white bg-black/40 rounded px-1.5 py-0.5">
                  {new Date(photo.created_at).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })}
                </div>
              </div>
              <textarea rows={2} value={localNotes[photo.id] ?? ''}
                onChange={e => setLocalNotes(prev => ({ ...prev, [photo.id]: e.target.value }))}
                onBlur={() => saveNotes(photo.id)} placeholder="照片備註..."
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Equipment Map (現場設備標示圖) ─────────────────────────────
const EQUIP_TYPES = [
  { key: 'network', label: '網路設備', color: '#ef4444' },
  { key: 'info',    label: '資訊設備', color: '#f97316' },
  { key: 'audio',   label: '音響設備', color: '#eab308' },
  { key: 'video',   label: '影像設備', color: '#22c55e' },
  { key: 'env',     label: '環控設備', color: '#3b82f6' },
  { key: 'phone',   label: '電話設備', color: '#6366f1' },
  { key: 'aircon',  label: '空調設備', color: '#a855f7' },
] as const

type EquipMarker = {
  id: string; project_id: string; product_id: string | null
  equipment_type: string; label: string; x_pct: number; y_pct: number
  notes: string; created_at: string
}
type SimpleProd = { id: string; product_name: string; brand: string | null; model: string | null }

function EquipmentMapSection({ projectId, supabase, initLength, initWidth, onBeforeUpload }: {
  projectId: string
  supabase: ReturnType<typeof createClient>
  initLength: string
  initWidth: string
  onBeforeUpload?: () => Promise<boolean>
}) {
  const [roomL, setRoomL] = useState(Number(initLength) || 10)
  const [roomW, setRoomW] = useState(Number(initWidth) || 8)
  const [markers, setMarkers] = useState<EquipMarker[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [selType, setSelType] = useState<string>(EQUIP_TYPES[0].key)
  const [products, setProducts] = useState<SimpleProd[]>([])
  const [selProductId, setSelProductId] = useState<string | null>(null)
  const [prodSearch, setProdSearch] = useState('')
  const [showDD, setShowDD] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [placing, setPlacing] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragOffset = useRef({ dx: 0, dy: 0 })
  const didDrag = useRef(false)

  useEffect(() => { fetchMarkers(); fetchProducts() }, [projectId])
  useEffect(() => { if (Number(initLength) > 0) setRoomL(Number(initLength)) }, [initLength])
  useEffect(() => { if (Number(initWidth) > 0) setRoomW(Number(initWidth)) }, [initWidth])

  async function fetchMarkers() {
    const { data } = await supabase.from('project_equipment_markers')
      .select('*').eq('project_id', projectId).order('created_at')
    setMarkers((data ?? []) as EquipMarker[])
  }

  async function fetchProducts() {
    const { data } = await supabase.from('products')
      .select('id, product_name, brand, model').eq('is_active', true).order('product_name')
    setProducts((data ?? []) as SimpleProd[])
  }

  const selectedProduct = products.find(p => p.id === selProductId)

  function getSvgPt(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    return pt.matrixTransform(svg.getScreenCTM()!.inverse())
  }

  function handleMarkerMouseDown(e: React.MouseEvent<SVGGElement>, m: EquipMarker) {
    e.stopPropagation()
    if (!svgRef.current) return
    const svgPt = getSvgPt(e as unknown as React.MouseEvent<SVGSVGElement>)
    const mx = (m.x_pct / 100) * roomL
    const my = (m.y_pct / 100) * roomW
    dragOffset.current = { dx: svgPt.x - mx, dy: svgPt.y - my }
    didDrag.current = false
    setDraggingId(m.id)
    setSelId(m.id)
  }

  function handleSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!draggingId || !svgRef.current) return
    const svgPt = getSvgPt(e)
    const newX = Math.max(1, Math.min(99, ((svgPt.x - dragOffset.current.dx) / roomL) * 100))
    const newY = Math.max(1, Math.min(99, ((svgPt.y - dragOffset.current.dy) / roomW) * 100))
    didDrag.current = true
    setMarkers(prev => prev.map(m => m.id === draggingId ? { ...m, x_pct: newX, y_pct: newY } : m))
  }

  async function handleSvgMouseUp() {
    if (!draggingId) return
    const id = draggingId
    setDraggingId(null)
    if (!didDrag.current) return
    const marker = markers.find(m => m.id === id)
    if (!marker) return
    await supabase.from('project_equipment_markers')
      .update({ x_pct: marker.x_pct, y_pct: marker.y_pct })
      .eq('id', id)
  }

  async function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (didDrag.current) { didDrag.current = false; return }
    if (!svgRef.current) return
    if ((e.target as Element).closest('.marker-g')) return
    if (onBeforeUpload && !(await onBeforeUpload())) return
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    const xPct = Math.max(1, Math.min(99, (svgPt.x / roomL) * 100))
    const yPct = Math.max(1, Math.min(99, (svgPt.y / roomW) * 100))
    setPlacing(true)
    const label = (selectedProduct?.product_name ?? customLabel).trim()
      || (EQUIP_TYPES.find(t => t.key === selType)?.label ?? selType)
    const { data, error } = await supabase.from('project_equipment_markers').insert({
      project_id: projectId, product_id: selProductId,
      equipment_type: selType, label, x_pct: xPct, y_pct: yPct, notes: '',
    }).select().single()
    if (error) alert('新增標記失敗: ' + error.message)
    else setMarkers(prev => [...prev, data as EquipMarker])
    setPlacing(false)
  }

  async function handleDeleteMarker(id: string) {
    await supabase.from('project_equipment_markers').delete().eq('id', id)
    setMarkers(prev => prev.filter(m => m.id !== id))
    setSelId(null)
  }

  const filteredProds = products.filter(p =>
    !prodSearch || p.product_name.toLowerCase().includes(prodSearch.toLowerCase()) ||
    (p.brand ?? '').toLowerCase().includes(prodSearch.toLowerCase())
  )

  const gridX = Array.from({ length: Math.floor(roomL) - 1 }, (_, i) => i + 1)
  const gridY = Array.from({ length: Math.floor(roomW) - 1 }, (_, i) => i + 1)
  const r = Math.min(roomL, roomW) * 0.045

  return (
    <div className="space-y-3">
      {/* Room dimensions */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">房間尺寸</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">長</span>
          <input type="number" min={1} max={200} step={0.5} value={roomL}
            onChange={e => setRoomL(Number(e.target.value) || 10)}
            className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <span className="text-xs text-gray-400">m</span>
        </div>
        <span className="text-gray-300">×</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">寬</span>
          <input type="number" min={1} max={200} step={0.5} value={roomW}
            onChange={e => setRoomW(Number(e.target.value) || 8)}
            className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <span className="text-xs text-gray-400">m</span>
        </div>
        <span className="text-xs text-gray-400">（自動從④場勘帶入，可手動覆蓋）</span>
      </div>

      {/* Equipment type selector */}
      <div>
        <p className="text-xs text-gray-500 mb-1.5">選擇設備類型，再點擊地圖放置標記</p>
        <div className="flex flex-wrap gap-1.5">
          {EQUIP_TYPES.map(t => (
            <button key={t.key} type="button" onClick={() => setSelType(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${
                selType === t.key ? 'text-white shadow-sm scale-105' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
              style={selType === t.key ? { backgroundColor: t.color, borderColor: t.color } : {}}>
              <span className="w-2 h-2 rounded-full inline-block flex-shrink-0"
                style={{ backgroundColor: t.color }} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product selector + custom label */}
      <div className="flex gap-3 flex-wrap items-start">
        <div className="relative flex-1 min-w-[180px]">
          <label className="text-xs text-gray-500 mb-1 block">產品（從資料庫搜尋）</label>
          <input
            value={selProductId ? (selectedProduct?.product_name ?? '') : prodSearch}
            onChange={e => { setProdSearch(e.target.value); setSelProductId(null); setShowDD(true) }}
            onFocus={() => setShowDD(true)}
            onBlur={() => setTimeout(() => setShowDD(false), 150)}
            placeholder="搜尋產品名稱..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 pr-7" />
          {selProductId && (
            <button type="button" onClick={() => { setSelProductId(null); setProdSearch('') }}
              className="absolute right-2 top-[30px] text-gray-400 hover:text-gray-600"><X size={13} /></button>
          )}
          {showDD && !selProductId && filteredProds.length > 0 && (
            <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
              {filteredProds.slice(0, 20).map(p => (
                <button key={p.id} type="button"
                  onMouseDown={() => { setSelProductId(p.id); setProdSearch(''); setShowDD(false) }}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm">
                  <span className="font-medium text-gray-900">{p.product_name}</span>
                  {p.brand && <span className="text-xs text-gray-400 ml-2">{p.brand} {p.model}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-[130px]">
          <label className="text-xs text-gray-500 mb-1 block">或自訂標籤</label>
          <input value={customLabel} onChange={e => setCustomLabel(e.target.value)}
            disabled={!!selProductId}
            placeholder={selProductId ? '使用產品名稱' : '自訂...'}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400" />
        </div>
      </div>

      {/* SVG floor plan */}
      <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-slate-50 relative">
        {placing && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10 pointer-events-none">
            <span className="text-xs text-gray-500">放置中...</span>
          </div>
        )}
        <svg ref={svgRef} onClick={handleSvgClick}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
          viewBox={`0 0 ${roomL} ${roomW}`}
          className="w-full select-none block"
          style={{ maxHeight: '60vh', cursor: draggingId ? 'grabbing' : 'crosshair' }}>

          {/* Background */}
          <rect x={0} y={0} width={roomL} height={roomW} fill="#f8fafc" />

          {/* Grid lines (1m) */}
          {gridX.map(x => (
            <line key={`gx${x}`} x1={x} y1={0} x2={x} y2={roomW}
              stroke="#e2e8f0" strokeWidth={roomL * 0.003} />
          ))}
          {gridY.map(y => (
            <line key={`gy${y}`} x1={0} y1={y} x2={roomL} y2={y}
              stroke="#e2e8f0" strokeWidth={roomL * 0.003} />
          ))}

          {/* Room border */}
          <rect x={0} y={0} width={roomL} height={roomW} fill="none"
            stroke="#94a3b8" strokeWidth={roomL * 0.008} />

          {/* Corner dimension labels inside */}
          <text x={roomL * 0.5} y={roomW * 0.04 + r * 0.5}
            textAnchor="middle" fontSize={r * 0.85} fill="#94a3b8" fontFamily="system-ui">
            {roomL}m
          </text>
          <text x={r * 0.6} y={roomW * 0.5}
            textAnchor="middle" fontSize={r * 0.85} fill="#94a3b8" fontFamily="system-ui"
            transform={`rotate(-90, ${r * 0.6}, ${roomW * 0.5})`}>
            {roomW}m
          </text>

          {/* Markers */}
          {markers.map(m => {
            const mx = (m.x_pct / 100) * roomL
            const my = (m.y_pct / 100) * roomW
            const col = EQUIP_TYPES.find(t => t.key === m.equipment_type)?.color ?? '#6b7280'
            const isSel = selId === m.id
            return (
              <g key={m.id} className="marker-g"
                onMouseDown={e => handleMarkerMouseDown(e, m)}
                onClick={e => { e.stopPropagation(); if (!didDrag.current) setSelId(isSel ? null : m.id) }}
                style={{ cursor: draggingId === m.id ? 'grabbing' : 'grab' }}>
                {/* Label */}
                <text x={mx} y={my - r - roomL * 0.005}
                  textAnchor="middle" fontSize={r * 0.85} fill="#1e293b"
                  fontWeight="600" fontFamily="system-ui"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {m.label}
                </text>
                {/* Circle */}
                <circle cx={mx} cy={my} r={r} fill={col}
                  stroke={isSel ? '#1e293b' : 'white'}
                  strokeWidth={isSel ? r * 0.25 : r * 0.12}
                  opacity={0.92} />
                {/* Delete button (when selected) */}
                {isSel && (
                  <g onClick={e => { e.stopPropagation(); handleDeleteMarker(m.id) }}
                    style={{ cursor: 'pointer' }}>
                    <circle cx={mx + r * 0.85} cy={my - r * 0.85} r={r * 0.5}
                      fill="#ef4444" />
                    <text x={mx + r * 0.85} y={my - r * 0.85 + r * 0.22}
                      textAnchor="middle" fontSize={r * 0.75} fill="white" fontWeight="bold"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>×</text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>

        {markers.length === 0 && (
          <div className="absolute bottom-3 inset-x-0 flex justify-center pointer-events-none">
            <span className="text-xs text-gray-400 bg-white/80 px-3 py-1 rounded-full">
              點擊地圖任意位置放置設備標記
            </span>
          </div>
        )}
      </div>

      {/* Legend + count */}
      <div className="flex items-start gap-x-4 gap-y-1.5 flex-wrap">
        {EQUIP_TYPES.map(t => (
          <div key={t.key} className="flex items-center gap-1 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
              style={{ backgroundColor: t.color }} />
            {t.label}
          </div>
        ))}
        {markers.length > 0 && (
          <span className="text-xs text-gray-400 ml-auto">
            共 {markers.length} 個標記・拖拉可移動・點選後可刪除
          </span>
        )}
      </div>
    </div>
  )
}

// ── Equipment Photo Section (控制台/機櫃/現場設備) ─────────────
const EQUIP_SUBS = [
  { key: 'ctrl', label: '控制台',   cats: CATS_CTRL },
  { key: 'rack', label: '機櫃設備', cats: CATS_RACK },
  { key: 'site', label: '現場設備', cats: CATS_SITE },
] as const

function EquipmentSection({ projectId, supabase, onBeforeUpload }: {
  projectId: string
  supabase: ReturnType<typeof createClient>
  onBeforeUpload?: () => Promise<boolean>
}) {
  const [subIdx, setSubIdx] = useState(0)
  const sub = EQUIP_SUBS[subIdx]
  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {EQUIP_SUBS.map((s, i) => (
          <button key={s.key} type="button" onClick={() => setSubIdx(i)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              subIdx === i ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {s.label}
          </button>
        ))}
      </div>
      <PhotoSection key={sub.key} projectId={projectId} supabase={supabase} cats={sub.cats} onBeforeUpload={onBeforeUpload} />
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

  async function ensureSaved(): Promise<boolean> {
    if (!isNewProject) return true
    const name = form.project_name.trim()
    if (!name) {
      alert('請先填寫「專案名稱」再上傳照片')
      return false
    }
    const payload = {
      ...form,
      id: editingId,
      client_id: clientId,
      budget: form.budget ? Number(form.budget) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    }
    const { error } = await supabase.from('projects').insert(payload)
    if (error) { alert('建立專案失敗: ' + error.message); return false }
    setIsNewProject(false)
    fetchProjects()
    return true
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
                <Field label="