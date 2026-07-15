import { createServerSupabaseClient } from '@/lib/supabase-server'
import KPICard from '@/components/dashboard/KPICard'
import WeatherWidget from '@/components/dashboard/WeatherWidget'
import TodaySchedule from '@/components/dashboard/TodaySchedule'
import QuickNotes from '@/components/dashboard/QuickNotes'
import MessagesWidget from '@/components/dashboard/MessagesWidget'
import DraggableDashboard, { type DashboardBlock } from '@/components/dashboard/DraggableDashboard'
import { Users, AlertCircle, Clock, CheckCircle, TrendingUp, FileText, DollarSign, Percent, AlertTriangle, CalendarClock, Timer } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// 目標值預設值（若 system_settings 尚未加入對應欄位，就用這組預設）
const DEFAULT_TARGETS = {
  needsClients: 20,
  planningClients: 20,
  monthlyRevenue: 500000,
  conversionRate: 30,
}

// 報價→成交平均週期（quote-to-sales-order cycle time）
async function getAvgCycleTime(supabase: any) {
  const { data: orders } = await supabase.from('sales_orders').select('quote_id, created_at').not('quote_id', 'is', null)
  if (!orders || orders.length === 0) return { avgDays: 0, count: 0 }
  const quoteIds = orders.map((o: any) => o.quote_id)
  const { data: quotes } = await supabase.from('quotes').select('id, created_at').in('id', quoteIds)
  const quoteMap = new Map((quotes ?? []).map((q: any) => [q.id, q.created_at]))
  let totalDays = 0, count = 0
  for (const o of orders) {
    const qCreated = quoteMap.get(o.quote_id)
    if (!qCreated) continue
    const days = (new Date(o.created_at).getTime() - new Date(qCreated).getTime()) / 86400000
    if (days >= 0) { totalDays += days; count++ }
  }
  return { avgDays: count > 0 ? Math.round((totalDays / count) * 10) / 10 : 0, count }
}

async function getDashboardData() {
  const supabase = createServerSupabaseClient()

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().split('T')[0]
  const in30 = new Date(Date.now() + 30 * 86400 * 1000).toISOString().split('T')[0]

  const [
    { count: totalClients },
    { count: withNeeds },
    { count: planning },
    { count: serviceIncomplete },
    { count: completed },
    { count: totalQuotes },
    { count: quotesEligible },
    { count: quotesConverted },
    recentQuotes,
    upcomingVisits,
    overdueVisits,
    incomeThisMonth,
    overdueReceivables,
    settingsRes,
    expiringQuotes,
    cycleTime,
  ] = await Promise.all([
    supabase.from('clients').select('id', { count: 'exact', head: true }),
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', '有需求'),
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', '規劃中'),
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', '服務未完成'),
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', '已完成'),
    supabase.from('quotes').select('id', { count: 'exact', head: true }),
    // 報價轉換率分母：排除草稿與作廢（真正報出去的才算數）
    supabase.from('quotes').select('id', { count: 'exact', head: true }).neq('status', '草稿').neq('status', '作廢'),
    // 報價轉換率分子：已轉銷貨單
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('status', '已轉銷貨單'),
    supabase
      .from('quotes')
      .select('quote_no, client_id, project_name, total_amount, status, created_at, clients(company_name)')
      .order('created_at', { ascending: false })
      .limit(5),
    // 即將到期（未來30天內，含今天）
    supabase
      .from('clients')
      .select('id, company_name, contact_name, next_visit_date, status')
      .not('next_visit_date', 'is', null)
      .gte('next_visit_date', todayStr)
      .lte('next_visit_date', in30)
      .order('next_visit_date', { ascending: true })
      .limit(5),
    // 已逾期未回訪（早於今天）
    supabase
      .from('clients')
      .select('id, company_name, contact_name, next_visit_date, status')
      .not('next_visit_date', 'is', null)
      .lt('next_visit_date', todayStr)
      .order('next_visit_date', { ascending: true })
      .limit(10),
    // 本月營收（開票日在本月）
    supabase
      .from('accounting_income')
      .select('total_amount')
      .gte('invoice_date', monthStart)
      .lt('invoice_date', nextMonthStart),
    // 應收逾期（到期日已過、尚未收清）
    supabase
      .from('receivables')
      .select('balance, due_date, client_id, receivable_no, clients(company_name)')
      .lt('due_date', todayStr)
      .neq('status', '已收清')
      .gt('balance', 0)
      .order('due_date', { ascending: true }),
    supabase.from('system_settings').select('*').single(),
    // 報價效期到期提醒：未轉單、未作廢，且效期在30天內到期或已過期
    supabase
      .from('quotes')
      .select('id, quote_no, client_id, project_name, valid_until, total_amount, clients(company_name)')
      .in('status', ['草稿', '已確認'])
      .not('valid_until', 'is', null)
      .lte('valid_until', in30)
      .order('valid_until', { ascending: true })
      .limit(10),
    getAvgCycleTime(supabase),
  ])

  const monthlyRevenue = (incomeThisMonth.data ?? []).reduce((sum: number, r: any) => sum + Number(r.total_amount || 0), 0)
  const overdueReceivableTotal = (overdueReceivables.data ?? []).reduce((sum: number, r: any) => sum + Number(r.balance || 0), 0)
  const conversionRate = quotesEligible && quotesEligible > 0 ? Math.round(((quotesConverted ?? 0) / quotesEligible) * 100) : 0

  // 目前登入者姓名 + 角色（右上角問候列 / 財務數字顯示控制）
  const { data: { user } } = await supabase.auth.getUser()
  let currentUserName = ''
  let hideRevenue = false   // 第一線業務不顯示全公司本月營收
  if (user) {
    const { data: prof } = await supabase
      .from('user_profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .maybeSingle()
    currentUserName = (prof?.full_name?.trim() || user.email?.split('@')[0] || '')
    hideRevenue = ['sales', '業務', '業務員', 'salesperson'].includes((prof as any)?.role ?? '')
  }

  const s = (settingsRes.data ?? {}) as any
  const targets = {
    needsClients: s.target_needs_clients ?? DEFAULT_TARGETS.needsClients,
    planningClients: s.target_planning_clients ?? DEFAULT_TARGETS.planningClients,
    monthlyRevenue: s.target_monthly_revenue ?? DEFAULT_TARGETS.monthlyRevenue,
    conversionRate: s.target_conversion_rate ?? DEFAULT_TARGETS.conversionRate,
  }

  return {
    totalClients: totalClients ?? 0,
    withNeeds: withNeeds ?? 0,
    planning: planning ?? 0,
    serviceIncomplete: serviceIncomplete ?? 0,
    completed: completed ?? 0,
    totalQuotes: totalQuotes ?? 0,
    recentQuotes: recentQuotes.data ?? [],
    upcomingVisits: upcomingVisits.data ?? [],
    overdueVisits: overdueVisits.data ?? [],
    monthlyRevenue,
    conversionRate,
    overdueReceivableTotal,
    overdueReceivables: overdueReceivables.data ?? [],
    targets,
    expiringQuotes: (expiringQuotes.data ?? []).map((q: any) => ({ ...q, isExpired: q.valid_until < todayStr })),
    avgCycleDays: cycleTime.avgDays,
    cycleSampleCount: cycleTime.count,
    currentUserName,
    hideRevenue,
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  const blocks: DashboardBlock[] = []

  blocks.push({
    id: 'messages',
    title: '訊息',
    node: <MessagesWidget />,
  })

  blocks.push({
    id: 'today-schedule',
    title: '今日行程與重要日子',
    node: <TodaySchedule />,
  })

  blocks.push({
    id: 'quick-notes',
    title: '快速筆記',
    node: <QuickNotes />,
  })

  if (data.overdueVisits.length > 0) {
    blocks.push({
      id: 'overdue-visits',
      title: '已逾期未回訪客戶',
      node: (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-red-600" />
            <h2 className="font-semibold text-red-800">已逾期未回訪客戶（{data.overdueVisits.length} 位）</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.overdueVisits.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between text-sm bg-white rounded-xl px-3.5 py-2.5 border border-red-100">
                <div>
                  <div className="font-medium text-gray-900">{c.company_name}</div>
                  <div className="text-gray-500 text-xs">{c.contact_name ?? '—'}</div>
                </div>
                <div className="text-right">
                  <div className="text-red-600 font-medium">應回訪：{formatDate(c.next_visit_date)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{c.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    })
  }

  if (data.expiringQuotes.length > 0) {
    blocks.push({
      id: 'expiring-quotes',
      title: '報價效期即將到期／已過期',
      node: (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock size={18} className="text-orange-600" />
            <h2 className="font-semibold text-orange-800">報價效期即將到期／已過期（{data.expiringQuotes.length} 筆）</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.expiringQuotes.map((q: any) => (
              <div key={q.id} className="flex items-center justify-between text-sm bg-white rounded-xl px-3.5 py-2.5 border border-orange-100">
                <div>
                  <div className="font-medium text-gray-900">{q.quote_no}</div>
                  <div className="text-gray-500 text-xs">{q.clients?.company_name ?? '—'} · {q.project_name ?? '—'}</div>
                </div>
                <div className="text-right">
                  <div className={`font-medium ${q.isExpired ? 'text-red-600' : 'text-orange-600'}`}>
                    {q.isExpired ? '已過期' : '效期至'}：{formatDate(q.valid_until)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">NT${Number(q.total_amount).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    })
  }

  blocks.push({
    id: 'kpi-customer',
    title: 'KPI — 顧客構面',
    node: (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          title="有需求客戶"
          value={data.withNeeds}
          target={data.targets.needsClients}
          subtitle="積極開發中"
          icon={TrendingUp}
          color="blue"
        />
        <KPICard
          title="規劃中客戶"
          value={data.planning}
          target={data.targets.planningClients}
          subtitle="方案規劃階段"
          icon={Clock}
          color="purple"
        />
        <KPICard
          title="服務未完成"
          value={data.serviceIncomplete}
          subtitle="需安排後續"
          icon={AlertCircle}
          color="yellow"
        />
        <KPICard
          title="已完成客戶"
          value={data.completed}
          icon={CheckCircle}
          color="green"
        />
        <KPICard
          title="客戶總數"
          value={data.totalClients}
          icon={Users}
          color="gray"
        />
        <KPICard
          title="報價單總數"
          value={data.totalQuotes}
          icon={FileText}
          color="blue"
        />
      </div>
    ),
  })

  blocks.push({
    id: 'kpi-finance',
    title: 'KPI — 財務與流程構面',
    node: (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {!data.hideRevenue && (
          <KPICard
            title="本月營收"
            value={data.monthlyRevenue}
            displayValue={formatCurrency(data.monthlyRevenue)}
            target={data.targets.monthlyRevenue}
            targetDisplay={formatCurrency(data.targets.monthlyRevenue)}
            subtitle="累計已開票金額"
            icon={DollarSign}
            color="green"
          />
        )}
        <KPICard
          title="報價轉換率"
          value={data.conversionRate}
          displayValue={`${data.conversionRate}%`}
          target={data.targets.conversionRate}
          targetDisplay={`${data.targets.conversionRate}%`}
          subtitle="已轉銷貨單 / 正式報價單"
          icon={Percent}
          color="purple"
        />
        <KPICard
          title="應收逾期金額"
          value={data.overdueReceivableTotal}
          displayValue={formatCurrency(data.overdueReceivableTotal)}
          subtitle={data.overdueReceivables.length > 0 ? `共 ${data.overdueReceivables.length} 筆逾期` : '無逾期款項'}
          icon={AlertCircle}
          color={data.overdueReceivableTotal > 0 ? 'red' : 'gray'}
        />
        <KPICard
          title="報價成交平均週期"
          value={data.avgCycleDays}
          displayValue={`${data.avgCycleDays} 天`}
          subtitle={data.cycleSampleCount > 0 ? `根據 ${data.cycleSampleCount} 筆已轉銷貨單報價計算` : '尚無已轉單資料'}
          icon={Timer}
          color="blue"
        />
      </div>
    ),
  })

  blocks.push({
    id: 'status-distribution',
    title: '客戶狀態分布',
    node: (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-4">客戶狀態分布</h2>
        <div className="space-y-3">
          {[
            { label: '有需求', value: data.withNeeds, color: 'bg-blue-500' },
            { label: '規劃中', value: data.planning, color: 'bg-purple-500' },
            { label: '服務未完成', value: data.serviceIncomplete, color: 'bg-yellow-500' },
            { label: '已完成', value: data.completed, color: 'bg-green-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="text-sm text-gray-600 w-24 shrink-0">{label}</div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${color}`}
                  style={{ width: data.totalClients > 0 ? `${(value / data.totalClients) * 100}%` : '0%' }}
                />
              </div>
              <div className="text-sm font-semibold text-gray-900 w-8 text-right">{value}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  })

  blocks.push({
    id: 'recent-quotes',
    title: '最近報價單',
    node: (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-4">最近報價單</h2>
        {data.recentQuotes.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">尚無報價單</p>
        ) : (
          <div className="space-y-3">
            {data.recentQuotes.map((q: any) => (
              <div key={q.quote_no} className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium text-gray-900">{q.quote_no}</div>
                  <div className="text-gray-500 text-xs">{q.clients?.company_name ?? '—'} · {q.project_name ?? '—'}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-gray-900">NT${Number(q.total_amount).toLocaleString()}</div>
                  <div className={`text-xs px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                    q.status === '草稿' ? 'bg-gray-100 text-gray-600' :
                    q.status === '已確認' ? 'bg-blue-100 text-blue-700' :
                    'bg-green-100 text-green-700'
                  }`}>{q.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
  })

  blocks.push({
    id: 'upcoming-visits',
    title: '近30天應回訪客戶',
    node: (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-4">近30天應回訪客戶</h2>
        {data.upcomingVisits.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">近30天無需回訪客戶</p>
        ) : (
          <div className="space-y-3">
            {data.upcomingVisits.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium text-gray-900">{c.company_name}</div>
                  <div className="text-gray-500 text-xs">{c.contact_name ?? '—'}</div>
                </div>
                <div className="text-right">
                  <div className="text-gray-700">{formatDate(c.next_visit_date)}</div>
                  <div className={`text-xs px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                    c.status === '有需求' ? 'bg-blue-100 text-blue-700' :
                    c.status === '規劃中' ? 'bg-purple-100 text-purple-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{c.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
  })

  blocks.push({
    id: 'weather',
    title: '天氣預報',
    node: <WeatherWidget />,
  })

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">業務戰情總覽</h1>
          <p className="text-sm text-gray-500 mt-0.5">更新日期：{new Date().toLocaleDateString('zh-TW')}</p>
        </div>
        {data.currentUserName && (
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="text-right leading-tight">
              <div className="text-xs text-gray-400">您好</div>
              <div className="text-sm font-semibold text-gray-900">{data.currentUserName}</div>
            </div>
            <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">
              {data.currentUserName[0]}
            </div>
          </div>
        )}
      </div>

      <DraggableDashboard blocks={blocks} storageKey="dashboard-widget-order-v1" />
    </div>
  )
}
