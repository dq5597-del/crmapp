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
  equipment_type: string; label: string
  x_pct: number; y_pct: number
  x2_pct: number | null; y2_pct: number | null
  w_pct: number | null; h_pct: number | null
  shape_type: 'circle' | 'rect' | 'line' | 'arrow'
  notes: string; created_at: string
}
type SimpleProd = { id: string; product_name: string; brand: string | null; model: string | null }
type DragMode = 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | 'p1' | 'p2'
type DrawTool = 'circle' | 'rect' | 'line' | 'arrow'
const DRAW_TOOLS: { key: DrawTool; label: string; hint: string }[] = [
  { key: 'circle', label: '⬤ 圓點', hint: '點擊放置圓點標記' },
  { key: 'rect',   label: '▬ 矩形', hint: '拖拉繪製矩形/長條形' },
  { key: 'line',   label: '— 線段', hint: '拖拉繪製線段' },
  { key: 'arrow',  label: '→ 箭頭', hint: '拖拉繪製箭頭' },
]

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
  const [drawTool, setDrawTool] = useState<DrawTool>('circle')
  const [previewShape, setPreviewShape] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)
  const draggingIdRef = useRef<string | null>(null)
  const dragModeRef = useRef<DragMode>('move')
  const dragOffsetRef = useRef({ dx: 0, dy: 0 })
  const draggingPosRef = useRef<Partial<EquipMarker>>({})
  const didDragRef = useRef(false)
  const drawStartRef = useRef<{ x: number; y: number } | null>(null)

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

  function getSvgPt(e: React.MouseEvent) {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    return pt.matrixTransform(svg.getScreenCTM()!.inverse())
  }

  function handleMarkerMouseDown(e: React.MouseEvent, m: EquipMarker, mode: DragMode = 'move') {
    e.stopPropagation()
    if (!svgRef.current) return
    const svgPt = getSvgPt(e)
    draggingIdRef.current = m.id
    dragModeRef.current = mode
    didDragRef.current = false
    draggingPosRef.current = { ...m }
    setDraggingId(m.id)
    setSelId(m.id)
    if (mode === 'move') {
      dragOffsetRef.current = {
        dx: svgPt.x - (m.x_pct / 100) * roomL,
        dy: svgPt.y - (m.y_pct / 100) * roomW,
      }
    } else {
      dragOffsetRef.current = { dx: 0, dy: 0 }
    }
  }

  function handleSvgMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if ((e.target as Element).closest('.marker-g')) return
    if (drawTool === 'circle') return
    if (!svgRef.current) return
    const svgPt = getSvgPt(e)
    drawStartRef.current = { x: svgPt.x, y: svgPt.y }
    setPreviewShape({ x1: svgPt.x, y1: svgPt.y, x2: svgPt.x, y2: svgPt.y })
  }

  function handleSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return
    const svgPt = getSvgPt(e)

    if (draggingIdRef.current) {
      didDragRef.current = true
      const mode = dragModeRef.current
      const pos = { ...draggingPosRef.current }
      const pX = (svgPt.x / roomL) * 100
      const pY = (svgPt.y / roomW) * 100

      if (mode === 'move') {
        pos.x_pct = Math.max(0, Math.min(100, (svgPt.x - dragOffsetRef.current.dx) / roomL * 100))
        pos.y_pct = Math.max(0, Math.min(100, (svgPt.y - dragOffsetRef.current.dy) / roomW * 100))
      } else if (mode === 'p1') {
        pos.x_pct = Math.max(0, Math.min(100, pX))
        pos.y_pct = Math.max(0, Math.min(100, pY))
      } else if (mode === 'p2') {
        pos.x2_pct = Math.max(0, Math.min(100, pX))
        pos.y2_pct = Math.max(0, Math.min(100, pY))
      } else if (mode === 'resize-tl') {
        const rX = pos.x_pct! + (pos.w_pct ?? 10)
        const rY = pos.y_pct! + (pos.h_pct ?? 10)
        pos.x_pct = Math.min(pX, rX - 2); pos.y_pct = Math.min(pY, rY - 2)
        pos.w_pct = Math.max(2, rX - pX);  pos.h_pct = Math.max(2, rY - pY)
      } else if (mode === 'resize-tr') {
        const rY = pos.y_pct! + (pos.h_pct ?? 10)
        pos.y_pct = Math.min(pY, rY - 2)
        pos.w_pct = Math.max(2, pX - pos.x_pct!); pos.h_pct = Math.max(2, rY - pY)
      } else if (mode === 'resize-bl') {
        const rX = pos.x_pct! + (pos.w_pct ?? 10)
        pos.x_pct = Math.min(pX, rX - 2)
        pos.w_pct = Math.max(2, rX - pX); pos.h_pct = Math.max(2, pY - pos.y_pct!)
      } else if (mode === 'resize-br') {
        pos.w_pct = Math.max(2, pX - pos.x_pct!); pos.h_pct = Math.max(2, pY - pos.y_pct!)
      }

      draggingPosRef.current = pos
      setMarkers(prev => prev.map(mk => mk.id === draggingIdRef.current ? { ...mk, ...pos } as EquipMarker : mk))
      return
    }

    if (drawStartRef.current) {
      setPreviewShape({ x1: drawStartRef.current.x, y1: drawStartRef.current.y, x2: svgPt.x, y2: svgPt.y })
    }
  }

  async function handleSvgMouseUp() {
    if (draggingIdRef.current) {
      const id = draggingIdRef.current
      draggingIdRef.current = null
      setDraggingId(null)
      if (!didDragRef.current) return
      const pos = draggingPosRef.current
      await supabase.from('project_equipment_markers')
        .update({ x_pct: pos.x_pct, y_pct: pos.y_pct,
          x2_pct: pos.x2_pct ?? null, y2_pct: pos.y2_pct ?? null,
          w_pct: pos.w_pct ?? null, h_pct: pos.h_pct ?? null })
        .eq('id', id)
      return
    }

    if (drawStartRef.current && previewShape) {
      const { x1, y1, x2, y2 } = previewShape
      if (Math.abs(x2 - x1) < roomL * 0.015 && Math.abs(y2 - y1) < roomW * 0.015) {
        drawStartRef.current = null; setPreviewShape(null); return
      }
      if (onBeforeUpload && !(await onBeforeUpload())) {
        drawStartRef.current = null; setPreviewShape(null); return
      }
      setPlacing(true)
      const label = (selectedProduct?.product_name ?? customLabel).trim()
        || (EQUIP_TYPES.find(t => t.key === selType)?.label ?? selType)
      const ins: Record<string, unknown> = {
        project_id: projectId, product_id: selProductId,
        equipment_type: selType, label, shape_type: drawTool, notes: '',
      }
      if (drawTool === 'rect') {
        ins.x_pct = (Math.min(x1, x2) / roomL) * 100; ins.y_pct = (Math.min(y1, y2) / roomW) * 100
        ins.w_pct = (Math.abs(x2 - x1) / roomL) * 100; ins.h_pct = (Math.abs(y2 - y1) / roomW) * 100
      } else {
        ins.x_pct = (x1 / roomL) * 100; ins.y_pct = (y1 / roomW) * 100
        ins.x2_pct = (x2 / roomL) * 100; ins.y2_pct = (y2 / roomW) * 100
      }
      const { data, error } = await supabase.from('project_equipment_markers').insert(ins).select().single()
      if (error) alert('新增失敗: ' + error.message)
      else setMarkers(prev => [...prev, data as EquipMarker])
      setPlacing(false)
    }
    drawStartRef.current = null
    setPreviewShape(null)
  }

  async function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (drawTool !== 'circle') return
    if (didDragRef.current) { didDragRef.current = false; return }
    if ((e.target as Element).closest('.marker-g')) return
    if (onBeforeUpload && !(await onBeforeUpload())) return
    const svgPt = getSvgPt(e)
    const xPct = Math.max(1, Math.min(99, (svgPt.x / roomL) * 100))
    const yPct = Math.max(1, Math.min(99, (svgPt.y / roomW) * 100))
    setPlacing(true)
    const label = (selectedProduct?.product_name ?? customLabel).trim()
      || (EQUIP_TYPES.find(t => t.key === selType)?.label ?? selType)
    const { data, error } = await supabase.from('project_equipment_markers').insert({
      project_id: projectId, product_id: selProductId,
      equipment_type: selType, label, shape_type: 'circle',
      x_pct: xPct, y_pct: yPct, notes: '',
    }).select().single()
    if (error) alert('新增標記失敗: ' + error.message)
    else setMarkers(prev => [...prev, data as EquipMarker])
    setPlacing(false)
  }

  async function handleDeleteMarker(id: string) {
    await supabase.from('project_equipment_markers').delete().eq('id', id)
    setMarkers(prev => prev.filter(mk => mk.id !== id))
    setSelId(null)
  }

  const filteredProds = products.filter(p =>
    !prodSearch || p.product_name.toLowerCase().includes(prodSearch.toLowerCase()) ||
    (p.brand ?? '').toLowerCase().includes(prodSearch.toLowerCase())
  )

  const gridX = Array.from({ length: Math.floor(roomL) - 1 }, (_, i) => i + 1)
  const gridY = Array.from({ length: Math.floor(roomW) - 1 }, (_, i) => i + 1)
  const r = Math.min(roomL, roomW) * 0.045
  const lineW = Math.min(roomL, roomW) * 0.006
  const hR = r * 0.42
  const curSelColor = EQUIP_TYPES.find(t => t.key === selType)?.color ?? '#6b7280'

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

      {/* Draw tool selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500 font-medium shrink-0">繪圖工具</span>
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
          {DRAW_TOOLS.map(dt => (
            <button key={dt.key} type="button" onClick={() => setDrawTool(dt.key)} title={dt.hint}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                drawTool === dt.key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {dt.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{DRAW_TOOLS.find(dt => dt.key === drawTool)?.hint}</span>
      </div>

      {/* Equipment type selector */}
      <div>
        <p className="text-xs text-gray-500 mb-1.5">設備類型（決定顏色）</p>
        <div className="flex flex-wrap gap-1.5">
          {EQUIP_TYPES.map(et => (
            <button key={et.key} type="button" onClick={() => setSelType(et.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${
                selType === et.key ? 'text-white shadow-sm scale-105' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
              style={selType === et.key ? { backgroundColor: et.color, borderColor: et.color } : {}}>
              <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: et.color }} />
              {et.label}
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
        <svg ref={svgRef}
          onClick={handleSvgClick}
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
          viewBox={`0 0 ${roomL} ${roomW}`}
          className="w-full select-none block"
          style={{ maxHeight: '60vh', cursor: draggingId ? 'grabbing' : 'crosshair' }}>

          <defs>
            {EQUIP_TYPES.map(et => (
              <marker key={et.key} id={`arr-${et.key}`}
                markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L0,8 L8,4 z" fill={et.color} />
              </marker>
            ))}
          </defs>

          <rect x={0} y={0} width={roomL} height={roomW} fill="#f8fafc" />
          {gridX.map(x => (
            <line key={`gx${x}`} x1={x} y1={0} x2={x} y2={roomW}
              stroke="#e2e8f0" strokeWidth={roomL * 0.003} />
          ))}
          {gridY.map(y => (
            <line key={`gy${y}`} x1={0} y1={y} x2={roomL} y2={y}
              stroke="#e2e8f0" strokeWidth={roomL * 0.003} />
          ))}
          <rect x={0} y={0} width={roomL} height={roomW} fill="none"
            stroke="#94a3b8" strokeWidth={roomL * 0.008} />
          <text x={roomL * 0.5} y={roomW * 0.04 + r * 0.5}
            textAnchor="middle" fontSize={r * 0.85} fill="#94a3b8" fontFamily="system-ui">
            {roomL}m
          </text>
          <text x={r * 0.6} y={roomW * 0.5}
            textAnchor="middle" fontSize={r * 0.85} fill="#94a3b8" fontFamily="system-ui"
            transform={`rotate(-90, ${r * 0.6}, ${roomW * 0.5})`}>
            {roomW}m
          </text>

          {previewShape && drawTool === 'rect' && (
            <rect
              x={Math.min(previewShape.x1, previewShape.x2)}
              y={Math.min(previewShape.y1, previewShape.y2)}
              width={Math.abs(previewShape.x2 - previewShape.x1)}
              height={Math.abs(previewShape.y2 - previewShape.y1)}
              fill={curSelColor} fillOpacity={0.15}
              stroke={curSelColor} strokeWidth={lineW * 1.5}
              strokeDasharray={`${lineW * 3} ${lineW}`}
              style={{ pointerEvents: 'none' }} />
          )}
          {previewShape && (drawTool === 'line' || drawTool === 'arrow') && (
            <line
              x1={previewShape.x1} y1={previewShape.y1}
              x2={previewShape.x2} y2={previewShape.y2}
              stroke={curSelColor} strokeWidth={lineW * 2}
              strokeDasharray={`${lineW * 3} ${lineW}`}
              markerEnd={drawTool === 'arrow' ? `url(#arr-${selType})` : undefined}
              style={{ pointerEvents: 'none' }} />
          )}

          {markers.map(mk => {
            const col = EQUIP_TYPES.find(et => et.key === mk.equipment_type)?.color ?? '#6b7280'
            const isSel = selId === mk.id
            const shType = mk.shape_type ?? 'circle'

            if (shType === 'rect') {
              const rx = (mk.x_pct / 100) * roomL
              const ry = (mk.y_pct / 100) * roomW
              const rw = ((mk.w_pct ?? 10) / 100) * roomL
              const rh = ((mk.h_pct ?? 10) / 100) * roomW
              return (
                <g key={mk.id} className="marker-g"
                  onMouseDown={e => handleMarkerMouseDown(e, mk, 'move')}
                  onClick={e => { e.stopPropagation(); if (!didDragRef.current) setSelId(isSel ? null : mk.id) }}
                  style={{ cursor: draggingId === mk.id ? 'grabbing' : 'move' }}>
                  <rect x={rx} y={ry} width={rw} height={rh}
                    fill={col} fillOpacity={0.18}
                    stroke={col} strokeWidth={lineW * 1.5} rx={lineW} />
                  <text x={rx + rw / 2} y={ry + rh / 2}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.min(r * 0.85, rw * 0.15, rh * 0.35)}
                    fill={col} fontWeight="600" fontFamily="system-ui"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {mk.label}
                  </text>
                  {isSel && (
                    <>
                      <g onClick={e => { e.stopPropagation(); handleDeleteMarker(mk.id) }} style={{ cursor: 'pointer' }}>
                        <circle cx={rx + rw} cy={ry} r={hR} fill="#ef4444" />
                        <text x={rx + rw} y={ry + hR * 0.3} textAnchor="middle" fontSize={hR * 1.5}
                          fill="white" fontWeight="bold" style={{ userSelect: 'none', pointerEvents: 'none' }}>x</text>
                      </g>
                      <circle cx={rx} cy={ry} r={hR} fill="white" stroke={col} strokeWidth={lineW * 1.5}
                        onMouseDown={e => { e.stopPropagation(); handleMarkerMouseDown(e, mk, 'resize-tl') }}
                        style={{ cursor: 'nw-resize' }} />
                      <circle cx={rx + rw} cy={ry + rh} r={hR} fill="white" stroke={col} strokeWidth={lineW * 1.5}
                        onMouseDown={e => { e.stopPropagation(); handleMarkerMouseDown(e, mk, 'resize-br') }}
                        style={{ cursor: 'se-resize' }} />
                      <circle cx={rx + rw} cy={ry} r={hR * 0.7} fill="white" stroke={col} strokeWidth={lineW}
                        onMouseDown={e => { e.stopPropagation(); handleMarkerMouseDown(e, mk, 'resize-tr') }}
                        style={{ cursor: 'ne-resize' }} />
                      <circle cx={rx} cy={ry + rh} r={hR * 0.7} fill="white" stroke={col} strokeWidth={lineW}
                        onMouseDown={e => { e.stopPropagation(); handleMarkerMouseDown(e, mk, 'resize-bl') }}
                        style={{ cursor: 'sw-resize' }} />
                    </>
                  )}
                </g>
              )
            }

            if (shType === 'line' || shType === 'arrow') {
              const x1 = (mk.x_pct / 100) * roomL
              const y1 = (mk.y_pct / 100) * roomW
              const x2 = ((mk.x2_pct ?? mk.x_pct + 10) / 100) * roomL
              const y2 = ((mk.y2_pct ?? mk.y_pct) / 100) * roomW
              const lmx = (x1 + x2) / 2
              const lmy = (y1 + y2) / 2
              return (
                <g key={mk.id} className="marker-g"
                  onMouseDown={e => handleMarkerMouseDown(e, mk, 'move')}
                  onClick={e => { e.stopPropagation(); if (!didDragRef.current) setSelId(isSel ? null : mk.id) }}
                  style={{ cursor: draggingId === mk.id ? 'grabbing' : 'grab' }}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={lineW * 6} />
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={col} strokeWidth={lineW * 2}
                    markerEnd={shType === 'arrow' ? `url(#arr-${mk.equipment_type})` : undefined} />
                  {mk.label && (
                    <text x={lmx} y={lmy - lineW * 2}
                      textAnchor="middle" fontSize={r * 0.75} fill={col} fontWeight="600" fontFamily="system-ui"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      {mk.label}
                    </text>
                  )}
                  {isSel && (
                    <>
                      <g onClick={e => { e.stopPropagation(); handleDeleteMarker(mk.id) }} style={{ cursor: 'pointer' }}>
                        <circle cx={lmx} cy={lmy} r={hR} fill="#ef4444" />
                        <text x={lmx} y={lmy + hR * 0.3} textAnchor="middle" fontSize={hR * 1.5}
                          fill="white" fontWeight="bold" style={{ userSelect: 'none', pointerEvents: 'none' }}>x</text>
                      </g>
                      <circle cx={x1} cy={y1} r={hR} fill="white" stroke={col} strokeWidth={lineW * 1.5}
                        onMouseDown={e => { e.stopPropagation(); handleMarkerMouseDown(e, mk, 'p1') }}
                        style={{ cursor: 'crosshair' }} />
                      <circle cx={x2} cy={y2} r={hR} fill="white" stroke={col} strokeWidth={lineW * 1.5}
                        onMouseDown={e => { e.stopPropagation(); handleMarkerMouseDown(e, mk, 'p2') }}
                        style={{ cursor: 'crosshair' }} />
                    </>
                  )}
                </g>
              )
            }

            // Default: circle
            const mx = (mk.x_pct / 100) * roomL
            const my = (mk.y_pct / 100) * roomW
            return (
              <g key={mk.id} className="marker-g"
                onMouseDown={e => handleMarkerMouseDown(e, mk, 'move')}
                onClick={e => { e.stopPropagation(); if (!didDragRef.current) setSelId(isSel ? null : mk.id) }}
                style={{ cursor: draggingId === mk.id ? 'grabbing' : 'grab' }}>
                <text x={mx} y={my - r - lineW}
                  textAnchor="middle" fontSize={r * 0.85} fill="#1e293b"
                  fontWeight="600" fontFamily="system-ui"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {mk.label}
                </text>
                <circle cx={mx} cy={my} r={r} fill={col}
                  stroke={isSel ? '#1e293b' : 'white'}
                  strokeWidth={isSel ? r * 0.25 : r * 0.12}
                  opacity={0.92} />
                {isSel && (
                  <g onClick={e => { e.stopPropagation(); handleDeleteMarker(mk.id) }} style={{ cursor: 'pointer' }}>
                    <circle cx={mx + r * 0.85} cy={my - r * 0.85} r={r * 0.5} fill="#ef4444" />
                    <text x={mx + r * 0.85} y={my - r * 0.85 + r * 0.22}
                      textAnchor="middle" fontSize={r * 0.75} fill="white" fontWeight="bold"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>x</text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>

        {markers.length === 0 && !previewShape && (
          <div className="absolute bottom-3 inset-x-0 flex justify-center pointer-events-none">
            <span className="text-xs text-gray-400 bg-white/80 px-3 py-1 rounded-full">
              {drawTool === 'circle' ? '點擊地圖放置圓點標記' : '在地圖上拖拉繪製'}
            </span>
          </div>
        )}
      </div>

      {/* Legend + count */}
      <div className="flex items-start gap-x-4 gap-y-1.5 flex-wrap">
        {EQUIP_TYPES.map(et => (
          <div key={et.key} className="flex items-center gap-1 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
              style={{ backgroundColor: et.color }} />
            {et.label}
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
              <div className="mt-4 pt-4 border-t border-emerald-200">
                <p className="text-xs text-emerald-700 font-medium mb-2">📷 空間規格照片</p>
                <PhotoSection projectId={editingId as string} supabase={supabase} cats={CATS_SPACE} onBeforeUpload={isNewProject ? ensureSaved : undefined} />
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
              <div className="mt-4 pt-4 border-t border-emerald-200">
                <p className="text-xs text-emerald-700 font-medium mb-2">📷 電力與網路照片</p>
                <PhotoSection projectId={editingId as string} supabase={supabase} cats={CATS_POWER} onBeforeUpload={isNewProject ? ensureSaved : undefined} />
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
              <div className="mt-4 pt-4 border-t border-emerald-200">
                <p className="text-xs text-emerald-700 font-medium mb-2">📷 聲學與環境照片</p>
                <PhotoSection projectId={editingId as string} supabase={supabase} cats={CATS_ACOU} onBeforeUpload={isNewProject ? ensureSaved : undefined} />
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
              <div className="mt-4 pt-4 border-t border-orange-200">
                <p className="text-xs text-orange-700 font-medium mb-2">📷 施工條件照片</p>
                <PhotoSection projectId={editingId as string} supabase={supabase} cats={CATS_CONS} onBeforeUpload={isNewProject ? ensureSaved : undefined} />
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

            <Accordion title="🔧 設備類 — 現場設備記錄" color={PURPLE}>
              <EquipmentSection
                projectId={editingId as string}
                supabase={supabase}
                onBeforeUpload={isNewProject ? ensureSaved : undefined}
              />
            </Accordion>

            <Accordion title="🗺️ 現場設備標示圖" color={PURPLE}>
              <EquipmentMapSection
                projectId={editingId as string}
                supabase={supabase}
                initLength={survey.space_length}
                initWidth={survey.space_width}
                onBeforeUpload={isNewProject ? ensureSaved : undefined}
              />
            </Accordion>

            <Accordion title="📷 照片紀錄（施工前／施工中／完工）" color={BLUE}>
              <PhotoSection
                projectId={editingId as string}
                supabase={supabase}
                cats={CATS_MAIN}
                onBeforeUpload={isNewProject ? ensureSaved : undefined}
              />
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
