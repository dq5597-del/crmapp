'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { SystemSettings, UserProfile } from '@/types'
import { Settings, Users, Save, Plus, Trash2, Download, Upload, AlertTriangle, CheckCircle2, Database, Tag, History, Lock } from 'lucide-react'

type TabKey = 'company' | 'users' | 'backup' | 'categories' | 'audit'

export default function SettingsPage() {
  const supabase = createClient()
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [users, setUsers] = useState<UserProfile[]>([])
  // 角色清單（與權限管理同一份 app_roles，帳號管理下拉動態載入）
  const [roles, setRoles] = useState<{ key: string; name: string }[]>([])
  // 新增使用者
  const [showNewUser, setShowNewUser] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', full_name: '', role: 'user', password: '' })
  const [newUserSaving, setNewUserSaving] = useState(false)
  const [newUserError, setNewUserError] = useState('')
  const [userSaveErrors, setUserSaveErrors] = useState<Record<string, string>>({})
  function setUserSaveError(userId: string, message: string | null) {
    setUserSaveErrors(prev => {
      const next = { ...prev }
      if (message) next[userId] = message
      else delete next[userId]
      return next
    })
  }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<TabKey>('company')
  const [myRole, setMyRole] = useState<string | null>(null)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const isAdmin = myRole === 'admin'
  const [expCategories, setExpCategories] = useState<{ id: string; name: string }[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [catSaving, setCatSaving] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreLog, setRestoreLog] = useState<{ ok: boolean; log: string[]; errors: string[]; restoredFrom?: string } | null>(null)
  const [form, setForm] = useState({
    staff_register_code: '',
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
    target_needs_clients: 20,
    target_planning_clients: 20,
    target_monthly_revenue: 500000,
    target_conversion_rate: 30,
    product_web_fields_expanded: false,
  })
  const [noteItems, setNoteItems] = useState<string[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('system_settings').select('*').single(),
      supabase.from('user_profiles').select('*').order('created_at'),
    ]).then(([sRes, uRes]) => {
      if (sRes.data) {
        setSettings(sRes.data)
        setForm({
          staff_register_code: (sRes.data as any).staff_register_code ?? '',
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
          target_needs_clients: (sRes.data as any).target_needs_clients ?? 20,
          target_planning_clients: (sRes.data as any).target_planning_clients ?? 20,
          target_monthly_revenue: (sRes.data as any).target_monthly_revenue ?? 500000,
          target_conversion_rate: (sRes.data as any).target_conversion_rate ?? 30,
          product_web_fields_expanded: (sRes.data as any).product_web_fields_expanded ?? false,
        })
        const rawItems = (sRes.data as any).default_note_items
        if (Array.isArray(rawItems)) setNoteItems(rawItems)
        else setNoteItems([])
      }
      setUsers(uRes.data ?? [])
      setLoading(false)
    })
    fetchExpCategories()
    fetchMyRole()
    fetchRoles()
  }, [])

  async function fetchRoles() {
    const { data } = await supabase.from('app_roles').select('key, name').order('sort_order')
    if (data) setRoles(data)
  }

  async function fetchMyRole() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setMyRole('user'); return }
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
    setMyRole((profile as any)?.role ?? 'user')
  }

  // 角色權限落地：帳號管理／備份還原／稽核紀錄僅限管理員，若非管理員誤留在受限分頁則導回公司設定
  useEffect(() => {
    if (myRole !== null && myRole !== 'admin' && (tab === 'users' || tab === 'backup' || tab === 'audit')) {
      setTab('company')
    }
  }, [myRole, tab])

  async function fetchAuditLogs() {
    setAuditLoading(true)
    setAuditError(null)
    const { data, error } = await supabase.from('audit_logs').select('*').order('changed_at', { ascending: false }).limit(50)
    if (error) {
      setAuditError('尚未啟用稽核紀錄功能：請先到 Supabase SQL Editor 執行 supabase/schema_audit_log.sql')
      setAuditLoading(false)
      return
    }
    const changedByIds = Array.from(new Set((data ?? []).map((l: any) => l.changed_by).filter(Boolean)))
    let nameMap: Record<string, string> = {}
    if (changedByIds.length > 0) {
      const { data: profiles } = await supabase.from('user_profiles').select('id, full_name').in('id', changedByIds)
      nameMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.full_name ?? '未命名使用者']))
    }
    setAuditLogs((data ?? []).map((l: any) => ({ ...l, changed_by_name: l.changed_by ? (nameMap[l.changed_by] ?? '—') : '系統' })))
    setAuditLoading(false)
  }

  useEffect(() => {
    if (tab === 'audit' && isAdmin) fetchAuditLogs()
  }, [tab, isAdmin])

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
      const payload = {
        ...form,
        default_note_items: noteItems.filter(n => n.trim()),
      } as any
      const { error } = await supabase.from('system_settings').update(payload).eq('id', settings.id)
      if (error) {
        // 目標欄位可能尚未執行 supabase/schema_dashboard_targets.sql 遷移，先移除目標欄位重試一次
        const { target_needs_clients, target_planning_clients, target_monthly_revenue, target_conversion_rate, ...fallback } = payload
        const { error: error2 } = await supabase.from('system_settings').update(fallback).eq('id', settings.id)
        if (error2) {
          alert('儲存失敗：' + error2.message)
          setSaving(false)
          return
        }
        alert('已儲存系統設定（業務目標欄位尚未生效：請先到 Supabase SQL Editor 執行 supabase/schema_dashboard_targets.sql 後再試一次）')
        setSaving(false)
        return
      }
    }
    setSaving(false)
    alert('已儲存系統設定')
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
    if (!confirm(`確定要還原備份「${file.name}」？這將會清除所有現有資料後重新匯入，此操作無法復原！`)) return
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
    const { data, error } = await supabase.from('user_profiles').update({ role }).eq('id', userId).select()
    if (error) { console.error('[user_profiles update error]', error); setUserSaveError(userId, '更新角色失敗：' + error.message); return }
    if (!data || data.length === 0) { console.error('[user_profiles update] zero rows affected (RLS blocked?)', { userId, role }); setUserSaveError(userId, '更新角色失敗：資料庫拒絕了這筆修改（權限規則問題）'); return }
    setUserSaveError(userId, null)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: role as any } : u))
  }

  function handleNameInput(userId: string, full_name: string) {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, full_name } : u))
  }

  async function handleNameSave(userId: string, full_name: string) {
    const { data, error } = await supabase.from('user_profiles').update({ full_name: full_name.trim() || null }).eq('id', userId).select()
    if (error) { console.error('[user_profiles update error]', error); setUserSaveError(userId, '儲存姓名失敗：' + error.message); return }
    if (!data || data.length === 0) { console.error('[user_profiles update] zero rows affected (RLS blocked?)', { userId, full_name }); setUserSaveError(userId, '儲存姓名失敗：資料庫拒絕了這筆修改（權限規則問題）'); return }
    setUserSaveError(userId, null)
  }

  async function handleCreateUser() {
    setNewUserError('')
    setNewUserSaving(true)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sess.session?.access_token ?? ''}`,
        },
        body: JSON.stringify(newUser),
      })
      const json = await res.json()
      if (!res.ok) { setNewUserError(json.error || '新增失敗'); return }
      setUsers(prev => [...prev, json.user])
      alert(`已建立帳號 ${newUser.email}\n請把臨時密碼交給該員工，並提醒他登入後自行修改密碼。`)
      setNewUser({ email: '', full_name: '', role: 'user', password: '' })
      setShowNewUser(false)
    } catch (e) {
      console.error(e)
      setNewUserError('新增失敗，請稍後再試')
    } finally {
      setNewUserSaving(false)
    }
  }

  async function handleActiveToggle(userId: string, is_active: boolean) {
    // 透過後端 API：同步更新 user_profiles.is_active 與 auth 帳號停權狀態
    // （未啟用 = 停權 = 完全無法登入，不只是前端擋）
    try {
      const { data: sess } = await supabase.auth.getSession()
      const res = await fetch(`/api/admin/users/${userId}/active`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sess.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ is_active }),
      })
      const json = await res.json()
      if (res.ok) {
        setUserSaveError(userId, '')
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active } : u))
        return
      }
      setUserSaveError(userId, json.error || '更新啟用狀態失敗')
      return
    } catch (e) {
      console.error(e)
      // 後端不可用時退回直接更新（僅改旗標，不影響登入權限）
    }

    const { data, error } = await supabase.from('user_profiles').update({ is_active }).eq('id', userId).select()
    if (error) { console.error('[user_profiles update error]', error); setUserSaveError(userId, '更新啟用狀態失敗：' + error.message); return }
    if (!data || data.length === 0) { console.error('[user_profiles update] zero rows affected (RLS blocked?)', { userId, is_active }); setUserSaveError(userId, '更新啟用狀態失敗：資料庫拒絕了這筆修改（權限規則問題）'); return }
    setUserSaveError(userId, null)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active } : u))
  }

  if (loading) return <div className="p-8 text-center text-gray-400">載入中...</div>

  const inputClass = "w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5"

  // 角色下拉選項：優先用 app_roles；載入前／表尚未建立時退回基本三種
  const roleOptions = roles.length > 0 ? roles : [
    { key: 'user', name: '一般使用者' },
    { key: 'manager', name: '主管' },
    { key: 'admin', name: '管理員' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Settings size={20} className="text-gray-600" />
        <h1 className="text-xl font-bold text-gray-900">系統設定</h1>
      </div>

      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 flex-wrap">
        {[
          { key: 'company', label: '公司設定', icon: Settings, adminOnly: false },
          { key: 'users', label: '帳號管理', icon: Users, adminOnly: true },
          { key: 'categories', label: '支出科目', icon: Tag, adminOnly: false },
          { key: 'backup', label: '備份還原', icon: Database, adminOnly: true },
          { key: 'audit', label: '稽核紀錄', icon: History, adminOnly: true },
        ].filter(t => !t.adminOnly || isAdmin).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key as TabKey)}
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
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">員工註冊碼</label>
              <input value={form.staff_register_code} onChange={e => setForm(p => ({ ...p, staff_register_code: e.target.value }))} className={inputClass} placeholder="例：GH2026" />
              <p className="text-[11px] text-gray-400 mt-1">員工在登入頁「員工註冊」時需輸入此碼；註冊後仍須管理員在「帳號管理」啟用才能登入。留白則停用註冊功能。</p>
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
              <label className={labelClass}>報價單預設備註</label>
              <textarea value={form.quote_notes} onChange={e => setForm(p => ({ ...p, quote_notes: e.target.value }))} rows={2} className={inputClass + ' resize-none'} />
            </div>
          </div>

          <hr className="border-gray-100" />
          <h2 className="font-semibold text-gray-900">產品管理設定</h2>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="product_web_fields_expanded" checked={form.product_web_fields_expanded} onChange={e => setForm(p => ({ ...p, product_web_fields_expanded: e.target.checked }))} className="accent-blue-600 w-4 h-4" />
            <label htmlFor="product_web_fields_expanded" className="text-sm text-gray-700">產品編輯頁「網站欄位」預設展開（未勾選則預設收合，需點擊才展開）</label>
          </div>

          <hr className="border-gray-100" />
          <h2 className="font-semibold text-gray-900">戰情室業務目標</h2>
          <p className="text-xs text-gray-400 -mt-3">用來計算戰情室 KPI 卡片的達成率，可依季度或年度調整。</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>有需求單位目標（位）</label>
              <input type="number" value={form.target_needs_clients} onChange={e => setForm(p => ({ ...p, target_needs_clients: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>規劃中單位目標（位）</label>
              <input type="number" value={form.target_planning_clients} onChange={e => setForm(p => ({ ...p, target_planning_clients: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>本月營收目標（元）</label>
              <input type="number" value={form.target_monthly_revenue} onChange={e => setForm(p => ({ ...p, target_monthly_revenue: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>報價轉換率目標（%）</label>
              <input type="number" value={form.target_conversion_rate} onChange={e => setForm(p => ({ ...p, target_conversion_rate: Number(e.target.value) }))} className={inputClass} />
            </div>
          </div>

          <hr className="border-gray-100" />
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">印列備註條目</h2>
            <button type="button" onClick={addNoteItem}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
              <Plus size={15} />新增條目
            </button>
          </div>
          <p className="text-xs text-gray-400 -mt-3">每條會在印列時依序出現在備註事項，可自由新增、刪除、修改</p>

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
                <button type="button" onClick={() => removeNoteItem(idx)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition shrink-0">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60">
              <Save size={15} />
              {saving ? '儲存中...' : '儲存設定'}
            </button>
          </div>
        </div>
      )}

      {tab === 'users' && isAdmin && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="font-semibold text-gray-900">員工建檔 / 帳號管理</h2>
            <button
              type="button"
              onClick={() => { setShowNewUser(v => !v); setNewUserError('') }}
              className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
            >
              {showNewUser ? '取消' : '＋ 新增使用者'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            在此設定每個帳號的顯示姓名，設定後即可在報價單、銷貨單、訂購單的「業務員」欄位選擇。停用的帳號不會出現在業務員選單中。
          </p>

          {showNewUser && (
            <div className="border border-blue-100 bg-blue-50/50 rounded-xl p-4 mb-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Email（登入帳號）*</label>
                  <input value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} className={inputClass} placeholder="staff@example.com" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">姓名 *</label>
                  <input value={newUser.full_name} onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))} className={inputClass} placeholder="王小明" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">角色</label>
                  <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))} className={inputClass}>
                    {roleOptions.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">臨時密碼 *（至少 8 碼）</label>
                  <input value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} className={inputClass} placeholder="交給員工，請他登入後自行修改" />
                </div>
              </div>
              {newUserError && <div className="text-xs text-red-600 font-medium">{newUserError}</div>}
              <div className="flex justify-end">
                <button type="button" onClick={handleCreateUser} disabled={newUserSaving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-4 py-2 rounded-lg">
                  {newUserSaving ? '建立中…' : '建立帳號'}
                </button>
              </div>
            </div>
          )}
          {users.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">尚無帳號資料</p>
          ) : (
            <div className="space-y-3">
              {users.map(u => (
                <div key={u.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border border-gray-100 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <label className="text-xs text-gray-500 mb-1 block">姓名（業務員選單顯示用）</label>
                    <input
                      value={u.full_name ?? ''}
                      onChange={e => handleNameInput(u.id, e.target.value)}
                      onBlur={e => handleNameSave(u.id, e.target.value)}
                      placeholder="輸入員工姓名"
                      className="w-full max-w-xs px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="text-xs text-gray-400 mt-1">ID: {u.id.slice(0, 8)}...</div>
                    {userSaveErrors[u.id] && (
                      <div className="text-xs text-red-600 mt-1 font-medium">{userSaveErrors[u.id]}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleActiveToggle(u.id, !u.is_active)}
                      className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                    >
                      {u.is_active ? '啟用中（點擊停用）' : '已停用（點擊啟用）'}
                    </button>
                    <select value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {roleOptions.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-4">
            新增帳號可用上方「＋ 新增使用者」直接建立（需管理員權限）。員工也可自行到登入頁「員工註冊」並輸入公司註冊碼，註冊後需在此啟用才能登入。
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

      {tab === 'backup' && isAdmin && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-50 rounded-xl">
                <Download size={22} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">匯出備份</h3>
                <p className="text-sm text-gray-500 mb-4">
                  將所有單位名稱、報價單、產品、廠商等資料匯出為 JSON 檔案，建議定期備份保存。
                </p>
                <button onClick={handleBackup} disabled={backingUp}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-medium">
                  <Download size={15} />
                  {backingUp ? '備份中...' : '立即備份下載'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-50 rounded-xl">
                <Upload size={22} className="text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">還原備份</h3>
                <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-xl p-3 mb-4">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>還原會清除所有現有資料後重新匯入，操作前請確認已備份最新資料。</span>
                </div>
                <label className={`flex items-center gap-2 border-2 border-dashed border-gray-200 hover:border-blue-400 rounded-xl px-5 py-3 cursor-pointer text-sm text-gray-600 hover:text-blue-600 transition w-fit ${restoring ? 'opacity-50 pointer-events-none' : ''}`}>
                  <Upload size={15} />
                  {restoring ? '還原中，請稍候...' : '選擇備份檔案（.json）'}
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { handleRestore(f); e.target.value = '' } }}
                  />
                </label>
              </div>
            </div>
          </div>

          {restoreLog && (
            <div className={`rounded-2xl p-5 border ${restoreLog.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 font-semibold mb-3 text-sm">
                {restoreLog.ok
                  ? <><CheckCircle2 size={16} className="text-green-600" /><span className="text-green-800">還原成功</span></>
                  : <><AlertTriangle size={16} className="text-red-600" /><span className="text-red-800">還原時發生錯誤</span></>
                }
                {restoreLog.restoredFrom && (
                  <span className="font-normal text-gray-500 ml-auto">
                    備份時間：{new Date(restoreLog.restoredFrom).toLocaleString('zh-TW')}
                  </span>
                )}
              </div>
              {restoreLog.errors.length > 0 && (
                <div className="mb-2">
                  {restoreLog.errors.map((e, i) => <p key={i} className="text-xs text-red-700">❌ {e}</p>)}
                </div>
              )}
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer hover:text-gray-700">
                  查看詳細記錄（{restoreLog.log.length} 步驟）
                </summary>
                <div className="mt-2 space-y-0.5 font-mono">
                  {restoreLog.log.map((l, i) => <p key={i}>✓ {l}</p>)}
                </div>
              </details>
            </div>
          )}
        </div>
      )}

      {tab === 'audit' && isAdmin && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <Lock size={14} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900">操作稽核紀錄</h2>
          </div>
          <p className="text-xs text-gray-400 mb-4">記錄單位名稱、報價單、銷貨單、應收／應付帳款、叫修單的新增、修改、刪除操作，僅管理員可查閱。</p>
          {auditLoading ? (
            <p className="text-center text-gray-400 text-sm py-8">載入中...</p>
          ) : auditError ? (
            <p className="text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-xl text-sm py-4 px-4">{auditError}</p>
          ) : auditLogs.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">尚無稽核紀錄</p>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[32rem] overflow-y-auto">
              {auditLogs.map(log => (
                <div key={log.id} className="py-2.5 flex items-center justify-between text-sm gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      log.action === 'INSERT' ? 'bg-green-100 text-green-700' :
                      log.action === 'DELETE' ? 'bg-red-100 text-red-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>{log.action === 'INSERT' ? '新增' : log.action === 'DELETE' ? '刪除' : '修改'}</span>
                    <span className="text-gray-700 truncate">{log.table_name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-gray-500 text-xs">{log.changed_by_name}</div>
                    <div className="text-gray-400 text-xs">{new Date(log.changed_at).toLocaleString('zh-TW')}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
