import { createServerSupabaseClient } from '@/lib/supabase-server'
import KPICard from '@/components/dashboard/KPICard'
import WeatherWidget from '@/components/dashboard/WeatherWidget'
import { Users, AlertCircle, Clock, CheckCircle, TrendingUp, FileText } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

async function getDashboardData() {
  const supabase = createServerSupabaseClient()

  const [
    { count: totalClients },
    { count: withNeeds },
    { count: planning },
    { count: serviceIncomplete },
    { count: completed },
    { count: totalQuotes },
    recentQuotes,
    upcomingVisits,
  ] = await Promise.all([
    supabase.from('clients').select('id', { count: 'exact', head: true }),
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', '有需求'),
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', '規劃中'),
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', '服務未完成'),
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', '已完成'),
    supabase.from('quotes').select('id', { count: 'exact', head: true }),
    supabase
      .from('quotes')
      .select('quote_no, client_id, project_name, total_amount, status, created_at, clients(company_name)')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('clients')
      .select('id, company_name, contact_name, next_visit_date, status')
      .not('next_visit_date', 'is', null)
      .lte('next_visit_date', new Date(Date.now() + 30 * 86400 * 1000).toISOString().split('T')[0])
      .order('next_visit_date', { ascending: true })
      .limit(5),
  ])

  return {
    totalClients: totalClients ?? 0,
    withNeeds: withNeeds ?? 0,
    planning: planning ?? 0,
    serviceIncomplete: serviceIncomplete ?? 0,
    completed: completed ?? 0,
    totalQuotes: totalQuotes ?? 0,
    recentQuotes: recentQuotes.data ?? [],
    upcomingVisits: upcomingVisits.data ?? [],
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">業務戰情總覽</h1>
        <p className="text-sm text-gray-500 mt-0.5">更新日期：{new Date().toLocaleDateString('zh-TW')}</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          title="有需求客戶"
          value={data.withNeeds}
          target={20}
          subtitle="積極開發中"
          icon={TrendingUp}
          color="blue"
        />
        <KPICard
          title="規劃中客戶"
          value={data.planning}
          target={20}
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

      {/* 客戶狀態分布 */}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 最近報價單 */}
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

        {/* 即將拜訪 */}
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
      </div>

      {/* 天氣預報 */}
      <WeatherWidget />
    </div>
  )
}
