'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { SystemSettings, UserProfile } from '@/types'
import { Settings, Users, Save, Plus, Trash2, Download, Upload, AlertTriangle, CheckCircle2, Database, Tag } from 'lucide-react'

export default function SettingsPage() {
  const supabase = createClient()
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'company' | 'users' | 'backup' | 'categories'>('company')
  const [expCategories, setExpCategories] = useState<{ id: string; name: string }[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [catSaving, setCatSaving] = useState(false)
  // 備份還原狀態
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreLog, setRestoreLog] = useState<{ ok: boolean; log: string[]; errors: string[]; restoredFrom?: string } | null>(null)
  const [form, setForm] = useState({
    company_name: '',
    company_phone: '',
    company_address: '',
    company_email: '',
    bank_name: '',
    bank_account: '',
    bank_account_name: '',
    payment_terms: '',
    delivery_days: 14,
    valid_days: 30,
    quote_notes: '',
  })
  // 動態備註清單
  const [noteItems, setNoteItems] = useState<string[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('system_settings').select('*').single(),
      supabase.from('user_profiles').select('*').order('created_at'),
    ]).then(([sRes, uRes]) => {
      if (sRes.data) {
        setSettings(sRes.data)
        setForm({
          company_name: sRes.data.company_name ?? '',
          company_phone: sRes.data.company_phone ?? '',
          company_address: sRes.data.company_address ?? '',
          company_email: sRes.data.company_email ?? '',
          bank_name: sRes.data.bank_name ?? '',
          bank_account: sRes.data.bank_account ?? '',
          bank_account_name: sRes.data.bank_account_name ?? '',
          payment_terms: sRes.data.payment_terms ?? '',
          delivery_days: sRes.data.delivery_days ?? 14,
          valid_days: sRes.data.valid_days ?? 30,
          quote_notes: sRes.data.quote_notes ?? '',
        })
        // 載入動態備註清單
        const rawItems = (sRes.data as any).default_note_items
        if (Array.isArray(rawItems)) setNoteItems(rawItems)
        else setNoteItems([])
      }
      setUsers(uRes.data ?? [])
      setLoading(false)
    })
    fetchExpCategories()
  }, [])

  async function fetchExpCategories() {
    const res = await fetch('/api/accounting/categories')
    const data = await res.json()
    setExpCategories(data.categories || [])
  }

  async function addCategory() {
    if (!newCatName.trim()) return
    setCatSaving(true)
    await fetch('/api/accounting/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCatName.trim() }) })
    setNewCatName('')
    await fetchExpCategories()
    setCatSaving(false)
  }

  async function deleteCategory(id: string) {
    if (!confirm('確定刪除此科目？')) return
    await fetch('/api/accounting/categories', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    fetchExpCategories()
  }

  async function handleSave() {
    setSaving(true)
    if (settings?.id) {
      await supabase.from('system_settings').update({
        ...form,
        default_note_items: noteItems.filter(n => n.trim()),
      } as any).eq('id', settings.id)
    }
    setSaving(false)
    alert('✅ 已儲存系統設定')
  }

  async function handleBackup() {
    setBackingUp(true)
    try {
      const res = await fetch('/api/backup')
      const blob = await res.blob()
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `crm-backup-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert('備份失敗：' + e.message)
    }
    setBackingUp(false)
  }

  async function handleRestore(file: File) {
    if (!confirm(`⚠️ 確定要還原備份「${file.name}」？\n\n這將會清除所有現有資料後重新匯入，此操作無法復原！`)) return
    setRestoring(true)
    setRestoreLog(null)
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      })
      const result = await res.json()
      setRestoreLog(result)
    } catch (e: any) {
      setRestoreLog({ ok: false, log: [], errors: ['還原失敗：' + e.message] })
    }
    setRestoring(false)
  }

  function addNoteItem() {
    setNoteItems(prev => [...prev, ''])
  }

  function updateNoteItem(idx: number, val: string) {
    setNoteItems(prev => prev.map((item, i) => i === idx ? val : item))
  }

  function removeNoteItem(idx: number) {
    setNoteItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleRoleChange(userId: string, role: string) {
    await supabase.from('user_profiles').update({ role }).eq('id', userId)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: role as any } : u))
  }

  if (loading) return <div className="p-8 text-center text-gray-400">載入中...</div>

  const inputClass = "w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5"

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Settings size={20} className="text-gray-600" />
        <h1 className="text-xl font-bold text-gray-900">系統設定</h1>
      </div>

      {/* Tab */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1">
        {[
          { key: 'company', label: '公司設定', icon: Settings },
          { key: 'users', label: '帳號管理', icon: Users },
          { key: 'categories', label: '支出科目', icon: Tag },
          { key: 'backup', label: '備份還原', icon: Database },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={`flex items-center gap-1.5 flex-1 justify-center px-3 py-2 rounded-lg text-sm font-medium transition ${tab === key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {tab === 'company' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-5">
          <h2 className="font-semibold text-gray-900">公司資訊</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>公司名稱</label>
              <input value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>公司電話</label>
              <input value={form.company_phone} onChange={e => setForm(p => ({ ...p, company_phone: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>公司 Email</label>
              <input value={form.company_email} onChange={e => setForm(p => ({ ...p, company_email: e.target.value }))} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>公司地址</label>
              <input value={form.company_address} onChange={e => setForm(p => ({ ...p, company_address: e.target.value }))} className={inputClass} />
            </div>
          </div>

          <hr className="border-gray-100" />
          <h2 className="font-semibold text-gray-900">匯款資訊</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>銀行名稱</label>
              <input value={form.bank_name} onChange={e => setForm(p => ({ ...p, bank_name: e.target.value }))} className={inputClass} placeholder="第一銀行花蓮分行" />
            </div>
            <div>
              <label className={labelClass}>帳號</label>
              <input value={form.bank_account} onChange={e => setForm(p => ({ ...p, bank_account: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>戶名</label>
              <input value={form.bank_account_name} onChange={e => setForm(p => ({ ...p, bank_account_name: e.target.value }))} className={inputClass} />
            </div>
          </div>

          <hr className="border-gray-100" />
          <h2 className="font-semibold text-gray-900">報價單預設值</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>預設付款條件</label>
              <input value={form.payment_terms} onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))} className={inputClass} placeholder="30天月結" />
            </div>
            <div>
              <label className={labelClass}>預設交貨工期（天）</label>
              <input type="number" value={form.delivery_days} onChange={e => setForm(p => ({ ...p, delivery_days: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>報價有效天數</label>
              <input type="number" value={form.valid_days} onChange={e => setForm(p => ({ ...p, valid_days: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>報價單預設備註（固定文字，附加在每張報價單最後）</label>
              <textarea value={form.quote_notes} onChange={e => setForm(p => ({ ...p, quote_notes: e.target.value }))} rows={2} className={inputClass + ' resize-none'} />
            </div>
          </div>

          <hr className="border-gray-100" />
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">印列備註條目</h2>
            <button
              type="button"
              onClick={addNoteItem}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus size={15} />新增條目
            </button>
          </div>
          <p className="text-xs text-gray-400 -mt-3">每條會在印列時依序出現在「備註事項」，可自由新增、刪除、修改</p>

          <div className="space-y-2">
            {noteItems.length === 0 && (
              <p className="text-sm text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-xl">
                尚無備註條目，點「新增條目」加入
              </p>
            )}
            {noteItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-gray-400 text-sm w-5 shrink-0 text-right">{idx + 1}.</span>
                <input
                  value={item}
                  onChange={e => updateNoteItem(idx, e.target.value)}
                  className={inputClass + ' flex-1'}
                  placeholder={`備註條目 ${idx + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeNoteItem(idx)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60">
              <Save size={15} />
              {saving ? '儲存中...' : '儲存設定'}
            </button>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-4">帳號管理</h2>
          {users.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">尚無帳號資料</p>
          ) : (
            <div className="space-y-3">
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl">
                  <div>
                    <div className="font-medium text-gray-900">{u.full_name ?? '未設定名稱'}</div>
                    <div className="text-xs text-gray-500">ID: {u.id.slice(0, 8)}...</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.is_active ? '啟用' : '停用'}
                    </span>
                    <select
                      value={u.role}
                      onChange={e => handleRoleChange(u.id, e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="user">一般使用者</option>
                      <option value="manager">主管</option>
                      <option value="admin">管理員</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-4">
            新增使用者：請到 Supabase Dashboard → Authentication → Users → Invite user
          </p>
        </div>
      )}

      {tab === 'categories' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-semibold text-gray-900">支出科目管理</h2>
          <p className="text-xs text-gray-400">這些科目會出現在支出記錄的「科目」下拉選單中，可自由新增或刪除。</p>
          <div className="flex gap-2">
            <input
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCategory()}
              placeholder="輸入新科目名稱"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
            <button onClick={addCategory} disabled={catSaving || !newCatName.trim()}
              className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50">
              <Plus size={14} /> 新增
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {expCategories.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">尚無科目</p>}
            {expCategories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-800">{cat.name}</span>
                <button onClick={() => deleteCategory(cat.id)} className="text-gray-300 hover:text-red-500 transition">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'backup' && (
        <div className="space-y-4">
          {/* 備份 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-50 rounded-xl">
                <Download size={22} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">匯出備份</h3>
                <p className="text-sm text-gray-500 mb-4">
                  將所有客戶、報價單、產品、廠商等資料匯出為 JSON 檔案，建議定期備份保存。
                </p>
                <button
                  onClick={handleBackup}
                  disabled={backingUp}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-medium"
                >
                  <Download size={15} />
                  {backingUp ? '備份中...' : '立即備份下載'}
                </button>
              </div>
            </div>
          </div>

          {/* 還原 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-50 rounded-xl">
                <Uploa