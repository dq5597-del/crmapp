'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { Vendor } from '@/types'
import { Plus, Search, Phone, Mail, Pencil, Trash2, Tag, X, Wrench, Printer } from 'lucide-react'

const CATEGORIES = ['代理商', '維修商', '工程商', '設備商', '其他'] // 廠商類別（性質）

const EMPTY_FORM = {
  vendor_code: '', company_name: '', contact_name: '', phone: '', fax: '',
  email: '', address: '', bank_name: '', bank_account: '', bank_account_name: '',
  payment_terms: '', payment_day: '', tax_id: '', category: '', notes: '',
  is_active: true,
  // 維修部
  repair_contact: '', repair_phone: '', repair_email: '', repair_address: '',
  // 代理品牌 (comma-joined string internally, UI as tags)
  brand_names: [] as string[],
  // 銷售類別（product_categories.main_category）
  sales_categories: [] as string[],
}

type VendorForm = typeof EMPTY_FORM

export default function VendorsPage() {
  const supabase = createClient()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<VendorForm>(EMPTY_FORM)
  const [brandInput, setBrandInput] = useState('')
  const brandRef = useRef<HTMLInputElement>(null)
  const [mainCategories, setMainCategories] = useState<string[]>([])

  useEffect(() => { fetchVendors(); fetchMainCategories() }, [])

  async function fetchMainCategories() {
    const { data } = await supabase.from('product_categories').select('main_category').order('main_category')
    setMainCategories(Array.from(new Set((data ?? []).map(c => c.main_category))))
  }

  async function fetchVendors() {
    const { data } = await supabase.from('vendors').select('*').order('company_name')
    setVendors(data ?? [])
    setLoading(false)
  }

  function startEdit(v?: Vendor) {
    if (v) {
      setForm({
        vendor_code: v.vendor_code ?? '', company_name: v.company_name,
        contact_name: v.contact_name ?? '', phone: v.phone ?? '', fax: v.fax ?? '',
        email: v.email ?? '', address: v.address ?? '',
        bank_name: v.bank_name ?? '', bank_account: v.bank_account ?? '',
        bank_account_name: v.bank_account_name ?? '', payment_terms: v.payment_terms ?? '',
        payment_day: (v as any).payment_day?.toString() ?? '',
        tax_id: v.tax_id ?? '', category: v.category ?? '', notes: v.notes ?? '',
        is_active: v.is_active,
        repair_contact: v.repair_contact ?? '', repair_phone: v.repair_phone ?? '',
        repair_email: v.repair_email ?? '', repair_address: v.repair_address ?? '',
        brand_names: v.brand_names ?? [],
        sales_categories: v.sales_categories ?? [],
      })
      setEditingId(v.id)
    } else {
      setForm({ ...EMPTY_FORM, brand_names: [], sales_categories: [] })
      setEditingId('new')
    }
    setBrandInput('')
  }

  function addBrand() {
    const b = brandInput.trim()
    if (!b || form.brand_names.includes(b)) { setBrandInput(''); return }
    setForm(f => ({ ...f, brand_names: [...f.brand_names, b] }))
    setBrandInput('')
    brandRef.current?.focus()
  }

  function removeBrand(b: string) {
    setForm(f => ({ ...f, brand_names: f.brand_names.filter(x => x !== b) }))
  }

  function toggleSalesCategory(c: string) {
    setForm(f => ({
      ...f,
      sales_categories: f.sales_categories.includes(c)
        ? f.sales_categories.filter(x => x !== c)
        : [...f.sales_categories, c],
    }))
  }

  async function handleSave() {
    if (!form.company_name.trim()) return
    const payload = {
      vendor_code: form.vendor_code || null,
      company_name: form.company_name,
      contact_name: form.contact_name || null,
      phone: form.phone || null,
      fax: form.fax || null,
      email: form.email || null,
      address: form.address || null,
      bank_name: form.bank_name || null,
      bank_account: form.bank_account || null,
      bank_account_name: form.bank_account_name || null,
      payment_terms: form.payment_terms || null,
      payment_day: form.payment_day ? parseInt(form.payment_day) : null,
      tax_id: form.tax_id || null,
      category: form.category || null,
      notes: form.notes || null,
      is_active: form.is_active,
      repair_contact: form.repair_contact || null,
      repair_phone: form.repair_phone || null,
      repair_email: form.repair_email || null,
      repair_address: form.repair_address || null,
      brand_names: form.brand_names.length > 0 ? form.brand_names : null,
      sales_categories: form.sales_categories.length > 0 ? form.sales_categories : null,
    }
    if (editingId === 'new') {
      await supabase.from('vendors').insert(payload)
    } else {
      await supabase.from('vendors').update(payload).eq('id', editingId)
    }
    setEditingId(null)
    fetchVendors()
  }

  async function handleDelete(id: string) {
    if (!confirm('確定刪除此廠商？相關訂購單的廠商連結將清除。')) return
    await supabase.from('vendors').delete().eq('id', id)
    fetchVendors()
  }

  const filtered = vendors.filter(v =>
    v.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (v.contact_name?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
    (v.phone?.includes(search) ?? false) ||
    (v.vendor_code?.includes(search) ?? false)
  )

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  const labelClass = "text-xs text-gray-600 mb-1 block"

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">廠商建檔</h1>
          <p className="text-sm text-gray-500 mt-0.5">共 {filtered.length} 家廠商</p>
        </div>
        <button onClick={() => startEdit()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium">
          <Plus size={16} /> 新增廠商
        </button>
      </div>

      <div className="relative mb-5 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋廠商名稱、代碼、電話..." className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* 新增/編輯表單 */}
      {editingId !== null && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-5 space-y-5">
          <div className="font-semibold text-blue-900">{editingId === 'new' ? '新增廠商' : '編輯廠商'}</div>

          {/* 基本資料 */}
          <div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">基本資料</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>廠商代碼</label>
                <input value={form.vendor_code} onChange={e => setForm(p => ({ ...p, vendor_code: e.target.value }))} className={inputClass} placeholder="V001" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>公司名稱 *</label>
                <input value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} className={inputClass} placeholder="XX貿易有限公司" />
              </div>
              <div>
                <label className={labelClass}>聯絡人</label>
                <input value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>電話</label>
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>傳真</label>
                <input value={form.fax} onChange={e => setForm(p => ({ ...p, fax: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>統一編號</label>
                <input value={form.tax_id} onChange={e => setForm(p => ({ ...p, tax_id: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>廠商類別</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className={inputClass}>
                  <option value="">請選擇</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className={labelClass}>地址</label>
                <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className={inputClass} />
              </div>
            </div>
          </div>

          {/* 代理品牌 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tag size={13} className="text-blue-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">代理品牌</span>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.brand_names.map(b => (
                <span key={b} className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full text-xs font-medium">
                  {b}
                  <button onClick={() => removeBrand(b)} className="hover:text-red-500 ml-0.5"><X size={11} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 max-w-xs">
              <input
                ref={brandRef}
                value={brandInput}
                onChange={e => setBrandInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBrand() } }}
                placeholder="輸入品牌名稱後按 Enter"
                className={inputClass}
              />
              <button onClick={addBrand} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 shrink-0">新增</button>
            </div>
          </div>

          {/* 銷售類別 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tag size={13} className="text-purple-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">銷售類別</span>
              <span className="text-xs text-gray-400">（詢價單將依此過濾可選產品）</span>
            </div>
            {mainCategories.length === 0 ? (
              <div className="text-xs text-gray-400">尚無商品分類，請先至產品管理建立分類</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {mainCategories.map(c => {
                  const active = form.sales_categories.includes(c)
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleSalesCategory(c)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-purple-400'
                      }`}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 匯款資訊 */}
          <div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">匯款資訊</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>銀行名稱</label>
                <input value={form.bank_name} onChange={e => setForm(p => ({ ...p, bank_name: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>帳號</label>
                <input value={form.bank_account} onChange={e => setForm(p => ({ ...p, bank_account: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>戶名</label>
                <input value={form.bank_account_name} onChange={e => setForm(p => ({ ...p, bank_account_name: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>付款條件</label>
                <input value={form.payment_terms} onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))} className={inputClass} placeholder="月結30天" />
              </div>
              <div>
                <label className={labelClass}>付款日（每月幾號）</label>
                <input type="number" min="1" max="31" value={form.payment_day} onChange={e => setForm(p => ({ ...p, payment_day: e.target.value }))} className={inputClass} placeholder="例：15" />
              </div>
            </div>
          </div>

          {/* 維修部聯絡資訊 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Wrench size={13} className="text-amber-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">維修部聯絡資訊</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>維修部聯絡人</label>
                <input value={form.repair_contact} onChange={e => setForm(p => ({ ...p, repair_contact: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>維修部電話</label>
                <input value={form.repair_phone} onChange={e => setForm(p => ({ ...p, repair_phone: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>維修部 Email</label>
                <input value={form.repair_email} onChange={e => setForm(p => ({ ...p, repair_email: e.target.value }))} className={inputClass} />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className={labelClass}>維修送修地址</label>
                <input value={form.repair_address} onChange={e => setForm(p => ({ ...p, repair_address: e.target.value }))} className={inputClass} />
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>備註</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className={inputClass + ' resize-none'} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="vendor_active" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="accent-blue-600 w-4 h-4" />
            <label htmlFor="vendor_active" className="text-sm text-gray-700">啟用此廠商</label>
          </div>

          <div className="flex justify-end gap-2 pt-1 border-t border-blue-100">
            <button onClick={() => setEditingId(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white">取消</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">儲存</button>
          </div>
        </div>
      )}

      {/* 廠商清單 */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">載入中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">尚無廠商資料</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(v => (
            <div key={v.id} className={`bg-white border rounded-2xl p-4 ${v.is_active ? 'border-gray-100 hover:border-blue-300' : 'border-gray-100 opacity-60'} transition-all group`}>
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{v.company_name}</div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    {v.vendor_code && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{v.vendor_code}</span>}
                    {v.category && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">{v.category}</span>}
                    {!v.is_active && <span className="text-xs bg-red-100 text-red-500 px-1.5 py-0.5 rounded">停用</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 ml-2">
                  <button onClick={() => window.open(`/vendors/${v.id}/print`, '_blank')} title="列印資料卡／分享 PDF" className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"><Printer size={13} /></button>
                  <button onClick={() => startEdit(v)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"><Pencil size={13} /></button>
                  <button onClick={() => handleDelete(v.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="space-y-1 text-sm text-gray-500">
                {v.contact_name && <div className="text-gray-700">{v.contact_name}</div>}
                {v.phone && <div className="flex items-center gap-1.5"><Phone size={12} className="shrink-0" /> {v.phone}</div>}
                {v.email && <div className="flex items-center gap-1.5"><Mail size={12} className="shrink-0" /><span className="truncate">{v.email}</span></div>}
                {(v.brand_names?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(v.brand_names as string[]).map(b => (
                      <span key={b} className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">{b}</span>
                    ))}
                  </div>
                )}
                {(v.sales_categories?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {(v.sales_categories as string[]).slice(0, 3).map(c => (
                      <span key={c} className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">{c}</span>
                    ))}
                    {(v.sales_categories?.length ?? 0) > 3 && (
                      <span className="text-xs text-purple-500">+{(v.sales_categories?.length ?? 0) - 3}</span>
                    )}
                  </div>
                )}
                {v.repair_phone && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 pt-0.5">
                    <Wrench size={11} className="shrink-0" /> 維修：{v.repair_contact} {v.repair_phone}
                  </div>
                )}
                {v.bank_account && <div className="text-xs text-gray-400 mt-1">{v.bank_name} {v.bank_account}</div>}
                {v.payment_terms && <div className="text-xs text-gray-400">{v.payment_terms}{(v as any).payment_day ? ` / 每月${(v as any).payment_day}號` : ''}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}