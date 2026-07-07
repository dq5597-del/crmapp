'use client'

// 機櫃設計模擬圖：可設定機櫃 U 數，放置佔 N U 的設備（可連結產品庫）
// U 編號比照業界標準：由下往上 1 → total_u

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { EQUIP_TYPES } from '@/lib/project-doc-spec'

const ROW_H = 22 // 每 U 顯示高度 px

export type Rack = {
  id: string; project_id: string; rack_name: string
  total_u: number; sort_order: number
}
export type RackItem = {
  id: string; rack_id: string; product_id: string | null
  label: string; u_size: number; start_u: number
  equipment_type: string; notes: string
}

const U_PRESETS = [6, 9, 12, 15, 18, 24, 32, 36, 42, 47]

function typeColor(t: string) {
  return EQUIP_TYPES.find(e => e.key === t)?.color ?? '#64748b'
}

export default function RackDesigner({ projectId, supabase, onBeforeUpload }: {
  projectId: string
  supabase: ReturnType<typeof createClient>
  onBeforeUpload?: () => Promise<boolean>
}) {
  const [racks, setRacks] = useState<Rack[]>([])
  const [items, setItems] = useState<RackItem[]>([])
  const [selItemId, setSelItemId] = useState<string | null>(null)
  const [addSlot, setAddSlot] = useState<{ rackId: string; startU: number } | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newUSize, setNewUSize] = useState(1)
  const [newType, setNewType] = useState<string>('audio')
  const [products, setProducts] = useState<any[]>([])
  const [prodSearch, setProdSearch] = useState('')
  const [showDD, setShowDD] = useState(false)
  const [newProductId, setNewProductId] = useState<string | null>(null)
  const [newRackU, setNewRackU] = useState(42)

  useEffect(() => { fetchAll(); fetchProducts() }, [projectId])

  async function fetchAll() {
    const { data: rs } = await supabase.from('project_racks')
      .select('*').eq('project_id', projectId).order('sort_order').order('created_at')
    const rackList = (rs ?? []) as Rack[]
    setRacks(rackList)
    if (rackList.length === 0) { setItems([]); return }
    const { data: its } = await supabase.from('project_rack_items')
      .select('*').in('rack_id', rackList.map(r => r.id)).order('start_u')
    setItems((its ?? []) as RackItem[])
  }

  async function fetchProducts() {
    const { data } = await supabase.from('products')
      .select('id, product_name, brand, model').eq('is_active', true).order('product_name')
    setProducts(data ?? [])
  }

  async function ensureOk(): Promise<boolean> {
    if (onBeforeUpload) return await onBeforeUpload()
    return true
  }

  async function addRack() {
    if (!(await ensureOk())) return
    const { data, error } = await supabase.from('project_racks').insert({
      project_id: projectId,
      rack_name: `機櫃 ${racks.length + 1}`,
      total_u: newRackU,
      sort_order: racks.length,
    }).select().single()
    if (error) { alert('新增機櫃失敗：' + error.message); return }
    setRacks(prev => [...prev, data as Rack])
  }

  async function updateRack(rackId: string, patch: Partial<Rack>) {
    await supabase.from('project_racks').update(patch).eq('id', rackId)
    setRacks(prev => prev.map(r => r.id === rackId ? { ...r, ...patch } : r))
  }

  async function deleteRack(rackId: string) {
    if (!confirm('確認刪除此機櫃與其中所有設備？')) return
    await supabase.from('project_racks').delete().eq('id', rackId)
    setRacks(prev => prev.filter(r => r.id !== rackId))
    setItems(prev => prev.filter(i => i.rack_id !== rackId))
  }

  function rackItems(rackId: string) {
    return items.filter(i => i.rack_id === rackId)
  }

  function isFree(rackId: string, startU: number, uSize: number, ignoreItemId?: string): boolean {
    const rack = racks.find(r => r.id === rackId)
    if (!rack) return false
    if (startU < 1 || startU + uSize - 1 > rack.total_u) return false
    return !rackItems(rackId).some(i => {
      if (ignoreItemId && i.id === ignoreItemId) return false
      const aTop = i.start_u + i.u_size - 1
      const bTop = startU + uSize - 1
      return startU <= aTop && i.start_u <= bTop
    })
  }

  async function addItem() {
    if (!addSlot) return
    const label = newLabel.trim() || (products.find(p => p.id === newProductId)?.product_name ?? '')
    if (!label) { alert('請輸入設備名稱或選擇產品'); return }
    if (!isFree(addSlot.rackId, addSlot.startU, newUSize)) {
      alert('放不下：與其他設備重疊或超出機櫃高度，請調整 U 數或位置')
      return
    }
    const { data, error } = await supabase.from('project_rack_items').insert({
      rack_id: addSlot.rackId,
      product_id: newProductId,
      label, u_size: newUSize, start_u: addSlot.startU,
      equipment_type: newType, notes: '',
    }).select().single()
    if (error) { alert('新增失敗：' + error.message); return }
    setItems(prev => [...prev, data as RackItem])
    setAddSlot(null); setNewLabel(''); setNewUSize(1); setNewProductId(null); setProdSearch('')
  }

  async function moveItem(it: RackItem, dir: 1 | -1) {
    const target = it.start_u + dir
    if (!isFree(it.rack_id, target, it.u_size, it.id)) return
    await supabase.from('project_rack_items').update({ start_u: target }).eq('id', it.id)
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, start_u: target } : x))
  }

  async function resizeItem(it: RackItem, uSize: number) {
    if (!isFree(it.rack_id, it.start_u, uSize, it.id)) { alert('此 U 數與其他設備重疊或超出機櫃') ; return }
    await supabase.from('project_rack_items').update({ u_size: uSize }).eq('id', it.id)
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, u_size: uSize } : x))
  }

  async function relabelItem(it: RackItem, label: string, equipment_type: string) {
    await supabase.from('project_rack_items').update({ label, equipment_type }).eq('id', it.id)
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, label, equipment_type } : x))
  }

  async function deleteItem(id: string) {
    await supabase.from('project_rack_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    setSelItemId(null)
  }

  const filteredProds = (() => {
    const q = prodSearch.toLowerCase()
    if (!q) return products.slice(0, 15)
    return products.filter(p =>
      p.product_name.toLowerCase().includes(q) ||
      (p.model?.toLowerCase() ?? '').includes(q) ||
      (p.brand?.toLowerCase() ?? '').includes(q)
    ).slice(0, 15)
  })()

  const selItem = items.find(i => i.id === selItemId) ?? null

  return (
    <div className="space-y-4">
      {/* 新增機櫃 */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={newRackU} onChange={e => setNewRackU(Number(e.target.value))}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-400">
          {U_PRESETS.map(u => <option key={u} value={u}>{u}U</option>)}
        </select>
        <button type="button" onClick={addRack}
          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium">
          ＋ 新增機櫃
        </button>
        <span className="text-xs text-gray-400">點機櫃空格放設備；點設備可編輯／上下移動</span>
      </div>

      {racks.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">尚無機櫃，點上方按鈕新增</div>
      )}

      {/* 機櫃列表 */}
      <div className="flex gap-6 flex-wrap items-start">
        {racks.map(rack => {
          const its = rackItems(rack.id)
          const occupied = new Set<number>()
          its.forEach(i => { for (let u = i.start_u; u < i.start_u + i.u_size; u++) occupied.add(u) })
          return (
            <div key={rack.id} className="select-none">
              {/* 機櫃標題列 */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <input value={rack.rack_name}
                  onChange={e => setRacks(prev => prev.map(r => r.id === rack.id ? { ...r, rack_name: e.target.value } : r))}
                  onBlur={e => updateRack(rack.id, { rack_name: e.target.value })}
                  className="w-24 px-1.5 py-0.5 border border-gray-200 rounded text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-400" />
                <select value={rack.total_u}
                  onChange={e => {
                    const u = Number(e.target.value)
                    const maxUsed = its.reduce((m, i) => Math.max(m, i.start_u + i.u_size - 1), 0)
                    if (u < maxUsed) { alert(`已有設備放到第 ${maxUsed}U，無法縮小到 ${u}U`); return }
                    updateRack(rack.id, { total_u: u })
                  }}
                  className="px-1 py-0.5 border border-gray-200 rounded text-xs focus:outline-none">
                  {U_PRESETS.map(u => <option key={u} value={u}>{u}U</option>)}
                </select>
                <button type="button" onClick={() => deleteRack(rack.id)}
                  className="px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50 rounded">🗑</button>
              </div>

              {/* 機櫃本體 */}
              <div className="flex">
                {/* U 編號（由上往下顯示 total→1） */}
                <div className="flex flex-col-reverse mr-1">
                  {Array.from({ length: rack.total_u }, (_, i) => i + 1).map(u => (
                    <div key={u} style={{ height: ROW_H }}
                      className="w-6 flex items-center justify-end pr-1 text-[9px] text-gray-400">{u}</div>
                  ))}
                </div>
                {/* 機櫃框 */}
                <div className="relative border-2 border-slate-500 rounded bg-slate-50"
                  style={{ width: 190, height: rack.total_u * ROW_H }}>
                  {/* 空格（可點擊放設備） */}
                  <div className="absolute inset-0 flex flex-col-reverse">
                    {Array.from({ length: rack.total_u }, (_, i) => i + 1).map(u => (
                      <div key={u} style={{ height: ROW_H }}
                        onClick={() => {
                          if (occupied.has(u)) return
                          setSelItemId(null)
                          setAddSlot({ rackId: rack.id, startU: u })
                        }}
                        className={`border-t border-dashed border-slate-200 ${occupied.has(u) ? '' : 'hover:bg-purple-50 cursor-pointer'}`} />
                    ))}
                  </div>
                  {/* 設備方塊 */}
                  {its.map(it => {
                    const col = typeColor(it.equipment_type)
                    const isSel = selItemId === it.id
                    return (
                      <div key={it.id}
                        onClick={e => { e.stopPropagation(); setAddSlot(null); setSelItemId(isSel ? null : it.id) }}
                        className="absolute left-1 right-1 rounded flex items-center justify-center text-center cursor-pointer"
                        style={{
                          bottom: (it.start_u - 1) * ROW_H + 1,
                          height: it.u_size * ROW_H - 2,
                          background: col + '26',
                          border: `2px solid ${col}`,
                          boxShadow: isSel ? `0 0 0 2px ${col}` : undefined,
                        }}>
                        <span className="text-[10px] font-semibold leading-tight px-1 truncate" style={{ color: col }}>
                          {it.label}（{it.u_size}U）
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 新增設備面板 */}
      {addSlot && (
        <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-2 text-xs">
          <div className="font-semibold text-purple-700">
            新增設備到「{racks.find(r => r.id === addSlot.rackId)?.rack_name}」第 {addSlot.startU}U（由下往上）
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* 產品搜尋 */}
            <div className="relative">
              <input value={prodSearch}
                onChange={e => { setProdSearch(e.target.value); setShowDD(true); setNewProductId(null) }}
                onFocus={() => setShowDD(true)}
                onBlur={() => setTimeout(() => setShowDD(false), 200)}
                placeholder="搜尋產品（選填）..."
                className="w-44 px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400" />
              {showDD && (
                <div className="absolute z-30 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-auto">
                  {filteredProds.map(p => (
                    <button key={p.id} type="button"
                      onMouseDown={() => { setNewProductId(p.id); setNewLabel(p.product_name + (p.model ? ` ${p.model}` : '')); setProdSearch(p.product_name); setShowDD(false) }}
                      className="w-full text-left px-3 py-2 hover:bg-purple-50 border-b border-gray-50 last:border-0">
                      {p.brand && <span className="text-[10px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded mr-1">{p.brand}</span>}
                      {p.product_name}{p.model ? ` — ${p.model}` : ''}
                    </button>
                  ))}
                  {filteredProds.length === 0 && <div className="px-3 py-2 text-gray-400">找不到產品</div>}
                </div>
              )}
            </div>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
              placeholder="或自訂設備名稱"
              className="w-40 px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400" />
            <label className="text-gray-500">佔用
              <select value={newUSize} onChange={e => setNewUSize(Number(e.target.value))}
                className="ml-1 px-1.5 py-1 border border-gray-200 rounded-lg">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(u => <option key={u} value={u}>{u}U</option>)}
              </select>
            </label>
            <select value={newType} onChange={e => setNewType(e.target.value)}
              className="px-1.5 py-1 border border-gray-200 rounded-lg">
              {EQUIP_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <button type="button" onClick={addItem}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium">加入</button>
            <button type="button" onClick={() => setAddSlot(null)}
              className="px-2 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg">取消</button>
          </div>
        </div>
      )}

      {/* 選取設備編輯面板 */}
      {selItem && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: typeColor(selItem.equipment_type) }} />
            <input value={selItem.label}
              onChange={e => setItems(prev => prev.map(x => x.id === selItem.id ? { ...x, label: e.target.value } : x))}
              onBlur={e => relabelItem(selItem, e.target.value, selItem.equipment_type)}
              className="w-48 px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400" />
            <select value={selItem.equipment_type}
              onChange={e => relabelItem(selItem, selItem.label, e.target.value)}
              className="px-1.5 py-1 border border-gray-200 rounded-lg">
              {EQUIP_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <label className="text-gray-500">U 數
              <select value={selItem.u_size} onChange={e => resizeItem(selItem, Number(e.target.value))}
                className="ml-1 px-1.5 py-1 border border-gray-200 rounded-lg">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(u => <option key={u} value={u}>{u}U</option>)}
              </select>
            </label>
            <span className="text-gray-400">位置：第 {selItem.start_u}U</span>
            <button type="button" onClick={() => moveItem(selItem, 1)}
              className="px-2 py-1 bg-white border border-gray-200 rounded-lg hover:bg-gray-100">↑ 上移</button>
            <button type="button" onClick={() => moveItem(selItem, -1)}
              className="px-2 py-1 bg-white border border-gray-200 rounded-lg hover:bg-gray-100">↓ 下移</button>
            <button type="button" onClick={() => { if (confirm('確認移除此設備？')) deleteItem(selItem.id) }}
              className="ml-auto px-2 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100">🗑 移除</button>
          </div>
        </div>
      )}
    </div>
  )
}
