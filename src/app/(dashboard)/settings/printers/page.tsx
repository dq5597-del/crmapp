'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Copy, Monitor, Plus, Printer, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase'

type PrinterRow = { id: string; name: string; windows_printer_name: string; branch_id: string | null; label_width_mm: number; label_height_mm: number; is_default: boolean; last_seen_at: string | null }

export default function PrinterSettingsPage() {
  const supabase = createClient()
  const [printers, setPrinters] = useState<PrinterRow[]>([])
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({ name: '花蓮－TSC TTP-345', windows_printer_name: 'TSC TTP-345', branch_id: '', is_default: true })
  const [busy, setBusy] = useState(false)
  const [agent, setAgent] = useState<{ printerId: string; token: string } | null>(null)

  async function load() {
    const [pRes, bRes] = await Promise.all([fetch('/api/print/printers'), supabase.from('branches').select('id,name').order('name')])
    const p = await pRes.json().catch(() => ({}))
    setPrinters(p.printers ?? [])
    setBranches(bRes.data ?? [])
  }
  useEffect(() => { load() }, [])

  async function createPrinter() {
    setBusy(true)
    try {
      const res = await fetch('/api/print/printers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '建立失敗')
      setAgent({ printerId: json.printer.id, token: json.device_token })
      await load()
    } catch (e) { alert((e as Error).message) } finally { setBusy(false) }
  }

  const command = agent ? `powershell -ExecutionPolicy Bypass -File .\\GuanghuiPrintAgent.ps1 -PrinterId "${agent.printerId}" -PrinterToken "${agent.token}"` : ''
  return <div className="mx-auto max-w-4xl p-4 md:p-6">
    <div className="mb-6 flex items-center justify-between">
      <div><h1 className="flex items-center gap-2 text-xl font-bold"><Printer size={20} />印表機管理</h1><p className="mt-1 text-sm text-gray-500">管理平板與手機可使用的遠端印表機。</p></div>
      <button onClick={load} className="rounded-lg border p-2 text-gray-500"><RefreshCw size={16} /></button>
    </div>

    <div className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 font-semibold"><Plus size={17} />新增 Windows 印表機</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">系統顯示名稱<input className="mt-1 w-full rounded-xl border px-3 py-2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label className="text-sm">Windows 印表機名稱<input className="mt-1 w-full rounded-xl border px-3 py-2" value={form.windows_printer_name} onChange={e => setForm({ ...form, windows_printer_name: e.target.value })} /></label>
        <label className="text-sm">所屬通訊處<select className="mt-1 w-full rounded-xl border px-3 py-2" value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}><option value="">全公司共用</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} />設為保固貼紙預設印表機</label>
      </div>
      <button onClick={createPrinter} disabled={busy} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? '建立中…' : '建立印表機'}</button>
    </div>

    {agent && <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-5">
      <h2 className="flex items-center gap-2 font-semibold text-green-900"><CheckCircle2 size={17} />已建立，請在連接 TSC 的電腦啟動列印服務</h2>
      <p className="mt-2 text-xs text-green-700">權杖只顯示這一次，請勿傳給非管理人員。</p>
      <div className="mt-3 flex items-start gap-2 rounded-xl bg-gray-900 p-3 font-mono text-xs text-green-300"><code className="min-w-0 flex-1 break-all">{command}</code><button onClick={() => navigator.clipboard.writeText(command)} title="複製"><Copy size={15} /></button></div>
    </div>}

    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      {printers.map(p => <div key={p.id} className="flex items-center gap-3 border-b p-4 last:border-0"><Monitor className="text-blue-600" size={18} /><div className="min-w-0 flex-1"><div className="font-medium">{p.name}</div><div className="text-xs text-gray-500">{p.windows_printer_name} · {p.label_width_mm} × {p.label_height_mm} mm</div></div><span className={`rounded-full px-2 py-1 text-xs ${p.last_seen_at ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{p.last_seen_at ? `上線 ${new Date(p.last_seen_at).toLocaleString('zh-TW')}` : '尚未連線'}</span></div>)}
      {printers.length === 0 && <div className="p-8 text-center text-sm text-gray-400">尚未建立雲端印表機</div>}
    </div>
  </div>
}
