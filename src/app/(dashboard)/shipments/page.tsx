'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { usePermissions } from '@/lib/permissions'
import {
  Truck, Plus, Search, Printer, Trash2, Pencil, X, Link2, Check,
  PackageCheck, Undo2, ChevronDown,
} from 'lucide-react'

const STATUSES = ['待出貨', '已出貨', '已送達', '已簽收', '取消'] as const
const STATUS_COLORS: Record<string, string> = {
  '待出貨': 'bg-gray-100 text-gray-600',
  '已出貨': 'bg-blue-100 text-blue-700',
  '已送達': 'bg-amber-100 text-amber-700',
  '已簽收': 'bg-green-100 text-green-700',
  '取消': 'bg-red-100 text-red-600',
}
const METHODS = ['自送', '貨運', '宅配', '客戶自取'] as const
const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const num = (v: any) => Number(v ?? 0) || 0

type Item = {
  id?: string
  sales_order_item_id?: string | null
  product_id?: string | null
  product_name: string
  model?: string | null
  unit?: string | null
  quantity: number | string
  item_notes?: string | null
}

export default function ShipmentsPage() {
  const { permOf } = usePermissions()
  const perm = permOf('shipments')

  const supabase = createClient()
  const [rows, setRows] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [filter, setFilter] = useState<string>('全部')
  const [q, setQ] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<any>({})
  const [items, setItems] = useState<Item[]>([])
  const [saving, setSaving] = useState(false)
  const [soPickerOpen, setSoPickerOpen] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [sRes, cRes, pRes, oRes] = await Promise.all([
      supabase.from('shipments')
        .select('*, clients(company_name), sales_orders(order_no), shipment_items(id, quantity)')
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('id, company_name, phone, address').order('company_name'),
      supabase.from('products').select('id, product_name, model, unit, stock_qty').eq('is_active', true).order('product_name'),
      supabase.from('sales_orders').select('id, order_no, project_name, client_id, clients(company_name)').order('created_at', { ascending: false }).limit(100),
    ])
    if (sRes.error) { console.error(sRes.error); setDenied(true) }
    setRows(sRes.data ?? [])
    setClients(cRes.data ?? [])
    setProducts(pRes.data ?? [])
    setOrders(oRes.data ?? [])
    setLoading(false)
  }

  const filtered = useMemo(() => rows.filter(r => {
    if (filter !== '全部' && r.status !== filter) return false
    if (q) {
      const s = `${r.shipment_no} ${r.clients?.company_name ?? ''} ${r.project_name ?? ''} ${r.tracking_no ?? ''}`.toLowerCase()
      if (!s.includes(q.toLowerCase())) return false
    }
    return true
  }), [rows, filter, q])

  const counts = useMemo(() => {
    const c: Record<string, number> = { 全部: rows.length }
    STATUSES.forEach(s => { c[s] = rows.filter(r => r.status === s).length })
    return c
  }, [rows])

  /* ── 由銷貨單轉出貨單 ── */
  async function fromSalesOrder(orderId: string) {
    setSoPickerOpen(false)
    setBusy('so')
    const res = await fetch('/api/shipments/from-sales-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sales_order_id: orderId }),
    })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) { alert(data.error ?? '轉出貨單失敗'); return }
    await fetchAll()
    const created = (await supabase.from('shipments').select('*, shipment_items(*)').eq('id', data.id).single()).data
    if (created) openEdit(created)
  }

  /* ── 新增（手動） ── */
  function openNew() {
    setEditingId(null)
    setForm({
      client_id: '', project_name: '', ship_date: new Date().toISOString().slice(0, 10),
      status: '待出貨', deduct_stock: true, delivery_method: '自送',
      carrier: '', tracking_no: '', expected_date: '', receiver_name: '', receiver_phone: '', address: '', notes: '',
    })
    setItems([{ product_name: '', quantity: 1 }])
    setOpen(true)
  }

  async function openEdit(r: any) {
    setEditingId(r.id)
    setForm({ ...r })
    const its = r.shipment_items?.length && r.shipment_items[0].product_name
      ? r.shipment_items
      : (await supabase.from('shipment_items').select('*').eq('shipment_id', r.id).order('seq_no')).data ?? []
    setItems(its.length ? its : [{ product_name: '', quantity: 1 }])
    setOpen(true)
  }

  function pickClient(id: string) {
    const c = clients.find(x => x.id === id)
    setForm((f: any) => ({
      ...f, client_id: id,
      receiver_name: f.receiver_name || c?.company_name || '',
      receiver_phone: f.receiver_phone || c?.phone || '',
      address: f.address || c?.address || '',
    }))
  }

  function pickProduct(i: number, pid: string) {
    const p = products.find(x => x.id === pid)
    setItems(its => its.map((it, idx) => idx === i ? {
      ...it, product_id: pid || null,
      product_name: p?.product_name ?? it.product_name,
      model: p?.model ?? null, unit: p?.unit ?? null,
    } : it))
  }

  async function save() {
    if (!form.client_id) { alert('請選擇客戶'); return }
    const valid = items.filter(i => i.product_name?.trim() && num(i.quantity) > 0)
    if (!valid.length) { alert('請至少填一筆品項'); return }
    setSaving(true)

    let shipmentId = editingId
    const payload: any = {
      client_id: form.client_id,
      sales_order_id: form.sales_order_id ?? null,
      project_name: form.project_name || null,
      ship_date: form.ship_date || null,
      status: form.status ?? '待出貨',
      deduct_stock: !!form.deduct_stock,
      delivery_method: form.delivery_method || null,
      carrier: form.carrier || null,
      tracking_no: form.tracking_no || null,
      expected_date: form.expected_date || null,
      delivered_date: form.delivered_date || null,
      receiver_name: form.receiver_name || null,
      receiver_phone: form.receiver_phone || null,
      address: form.address || null,
      notes: form.notes || null,
    }

    if (editingId) {
      const { error } = await supabase.from('shipments').update(payload).eq('id', editingId)
      if (error) { setSaving(false); alert('儲存失敗：' + error.message); return }
      await supabase.from('shipment_items').delete().eq('shipment_id', editingId)
    } else {
      // 產生單號（撞號重試）
      const d = new Date()
      const prefix = `SH-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-`
      const { count } = await supabase.from('shipments').select('id', { count: 'exact', head: true }).like('shipment_no', `${prefix}%`)
      let seq = (count ?? 0) + 1
      let ok = false
      for (let i = 0; i < 5; i++) {
        const shipment_no = `${prefix}${String(seq).padStart(3, '0')}`
        const { data, error } = await supabase.from('shipments').insert({ ...payload, shipment_no }).select('id').single()
        if (!error && data) { shipmentId = data.id; ok = true; break }
        if ((error as any)?.code === '23505') { seq += 1; continue }
        setSaving(false); alert('建立失敗：' + error?.message); return
      }
      if (!ok) { setSaving(false); alert('單號衝突，請重試'); return }
    }

    const payloadItems = valid.map((it, idx) => ({
      shipment_id: shipmentId,
      seq_no: idx + 1,
      sales_order_item_id: it.sales_order_item_id ?? null,
      product_id: it.product_id ?? null,
      product_name: it.product_name.trim(),
      model: it.model ?? null,
      unit: it.unit ?? null,
      quantity: num(it.quantity),
      item_notes: it.item_notes ?? null,
    }))
    const { error: e2 } = await supabase.from('shipment_items').insert(payloadItems)
    setSaving(false)
    if (e2) { alert('品項儲存失敗：' + e2.message); return }
    setOpen(false)
    fetchAll()
  }

  async function confirmShip(r: any) {
    const msg = r.deduct_stock
      ? `確認出貨「${r.shipment_no}」？\n系統會自動扣減庫存。`
      : `確認出貨「${r.shipment_no}」？\n（這張單設定為不扣庫存）`
    if (!confirm(msg)) return
    setBusy(r.id)
    const res = await fetch(`/api/shipments/${r.id}/ship`, { method: 'POST' })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) { alert(data.error ?? '出貨失敗'); return }
    fetchAll()
  }

  async function revertShip(r: any) {
    if (!confirm(`退回「${r.shipment_no}」為待出貨？\n${r.stock_deducted ? '系統會自動沖銷回庫存。' : ''}`)) return
    setBusy(r.id)
    const res = await fetch(`/api/shipments/${r.id}/ship`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revert' }),
    })
    const data = await res.json()
    setBusy(null)
    if (!res.ok) { alert(data.error ?? '退回失敗'); return }
    fetchAll()
  }

  async function setStatus(r: any, status: string) {
    const patch: any = { status }
    if (status === '已送達' && !r.delivered_date) patch.delivered_date = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('shipments').update(patch).eq('id', r.id)
    if (error) { alert('更新失敗：' + error.message); return }
    fetchAll()
  }

  async function remove(r: any) {
    if (!confirm(`確定刪除出貨單「${r.shipment_no}」？${r.stock_deducted ? '\n注意：這張單已扣過庫存，請先「退回待出貨」把庫存沖銷回來，再刪除。' : ''}`)) return
    if (r.stock_deducted) { alert('已扣庫存的出貨單請先退回待出貨（沖銷庫存）再刪除。'); return }
    const { error } = await supabase.from('shipments').delete().eq('id', r.id)
    if (error) { alert('刪除失敗：' + error.message); return }
    fetchAll()
  }

  function copyTrack(r: any) {
    const url = `${window.location.origin}/ship/${r.track_token}`
    navigator.clipboard.writeText(url)
    setCopiedId(r.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (denied) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-5 text-sm leading-relaxed">
          無法讀取出貨資料。請先到 Supabase SQL Editor 執行 <code>supabase/schema_shipments.sql</code>。
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Truck className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-900">出貨管理</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setSoPickerOpen(o => !o)} disabled={busy === 'so'}
              className="flex items-center gap-1.5 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-60">
              <PackageCheck size={15} /> {busy === 'so' ? '處理中…' : '由銷貨單轉出貨'} <ChevronDown size={13} />
            </button>
            {soPickerOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSoPickerOpen(false)} />
                <div className="absolute right-0 mt-1 w-80 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
                  {orders.length === 0 && <div className="px-3 py-4 text-sm text-gray-400 text-center">沒有銷貨單</div>}
                  {orders.map(o => (
                    <button key={o.id} onClick={() => fromSalesOrder(o.id)}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                      <div className="font-medium text-gray-900">{o.order_no}</div>
                      <div className="text-xs text-gray-500">{o.clients?.company_name ?? '—'}{o.project_name ? ` · ${o.project_name}` : ''}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {perm.can_create && <button onClick={openNew} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
            <Plus size={16} /> 新增出貨單
          </button>}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['全部', ...STATUSES].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-sm border ${filter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {s} <span className="opacity-60">{counts[s] ?? 0}</span>
          </button>
        ))}
        <div className="relative ml-auto">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋單號／客戶／託運單號"
            className="pl-9 pr-3 py-1.5 border border-gray-200 rounded-xl text-sm w-64" />
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-gray-400">載入中…</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center text-gray-400">沒有符合的出貨單</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="py-2.5 px-4">出貨單號</th>
                  <th className="px-4">客戶／案名</th>
                  <th className="px-4">來源銷貨單</th>
                  <th className="px-4">出貨日</th>
                  <th className="px-4">配送</th>
                  <th className="px-4 text-center">品項</th>
                  <th className="px-4">狀態</th>
                  <th className="px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50/60">
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-gray-900">{r.shipment_no}</div>
                      {!r.deduct_stock && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">不扣庫存</span>}
                      {r.signed_at && <div className="text-xs text-green-600">已簽收：{r.signer_name}</div>}
                    </td>
                    <td className="px-4 text-gray-700">
                      {r.clients?.company_name ?? '—'}
                      {r.project_name && <div className="text-xs text-gray-400">{r.project_name}</div>}
                    </td>
                    <td className="px-4 text-gray-500">{r.sales_orders?.order_no ?? '—'}</td>
                    <td className="px-4 text-gray-600 whitespace-nowrap">{r.ship_date ?? '—'}</td>
                    <td className="px-4 text-gray-600">
                      {r.delivery_method ?? '—'}
                      {r.tracking_no && <div className="text-xs text-blue-600">{r.tracking_no}</div>}
                    </td>
                    <td className="px-4 text-center text-gray-600">{r.shipment_items?.length ?? 0}</td>
                    <td className="px-4">
                      <select value={r.status} onChange={e => setStatus(r, e.target.value)}
                        className={`text-xs px-2 py-1 rounded-lg font-medium border-0 ${STATUS_COLORS[r.status]}`}>
                        {STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-4">
                      <div className="flex items-center justify-end gap-1">
                        {r.status === '待出貨' ? (
                          <button onClick={() => confirmShip(r)} disabled={busy === r.id} title="確認出貨（扣庫存）"
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 disabled:opacity-50"><PackageCheck size={15} /></button>
                        ) : (
                          <button onClick={() => revertShip(r)} disabled={busy === r.id} title="退回待出貨（沖銷庫存）"
                            className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 disabled:opacity-50"><Undo2 size={15} /></button>
                        )}
                        <button onClick={() => copyTrack(r)} title="複製客戶追蹤／簽收連結"
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
                          {copiedId === r.id ? <Check size={15} className="text-green-600" /> : <Link2 size={15} />}
                        </button>
                        <button onClick={() => window.open(`/shipments/${r.id}/print`, '_blank')} title="列印／分享 PDF"
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><Printer size={15} /></button>
                        {perm.can_edit && <button onClick={() => openEdit(r)} title="編輯"
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><Pencil size={15} /></button>}
                        {perm.can_delete && <button onClick={() => remove(r)} title="刪除"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 編輯 Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
              <h3 className="font-semibold">
                {editingId ? `編輯出貨單 ${form.shipment_no ?? ''}` : '新增出貨單'}
              </h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <F label="客戶 *">
                  <select value={form.client_id ?? ''} onChange={e => pickClient(e.target.value)} className={inp}>
                    <option value="">— 選擇 —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                  </select>
                </F>
                <F label="案名"><input value={form.project_name ?? ''} onChange={e => setForm({ ...form, project_name: e.target.value })} className={inp} /></F>
                <F label="出貨日"><input type="date" value={form.ship_date ?? ''} onChange={e => setForm({ ...form, ship_date: e.target.value })} className={inp} /></F>
                <F label="狀態">
                  <select value={form.status ?? '待出貨'} onChange={e => setForm({ ...form, status: e.target.value })} className={inp}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </F>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2">
                <input type="checkbox" checked={!!form.deduct_stock}
                  onChange={e => setForm({ ...form, deduct_stock: e.target.checked })} className="w-4 h-4" />
                出貨確認時自動扣庫存（樣品、借出、寄倉可取消勾選）
              </label>

              <section>
                <div className="text-xs font-semibold text-gray-700 mb-2">物流資訊</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <F label="配送方式">
                    <select value={form.delivery_method ?? '自送'} onChange={e => setForm({ ...form, delivery_method: e.target.value })} className={inp}>
                      {METHODS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </F>
                  <F label="貨運公司"><input value={form.carrier ?? ''} onChange={e => setForm({ ...form, carrier: e.target.value })} className={inp} /></F>
                  <F label="託運單號"><input value={form.tracking_no ?? ''} onChange={e => setForm({ ...form, tracking_no: e.target.value })} className={inp} /></F>
                  <F label="預計到貨"><input type="date" value={form.expected_date ?? ''} onChange={e => setForm({ ...form, expected_date: e.target.value })} className={inp} /></F>
                  <F label="收件人"><input value={form.receiver_name ?? ''} onChange={e => setForm({ ...form, receiver_name: e.target.value })} className={inp} /></F>
                  <F label="收件電話"><input value={form.receiver_phone ?? ''} onChange={e => setForm({ ...form, receiver_phone: e.target.value })} className={inp} /></F>
                  <div className="col-span-2">
                    <F label="送貨地址"><input value={form.address ?? ''} onChange={e => setForm({ ...form, address: e.target.value })} className={inp} /></F>
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-700">出貨品項</div>
                  <button type="button" onClick={() => setItems(i => [...i, { product_name: '', quantity: 1 }])}
                    className="text-sm border border-gray-200 hover:bg-gray-50 px-3 py-1 rounded-lg">＋ 加一列</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 bg-gray-50">
                        <th className="px-2 py-2 w-8">#</th>
                        <th className="px-2 py-2">產品</th>
                        <th className="px-2 py-2 w-40">品名（可自填）</th>
                        <th className="px-2 py-2 w-24">數量</th>
                        <th className="px-2 py-2 w-20">庫存</th>
                        <th className="px-2 py-2">備註</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => {
                        const stock = products.find(p => p.id === it.product_id)?.stock_qty
                        const short = stock != null && num(it.quantity) > num(stock)
                        return (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                            <td className="px-2 py-1.5">
                              <select value={it.product_id ?? ''} onChange={e => pickProduct(i, e.target.value)}
                                className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs">
                                <option value="">— 自行輸入 —</option>
                                {products.map(p => (
                                  <option key={p.id} value={p.id}>{p.product_name}{p.model ? `（${p.model}）` : ''}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              <input value={it.product_name} onChange={e => setItems(its => its.map((x, idx) => idx === i ? { ...x, product_name: e.target.value } : x))}
                                className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" min={0} step="0.5" value={it.quantity}
                                onChange={e => setItems(its => its.map((x, idx) => idx === i ? { ...x, quantity: e.target.value } : x))}
                                className={`w-full px-2 py-1 border rounded-lg text-xs text-center ${short ? 'border-red-300 text-red-600' : 'border-gray-200'}`} />
                            </td>
                            <td className={`px-2 py-1.5 text-center text-xs ${short ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                              {stock != null ? stock : '—'}
                            </td>
                            <td className="px-2 py-1.5">
                              <input value={it.item_notes ?? ''} onChange={e => setItems(its => its.map((x, idx) => idx === i ? { ...x, item_notes: e.target.value } : x))}
                                className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs" />
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <button type="button" onClick={() => setItems(its => its.filter((_, idx) => idx !== i))}
                                className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {items.some(it => {
                  const stock = products.find(p => p.id === it.product_id)?.stock_qty
                  return stock != null && num(it.quantity) > num(stock)
                }) && (
                  <div className="mt-2 text-xs text-red-600">紅字表示出貨量大於現有庫存，出貨後庫存會變負數，請確認。</div>
                )}
              </section>

              <F label="備註">
                <textarea rows={2} value={form.notes ?? ''} onChange={e => setForm({ ...form, notes: e.target.value })} className={inp} />
              </F>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-lg border">取消</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-60">
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}
