// ============================================================
// 專案文件（場勘報告／標示圖／驗收單）共用規格：
// 欄位標籤、照片分類、未標示檢查邏輯
// ============================================================

export const EQUIP_TYPES = [
  { key: 'network', label: '網路設備', color: '#ef4444' },
  { key: 'info',    label: '資訊設備', color: '#f97316' },
  { key: 'audio',   label: '音響設備', color: '#eab308' },
  { key: 'video',   label: '影像設備', color: '#22c55e' },
  { key: 'env',     label: '環控設備', color: '#3b82f6' },
  { key: 'phone',   label: '電話設備', color: '#6366f1' },
  { key: 'aircon',  label: '空調設備', color: '#a855f7' },
] as const

export type EquipMarker = {
  id: string; project_id: string; product_id: string | null
  equipment_type: string; label: string
  x_pct: number; y_pct: number
  x2_pct: number | null; y2_pct: number | null
  w_pct: number | null; h_pct: number | null
  shape_type: 'circle' | 'rect' | 'line' | 'arrow'
  notes: string; created_at: string
}

/** 標記點是否「未標示」：沒有選產品，且標籤空白或只是設備類型的通用名稱 */
export function isMarkerUnlabeled(m: EquipMarker): boolean {
  const label = (m.label ?? '').trim()
  if (m.product_id) return false
  if (!label) return true
  return EQUIP_TYPES.some(t => t.label === label)
}

// ── 照片分類（project_photos.category） ──────────────────────
export const PHOTO_CATS: { value: number; label: string; group: string }[] = [
  { value: 1,  label: '施工前',   group: '照片記錄' },
  { value: 2,  label: '施工中',   group: '照片記錄' },
  { value: 3,  label: '完工',     group: '照片記錄' },
  { value: 4,  label: '空間照片', group: '空間規格' },
  { value: 5,  label: '電力照片', group: '電力與網路' },
  { value: 6,  label: '環境照片', group: '聲學與環境' },
  { value: 7,  label: '施工照片', group: '施工條件' },
  { value: 8,  label: '舊有設備', group: '控制台' },
  { value: 9,  label: '新設設備', group: '控制台' },
  { value: 10, label: '舊有設備', group: '機櫃設備' },
  { value: 11, label: '新設設備', group: '機櫃設備' },
  { value: 12, label: '舊有設備', group: '現場設備' },
  { value: 13, label: '新設設備', group: '現場設備' },
]

export function photoCatLabel(v: number): string {
  const c = PHOTO_CATS.find(c => c.value === v)
  return c ? `${c.group}—${c.label}` : `分類${v}`
}

// ── 場勘報告欄位定義（區塊 → 欄位 → 中文標籤） ────────────────
export type FieldDef = { key: string; label: string; boolean?: boolean }
export type SectionDef = { title: string; source: 'project' | 'survey'; fields: FieldDef[]; photoCats?: number[] }

export const REPORT_SECTIONS: SectionDef[] = [
  {
    title: '① 上類 — 基本資訊', source: 'project',
    fields: [
      { key: 'project_name', label: '專案名稱' },
      { key: 'scene_name',   label: '場景名稱' },
      { key: 'user_type',    label: '使用者類型' },
      { key: 'status',       label: '專案狀態' },
      { key: 'budget',       label: '預算（NT$）' },
      { key: 'start_date',   label: '施工日期' },
      { key: 'end_date',     label: '預計完工日' },
      { key: 'description',  label: '說明／備注' },
    ],
  },
  {
    title: '② 上類 — 需求分析', source: 'project',
    fields: [
      { key: 'main_function',     label: '主要功能定位' },
      { key: 'equipment_needs',   label: '設備需求' },
      { key: 'audio_needs',       label: '音響需求' },
      { key: 'video_needs',       label: '影像需求' },
      { key: 'interaction_needs', label: '互動需求' },
      { key: 'control_needs',     label: '控制需求' },
      { key: 'other_needs',       label: '其他需求' },
      { key: 'venue_specs',       label: '場地規格' },
    ],
  },
  {
    title: '③ 下類 — 場勘基本資訊', source: 'survey',
    fields: [
      { key: 'survey_date',   label: '場勘日期' },
      { key: 'surveyor',      label: '場勘負責人' },
      { key: 'contact_name',  label: '現場聯絡姓名' },
      { key: 'contact_phone', label: '現場聯絡電話' },
      { key: 'venue_address', label: '場地地址' },
      { key: 'space_usage',   label: '空間用途' },
    ],
  },
  {
    title: '④ 下類 — 空間規格資訊', source: 'survey', photoCats: [4],
    fields: [
      { key: 'space_length',  label: '長度（公尺）' },
      { key: 'space_width',   label: '寬度（公尺）' },
      { key: 'space_height',  label: '高度（公尺）' },
      { key: 'capacity',      label: '容納人數' },
      { key: 'ceiling_type',  label: '天花板類型/材質' },
      { key: 'wall_material', label: '牆面材質' },
      { key: 'space_form',    label: '空間形狀' },
      { key: 'can_construct', label: '是否可施工裝設', boolean: true },
    ],
  },
  {
    title: '⑤ 下類 — 電力與網路', source: 'survey', photoCats: [5],
    fields: [
      { key: 'power_panel_location', label: '電源總閘位置說明' },
      { key: 'outlet_count',         label: '現有插座數量位置' },
      { key: 'voltage_capacity',     label: '電壓容量說明' },
      { key: 'rf_interference',      label: '電源射頻干擾情況' },
      { key: 'network_info',         label: '網路設備說明資訊' },
      { key: 'need_power_expansion', label: '是否需要擴充電源容量', boolean: true },
    ],
  },
  {
    title: '⑥ 下類 — 聲學與環境', source: 'survey', photoCats: [6],
    fields: [
      { key: 'noise_factors',    label: '空間內存在噪音來源' },
      { key: 'ambient_noise_db', label: '環境噪音（dB）' },
      { key: 'acoustics',        label: '空間聲學特性' },
      { key: 'natural_light',    label: '自然光源情況' },
      { key: 'audience_factors', label: '觀眾視角潛在因素' },
    ],
  },
  {
    title: '⑦ 中類 — 施工條件限制', source: 'survey', photoCats: [7],
    fields: [
      { key: 'no_drilling',               label: '是否禁止鑽孔打牆壁', boolean: true },
      { key: 'need_procurement',          label: '是否需要採購/代購材料設備', boolean: true },
      { key: 'special_construction_time', label: '特殊施工時間限制' },
      { key: 'hanging_limits',            label: '懸掛載重限制' },
      { key: 'construction_issues',       label: '現場施工限制說明' },
      { key: 'travel_time_minutes',       label: '搬運時間（分鐘）' },
      { key: 'elevator_size',             label: '電梯尺寸規格' },
      { key: 'parking_location',          label: '停車場距離地點資訊' },
      { key: 'distance_to_storage',       label: '下樓到倉庫距離長度' },
    ],
  },
  {
    title: '⑧ 中類 — 現況設備補充', source: 'survey',
    fields: [
      { key: 'av_system_needs',    label: '現有 AV 系統需求' },
      { key: 'existing_equipment', label: '現有在場設備說明' },
      { key: 'other_observations', label: '其他現場觀察記錄' },
    ],
  },
  {
    title: '⑨ 中類 — 場勘備註', source: 'survey',
    fields: [
      { key: 'client_expected_functions', label: '客戶期望功能/期望達成目標' },
      { key: 'other_special_needs',       label: '其他特殊需求說明' },
      { key: 'preliminary_budget_range',  label: '初步預算範圍' },
      { key: 'survey_notes',              label: '場勘備註內容' },
    ],
  },
]

/** 值是否視為「未填寫」（boolean 欄位一律視為已填） */
export function isEmptyValue(def: FieldDef, v: any): boolean {
  if (def.boolean) return false
  return v === null || v === undefined || String(v).trim() === ''
}

export function displayValue(def: FieldDef, v: any): string {
  if (def.boolean) return v ? '是' : '否'
  return String(v ?? '').trim()
}
