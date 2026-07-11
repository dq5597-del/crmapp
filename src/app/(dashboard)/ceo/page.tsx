'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import {
  Crown, TrendingDown, TrendingUp, Wallet, Filter, Package, Percent,
  ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Settings2, X,
} from 'lucide-react'

const num = (v: any) => Number(v ?? 0) || 0
const money = (v: any) => `NT$${Math.round(num(v)).toLocaleString()}`
const short = (v: any) => {
  const n = Math.round(num(v))
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)} 萬`
  return n.toLocaleString()
}
const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

type Light = 'green' | 'amber' | 'red'
const LIGHT_STYLE: Record<Light, string> = {
  green: 'bg-green-50 border-green-200',
  amber: 'bg-amber-50 border-amber-200',
  red: 'bg-red-50 border-red-200',
}
const DOT: Record<Light, string> = {
  green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500',
}

const DEAD_STOCK_DAYS = 180

export default function CeoDashboard() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<any>(null)
  const [receivables, setReceivables] = useState<any[]>([])
  const [payables, setPayables] = useState<any[]>([])
  const [quotes, setQuotes] = useState<any[]>([])
  const [aging, setAging] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [crew, setCrew] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [soItems, setSoItems] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])

  const [cashOpen, setCashOpen] = useState(false)
  const [cashForm, setCashForm] = useState<any>({})

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [s, r, p, q, ag, pr, cw, sv, si, pd] = await Promise.all([
      supabase.from('system_settings').select('*').limit(1).maybeSingle(),
      supabase.from('receivables').select('*, clients(company_name)').neq('status', '已收款'),
      supabase.from('payables').select('*, vendors(company_name)').neq('status', '已付款'),
      supabase.from('quotes').select('id, quote_no, project_name, total_amount, status, win_probability, expected_close_date, client_id, clients(company_name)'),
      supabase.from('v_inventory_aging').select('*'),
      supabase.from('projects').select('id, project_name, status, budget, revenue, equipment_cost, client_id, clients(company_name)'),
      supabase.from('project_crew').select('project_id, cost'),
      supabase.from('service_requests').select('id, project_id, actual_repair_cost'),
      supabase.from('sales_order_items').select('product_id, product_name, model, quantity, unit_price, amount'),
      supabase.from('products').select('id, brand, product_name, model, cost_price'),
    ])
    setSettings(s.data ?? null)
    setReceivables(r.data ?? [])
    setPayables(p.data ?? [])
    setQuotes(q.data ?? [])
    setAging(ag.data ?? [])
    setProjects(pr.data ?? [])
    setCrew(cw.data ?? [])
    setServices(sv.data ?? [])
    setSoItems(si.data ?? [])
    setProducts(pd.data ?? [])
    setLoading(false)
  }

  /* ─────────── ① 現金流量預估（未來 12 週） ─────────── */
  const cash = useMemo(() => {
    const start = num(settings?.cash_balance)
    const safety = num(settings?.cash_safety_line)
    const weeks: { label: string; in: number; out: number; end: number; from: Date; to: Date }[] = []
    let bal = start
    const today = new Date(new Date().toDateString())

    for (let w = 0; w < 12; w++) {
      const from = new Date(today); from.setDate(today.getDate() + w * 7)
      const to = new Date(from); to.setDate(from.getDate() + 6)
      const inSum = receivables
        .filter(x => x.due_date && new Date(x.due_date) >= from && new Date(x.due_date) <= to)
        .reduce((s, x) => s + num(x.balance ?? x.amount), 0)
      const outSum = payables
        .filter(x => x.due_date && new Date(x.due_date) >= from && new Date(x.due_date) <= to)
        .reduce((s, x) => s + num(x.balance ?? x.amount), 0)
      bal = bal + inSum - outSum
      weeks.push({
        label: `${from.getMonth() + 1}/${from.getDate()}`,
        in: inSum, out: outSum, end: bal, from, to,
      })
    }

    // 逾期未收（已過期的應收，不列入未來週，但要單獨提醒）
    const overdue = receivables
      .filter(x => x.due_date && new Date(x.due_date) < today)
      .reduce((s, x) => s + num(x.balance ?? x.amount), 0)

    const lowest = weeks.reduce((m, w) => (w.end < m.end ? w : m), weeks[0])
    const light: Light = !settings?.cash_balance_date ? 'amber'
      : lowest && lowest.end < 0 ? 'red'
      : lowest && safety > 0 && lowest.end < safety ? 'amber'
      : 'green'

    return { start, safety, weeks, lowest, overdue, light, max: Math.max(...weeks.map(w => Math.abs(w.end)), 1) }
  }, [settings, receivables, payables])

  /* ─────────── ② 業務漏斗與預測 ─────────── */
  const funnel = useMemo(() => {
    const open = quotes.filter(q => !['已結案', '已取消', '未成交'].includes(q.status ?? ''))
    const DEFAULT_P: Record<string, number> = {
      '草稿': 10, '已送出': 30, '追蹤中': 50, '已確認': 90, '已轉訂購單': 90,
    }
    const rows = open.map(q => ({
      ...q,
      p: q.win_probability != null ? num(q.win_probability) : (DEFAULT_P[q.status ?? ''] ?? 30),
      weighted: num(q.total_amount) * ((q.win_probability != null ? num(q.win_probability) : (DEFAULT_P[q.status ?? ''] ?? 30)) / 100),
    }))
    const total = rows.reduce((s, r) => s + num(r.total_amount), 0)
    const weighted = rows.reduce((s, r) => s + r.weighted, 0)

    // 客戶集中度：最大客戶佔加權預測比例
    const byClient: Record<string, { name: string; amt: number }> = {}
    rows.forEach(r => {
      const k = r.client_id ?? 'unknown'
      const name = (r as any).clients?.company_name ?? '未指定客戶'
      byClient[k] = { name, amt: (byClient[k]?.amt ?? 0) + r.weighted }
    })
    const clientRank = Object.values(byClient).sort((a, b) => b.amt - a.amt)
    const topShare = weighted > 0 && clientRank[0] ? clientRank[0].amt / weighted : 0

    const byStage: Record<string, { count: number; amt: number }> = {}
    rows.forEach(r => {
      const k = r.status ?? '未分類'
      byStage[k] = { count: (byStage[k]?.count ?? 0) + 1, amt: (byStage[k]?.amt ?? 0) + num(r.total_amount) }
    })

    const light: Light = rows.length === 0 ? 'red' : topShare > 0.5 ? 'amber' : 'green'
    return { rows: rows.sort((a, b) => b.weighted - a.weighted), total, weighted, byStage, clientRank, topShare, light }
  }, [quotes])

  /* ─────────── ③ 毛利分析（硬體 + 專案） ─────────── */
  const margin = useMemo(() => {
    const costMap: Record<string, number> = {}
    const brandMap: Record<string, string> = {}
    products.forEach(p => { costMap[p.id] = num(p.cost_price); brandMap[p.id] = p.brand ?? '未分類' })

    // 硬體：以銷貨品項計算
    const byBrand: Record<string, { rev: number; cost: number; qty: number }> = {}
    let known = 0, unknown = 0
    soItems.forEach(it => {
      const rev = num(it.amount) || num(it.quantity) * num(it.unit_price)
      const c = it.product_id != null && costMap[it.product_id] != null ? costMap[it.product_id] : null
      if (c == null || c === 0) { unknown += rev; return }
      known += rev
      const b = brandMap[it.product_id] ?? '未分類'
      byBrand[b] = {
        rev: (byBrand[b]?.rev ?? 0) + rev,
        cost: (byBrand[b]?.cost ?? 0) + c * num(it.quantity),
        qty: (byBrand[b]?.qty ?? 0) + num(it.quantity),
      }
    })
    const brands = Object.entries(byBrand)
      .map(([b, v]) => ({ brand: b, ...v, gp: v.rev - v.cost, rate: v.rev > 0 ? (v.rev - v.cost) / v.rev : 0 }))
      .sort((a, b) => b.gp - a.gp)

    // 專案：收入 − 設備成本 − 人工 − 維修
    const laborMap: Record<string, number> = {}
    crew.forEach(c => { laborMap[c.project_id] = (laborMap[c.project_id] ?? 0) + num(c.cost) })
    const repairMap: Record<string, number> = {}
    services.forEach(s => { if (s.project_id) repairMap[s.project_id] = (repairMap[s.project_id] ?? 0) + num(s.actual_repair_cost) })

    const projRows = projects.map(p => {
      const rev = num(p.revenue) || num(p.budget)
      const eq = num(p.equipment_cost)
      const labor = laborMap[p.id] ?? 0
      const repair = repairMap[p.id] ?? 0
      const gp = rev - eq - labor - repair
      return {
        id: p.id, name: p.project_name, client: (p as any).clients?.company_name ?? '—',
        status: p.status, rev, eq, labor, repair, gp,
        rate: rev > 0 ? gp / rev : 0,
        hasData: rev > 0,
      }
    }).filter(p => p.hasData).sort((a, b) => a.rate - b.rate)   // 最差的排前面（例外管理）

    const lossProjects = projRows.filter(p => p.gp < 0)
    const avgRate = projRows.length
      ? projRows.reduce((s, p) => s + p.rate, 0) / projRows.length : 0

    const light: Light = lossProjects.length > 0 ? 'red'
      : brands.length === 0 && projRows.length === 0 ? 'amber'
      : avgRate > 0 && avgRate < 0.15 ? 'amber' : 'green'

    return { brands, projRows, lossProjects, avgRate, unknownRev: unknown, knownRev: known, light }
  }, [soItems, products, projects, crew, services])

  /* ─────────── ④ 庫存週轉與呆滯 ─────────── */
  const inv = useMemo(() => {
    const withStock = aging.filter(a => num(a.stock_qty) > 0)
    const totalValue = withStock.reduce((s, a) => s + num(a.stock_value), 0)
    const dead = withStock.filter(a => a.days_since_move == null || num(a.days_since_move) >= DEAD_STOCK_DAYS)
      .sort((a, b) => num(b.stock_value) - num(a.stock_value))
    const deadValue = dead.reduce((s, a) => s + num(a.stock_value), 0)
    const deadShare = totalValue > 0 ? deadValue / totalValue : 0

    const light: Light = totalValue === 0 ? 'green'
      : deadShare > 0.3 ? 'red' : deadShare > 0.1 ? 'amber' : 'green'

    return { withStock, totalValue, dead, deadValue, deadShare, light }
  }, [aging])

  async function saveCash() {
    if (!settings?.id) { alert('找不到系統設定'); return }
    const payload = {
      cash_balance: num(cashForm.cash_balance),
      cash_safety_line: num(cashForm.cash_safety_line),
      cash_balance_date: cashForm.cash_balance_date || new Date().toISOString().slice(0, 10),
    }
    const { error } = await supabase.from('system_settings').update(payload).eq('id', settings.id)
    if (error) { alert('儲存失敗：' + error.message); return }
    setCashOpen(false); fetchAll()
  }

  if (loading) return <div className="p-10 text-center text-gray-400">載入中…</div>

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Crown className="text-amber-500" size={22} />
        <h1 className="text-xl font-bold text-gray-900">CEO 戰情室</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">例外管理：只有亮燈的地方才需要往下追。</p>

      {/* ① 現金 */}
      <Panel
        light={cash.light}
        icon={<Wallet size={18} />}
        title="現金流量預估（未來 12 週）"
        summary={
          !settings?.cash_balance_date
            ? '尚未設定現金餘額 —— 點右邊「設定現金水位」才能預估。'
            : cash.lowest && cash.lowest.end < 0
              ? `最低水位 ${money(cash.lowest.end)}（${cash.lowest.label} 那週）—— 會軋不過來。`
              : cash.lowest && cash.safety > 0 && cash.lowest.end < cash.safety
                ? `最低水位 ${money(cash.lowest.end)}（${cash.lowest.label} 那週），低於安全線 ${money(cash.safety)}。`
                : `未來 12 週最低水位 ${money(cash.lowest?.end)}，高於安全線，現金無虞。`
        }
        action={
          <button onClick={() => { setCashForm({ ...settings }); setCashOpen(true) }}
            className="flex items-center gap-1 text-xs border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg hover:bg-gray-50">
            <Settings2 size={13} /> 設定現金水位
          </button>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Mini label="目前現金" value={money(cash.start)} sub={settings?.cash_balance_date ? `更新於 ${settings.cash_balance_date}` : '未設定'} />
          <Mini label="安全水位" value={money(cash.safety)} />
          <Mini label="逾期未收" value={money(cash.overdue)} color={cash.overdue > 0 ? 'text-red-600' : ''} />
          <Mini label="12 週最低水位" value={money(cash.lowest?.end)} color={cash.lowest && cash.lowest.end < cash.safety ? 'text-red-600' : 'text-green-700'} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="py-2 px-3">週次</th>
                <th className="px-3 text-right">預計入帳</th>
                <th className="px-3 text-right">預計付款</th>
                <th className="px-3 text-right">週末餘額</th>
                <th className="px-3">水位</th>
              </tr>
            </thead>
            <tbody>
              {cash.weeks.map((w, i) => {
                const bad = w.end < 0
                const warn = !bad && cash.safety > 0 && w.end < cash.safety
                return (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 px-3 text-gray-600">{w.label} 起</td>
                    <td className="px-3 text-right text-green-700">{w.in ? '+' + short(w.in) : '—'}</td>
                    <td className="px-3 text-right text-red-600">{w.out ? '-' + short(w.out) : '—'}</td>
                    <td className={`px-3 text-right font-semibold ${bad ? 'text-red-600' : warn ? 'text-amber-600' : 'text-gray-900'}`}>
                      {money(w.end)}
                    </td>
                    <td className="px-3">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden w-28">
                        <div className={`h-full ${bad ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(100, Math.abs(w.end) / cash.max * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          入帳＝應收帳款到期日；付款＝應付帳款到期日。逾期未收的 {money(cash.overdue)} 未計入（保守估計）。
        </p>
      </Panel>

      {/* ② 業務漏斗 */}
      <Panel
        light={funnel.light}
        icon={<Filter size={18} />}
        title="業務漏斗與業績預測"
        summary={
          funnel.rows.length === 0
            ? '目前沒有進行中的報價案 —— 未來沒有糧草。'
            : funnel.topShare > 0.5
              ? `加權預測 ${money(funnel.weighted)}，但 ${funnel.clientRank[0]?.name} 一家就佔 ${(funnel.topShare * 100).toFixed(0)}%，過度集中。`
              : `進行中 ${funnel.rows.length} 案、總額 ${money(funnel.total)}，加權預測營收 ${money(funnel.weighted)}。`
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Mini label="進行中案件" value={`${funnel.rows.length} 案`} />
          <Mini label="報價總額" value={money(funnel.total)} />
          <Mini label="加權預測營收" value={money(funnel.weighted)} color="text-blue-700" />
          <Mini label="最大客戶佔比" value={`${(funnel.topShare * 100).toFixed(0)}%`} color={funnel.topShare > 0.5 ? 'text-amber-600' : ''} />
        </div>

        <div className="mb-4">
          <div className="text-xs font-semibold text-gray-600 mb-2">各階段</div>
          <div className="space-y-1.5">
            {Object.entries(funnel.byStage).map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 text-sm">
                <span className="w-24 text-gray-600 shrink-0">{k}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-blue-500/70 flex items-center px-2 text-xs text-white"
                    style={{ width: `${funnel.total > 0 ? Math.max(6, v.amt / funnel.total * 100) : 0}%` }}>
                    {v.count}
                  </div>
                </div>
                <span className="w-28 text-right text-gray-700">{money(v.amt)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="py-2 px-3">報價單</th>
                <th className="px-3">客戶／案名</th>
                <th className="px-3">狀態</th>
                <th className="px-3 text-center">勝率</th>
                <th className="px-3">預計結案</th>
                <th className="px-3 text-right">金額</th>
                <th className="px-3 text-right">加權</th>
              </tr>
            </thead>
            <tbody>
              {funnel.rows.slice(0, 12).map(r => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50/60">
                  <td className="py-2 px-3">
                    <a href={`/quotes/${r.id}`} className="text-blue-600 hover:underline">{r.quote_no}</a>
                  </td>
                  <td className="px-3 text-gray-700">
                    {(r as any).clients?.company_name ?? '—'}
                    {r.project_name && <div className="text-xs text-gray-400">{r.project_name}</div>}
                  </td>
                  <td className="px-3 text-gray-600">{r.status}</td>
                  <td className="px-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded ${r.win_probability == null ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-700'}`}>
                      {r.p}%{r.win_probability == null ? '*' : ''}
                    </span>
                  </td>
                  <td className="px-3 text-gray-500">{r.expected_close_date ?? '—'}</td>
                  <td className="px-3 text-right text-gray-700">{money(r.total_amount)}</td>
                  <td className="px-3 text-right font-semibold text-blue-700">{money(r.weighted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          帶 * 的勝率是依狀態自動推估（報價單未填勝率）。到報價單編輯頁可手動指定勝率與預計結案日。
        </p>
      </Panel>

      {/* ③ 毛利 */}
      <Panel
        light={margin.light}
        icon={<Percent size={18} />}
        title="毛利分析（硬體品牌 × 專案工程）"
        summary={
          margin.lossProjects.length > 0
            ? `有 ${margin.lossProjects.length} 個專案做到賠錢（最慘：${margin.lossProjects[0]?.name} ${money(margin.lossProjects[0]?.gp)}）。`
            : margin.projRows.length === 0 && margin.brands.length === 0
              ? '尚無足夠成本資料 —— 請確認產品有填成本價、專案有填收入與設備成本。'
              : `專案平均毛利率 ${(margin.avgRate * 100).toFixed(1)}%，硬體毛利最高的是 ${margin.brands[0]?.brand ?? '—'}。`
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-semibold text-gray-600 mb-2">硬體：品牌毛利貢獻</div>
            {margin.brands.length === 0 ? (
              <div className="text-sm text-gray-400 py-6 text-center">沒有可算毛利的銷貨資料（產品需填成本價）</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b bg-gray-50">
                    <th className="py-2 px-3">品牌</th>
                    <th className="px-3 text-right">營收</th>
                    <th className="px-3 text-right">毛利</th>
                    <th className="px-3 text-right">毛利率</th>
                  </tr>
                </thead>
                <tbody>
                  {margin.brands.slice(0, 10).map(b => (
                    <tr key={b.brand} className="border-b last:border-0">
                      <td className="py-2 px-3 text-gray-900">{b.brand}</td>
                      <td className="px-3 text-right text-gray-700">{short(b.rev)}</td>
                      <td className={`px-3 text-right font-medium ${b.gp < 0 ? 'text-red-600' : 'text-gray-900'}`}>{short(b.gp)}</td>
                      <td className={`px-3 text-right ${b.rate < 0.1 ? 'text-amber-600 font-semibold' : 'text-gray-600'}`}>
                        {(b.rate * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {margin.unknownRev > 0 && (
              <p className="text-xs text-amber-600 mt-2">
                有 {money(margin.unknownRev)} 的銷貨無法算毛利（產品沒填成本價）。
              </p>
            )}
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-600 mb-2">專案：收入 − 設備 − 人工 − 維修</div>
            {margin.projRows.length === 0 ? (
              <div className="text-sm text-gray-400 py-6 text-center">專案尚未填收入／設備成本</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b bg-gray-50">
                    <th className="py-2 px-3">專案</th>
                    <th className="px-3 text-right">收入</th>
                    <th className="px-3 text-right">人工</th>
                    <th className="px-3 text-right">維修</th>
                    <th className="px-3 text-right">毛利率</th>
                  </tr>
                </thead>
                <tbody>
                  {margin.projRows.slice(0, 10).map(p => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 px-3">
                        <div className="text-gray-900">{p.name}</div>
                        <div className="text-xs text-gray-400">{p.client}</div>
                      </td>
                      <td className="px-3 text-right text-gray-700">{short(p.rev)}</td>
                      <td className="px-3 text-right text-gray-600">{p.labor ? short(p.labor) : '—'}</td>
                      <td className="px-3 text-right text-gray-600">{p.repair ? short(p.repair) : '—'}</td>
                      <td className={`px-3 text-right font-semibold ${p.gp < 0 ? 'text-red-600' : p.rate < 0.15 ? 'text-amber-600' : 'text-green-700'}`}>
                        {(p.rate * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-xs text-gray-400 mt-2">由差到好排序 —— 賠錢的專案排最前面。</p>
          </div>
        </div>
      </Panel>

      {/* ④ 庫存週轉 */}
      <Panel
        light={inv.light}
        icon={<Package size={18} />}
        title={`庫存與資產週轉（呆滯門檻 ${DEAD_STOCK_DAYS} 天）`}
        summary={
          inv.totalValue === 0
            ? '目前沒有庫存積壓（庫存總值為 0）。'
            : `庫存總值 ${money(inv.totalValue)}，其中呆滯 ${money(inv.deadValue)}（佔 ${(inv.deadShare * 100).toFixed(0)}%）壓在倉庫。`
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Mini label="庫存總值" value={money(inv.totalValue)} />
          <Mini label="呆滯金額" value={money(inv.deadValue)} color={inv.deadValue > 0 ? 'text-red-600' : ''} />
          <Mini label="呆滯佔比" value={`${(inv.deadShare * 100).toFixed(0)}%`} color={inv.deadShare > 0.1 ? 'text-amber-600' : ''} />
          <Mini label="呆滯品項" value={`${inv.dead.length} 項`} />
        </div>

        {inv.dead.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">沒有呆滯物料</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="py-2 px-3">品牌／品名</th>
                  <th className="px-3">型號</th>
                  <th className="px-3 text-right">庫存</th>
                  <th className="px-3 text-right">成本價</th>
                  <th className="px-3 text-right">積壓金額</th>
                  <th className="px-3 text-right">未動天數</th>
                </tr>
              </thead>
              <tbody>
                {inv.dead.slice(0, 15).map(d => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="py-2 px-3">
                      <div className="text-gray-900">{d.product_name}</div>
                      {d.brand && <div className="text-xs text-gray-400">{d.brand}</div>}
                    </td>
                    <td className="px-3 text-gray-600">{d.model ?? '—'}</td>
                    <td className="px-3 text-right">{num(d.stock_qty)} {d.unit ?? ''}</td>
                    <td className="px-3 text-right text-gray-600">{money(d.cost_price)}</td>
                    <td className="px-3 text-right font-semibold text-red-600">{money(d.stock_value)}</td>
                    <td className="px-3 text-right text-gray-700">
                      {d.days_since_move == null ? '從未異動' : `${d.days_since_move} 天`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* 現金水位設定 */}
      {cashOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold">設定現金水位</h3>
              <button onClick={() => setCashOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block">
                <span className="block text-xs text-gray-500 mb-1">目前銀行／現金餘額</span>
                <input type="number" value={cashForm.cash_balance ?? 0}
                  onChange={e => setCashForm({ ...cashForm, cash_balance: e.target.value })} className={inp} />
              </label>
              <label className="block">
                <span className="block text-xs text-gray-500 mb-1">安全水位（低於此值亮紅燈）</span>
                <input type="number" value={cashForm.cash_safety_line ?? 0}
                  onChange={e => setCashForm({ ...cashForm, cash_safety_line: e.target.value })} className={inp} />
              </label>
              <label className="block">
                <span className="block text-xs text-gray-500 mb-1">餘額更新日</span>
                <input type="date" value={cashForm.cash_balance_date ?? new Date().toISOString().slice(0, 10)}
                  onChange={e => setCashForm({ ...cashForm, cash_balance_date: e.target.value })} className={inp} />
              </label>
              <p className="text-xs text-gray-400">建議每週更新一次餘額，預估才會準。</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setCashOpen(false)} className="px-4 py-2 text-sm rounded-lg border">取消</button>
              <button onClick={saveCash} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Panel({ light, icon, title, summary, action, children }: {
  light: Light
  icon: React.ReactNode
  title: string
  summary: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`rounded-2xl border mb-4 overflow-hidden ${LIGHT_STYLE[light]}`}>
      <div className="p-4 flex items-start gap-3">
        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${DOT[light]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
            {icon}{title}
            {light === 'red' && <AlertTriangle size={14} className="text-red-600" />}
            {light === 'green' && <CheckCircle size={14} className="text-green-600" />}
          </div>
          <p className="text-sm text-gray-700 mt-1">{summary}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action}
          <button onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1 text-xs border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg hover:bg-gray-50">
            {open ? <><ChevronDown size={13} /> 收合</> : <><ChevronRight size={13} /> 看細節</>}
          </button>
        </div>
      </div>
      {open && <div className="bg-white border-t border-gray-100 p-4">{children}</div>}
    </div>
  )
}

function Mini({ label, value, sub, color = 'text-gray-900' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}
