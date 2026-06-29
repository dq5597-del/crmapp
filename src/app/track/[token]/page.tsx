import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { CheckCircle, Clock, Wrench, Building2, Package, AlertCircle } from 'lucide-react'

// Status timeline steps
const STATUS_STEPS = [
  { key: '待處理',       label: '已收到叫修申請' },
  { key: '處理中',       label: '技術人員處理中' },
  { key: '報價中',       label: '維修報價中' },
  { key: '等待客戶確認', label: '等待您確認報價' },
  { key: '維修中',       label: '維修進行中' },
  { key: '已完成',       label: '維修完成' },
  { key: '收費中',       label: '費用確認中' },
  { key: '已結案',       label: '案件已結案' },
]

const WARRANTY_LABELS: Record<string, string> = {
  '保固內': '保固內',
  '保固外': '保固外',
  '非保固': '非保固',
}

const WARRANTY_COLORS: Record<string, string> = {
  '保固內': 'bg-green-100 text-green-700',
  '保固外': 'bg-orange-100 text-orange-700',
  '非保固': 'bg-gray-100 text-gray-500',
}

const STATUS_MESSAGES: Record<string, string> = {
  '待處理':       '我們已收到您的叫修申請，技術團隊即將安排處理。',
  '處理中':       '技術人員正在評估設備狀況，我們將儘快回覆您處理進度。',
  '報價中':       '技術人員已完成診斷，正在為您準備維修報價單。',
  '等待客戶確認': '維修報價單已準備完成，請等待業務人員與您聯繫確認。',
  '維修中':       '您已確認維修，技術人員正在進行維修作業。',
  '已完成':       '設備維修已完成，請與我們聯繫安排取件事宜。',
  '收費中':       '維修費用確認中，業務人員將與您聯繫相關費用事項。',
  '已結案':       '感謝您的委託，本次叫修案件已結案。如有任何問題歡迎再次聯繫。',
}

export default async function TrackPage({ params }: { params: { token: string } }) {
  const supabase = createServerSupabaseClient()

  const { data: req } = await supabase
    .from('service_requests')
    .select('*, client:clients(company_name)')
    .eq('track_token', params.token)
    .single()

  if (!req) return notFound()

  const currentStepIndex = STATUS_STEPS.findIndex(s => s.key === req.status)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
            <Wrench size={18} className="text-white" />
          </div>
          <div>
            <p className="text-xs text-gray-500">光輝影音科技</p>
            <p className="text-sm font-semibold text-gray-800">叫修單追蹤</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        {/* Status card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-blue-600 px-6 py-5">
            <p className="text-blue-200 text-xs font-medium mb-1">叫修單號</p>
            <p className="text-white text-xl font-bold">{req.service_no}</p>
            <p className="text-blue-200 text-sm mt-1">
              通報日期：{req.reported_date}
            </p>
          </div>

          <div className="px-6 py-5">
            {/* Current status */}
            <div className="flex items-start gap-3 mb-5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                req.status === '已結案' ? 'bg-gray-100' : 'bg-blue-50'
              }`}>
                {req.status === '已結案'
                  ? <CheckCircle size={20} className="text-gray-400" />
                  : req.status === '等待客戶確認'
                  ? <AlertCircle size={20} className="text-orange-500" />
                  : <Clock size={20} className="text-blue-600" />
                }
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-0.5">目前狀態</p>
                <p className="text-lg font-bold text-gray-900">{req.status}</p>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                  {STATUS_MESSAGES[req.status] ?? ''}
                </p>
              </div>
            </div>

            {/* Progress timeline */}
            <div className="space-y-2">
              {STATUS_STEPS.map((step, i) => {
                const done = i < currentStepIndex
                const current = i === currentStepIndex
                const future = i > currentStepIndex
                return (
                  <div key={step.key} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                      done    ? 'bg-green-500' :
                      current ? 'bg-blue-600' :
                      'bg-gray-200'
                    }`}>
                      {done && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {current && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <span className={`text-sm ${
                      done    ? 'text-green-700 line-through' :
                      current ? 'text-blue-700 font-semibold' :
                      'text-gray-400'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Equipment info */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Package size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-800">設備資訊</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">設備名稱</p>
              <p className="font-medium text-gray-800">{req.equipment_name}</p>
            </div>
            {req.equipment_model && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">型號</p>
                <p className="font-medium text-gray-800">{req.equipment_model}</p>
              </div>
            )}
            {req.serial_no && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">序號</p>
                <p className="font-medium text-gray-700">{req.serial_no}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400 mb-0.5">保固狀態</p>
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${WARRANTY_COLORS[req.warranty_status] ?? 'bg-gray-100 text-gray-600'}`}>
                {req.warranty_status}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">維修方式</p>
              <p className="font-medium text-gray-700">{req.service_type}</p>
            </div>
          </div>
          {req.issue_description && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-1">故障描述</p>
              <p className="text-sm text-gray-700 leading-relaxed">{req.issue_description}</p>
            </div>
          )}
        </div>

        {/* Close info if closed */}
        {req.is_closed && req.closed_date && (
          <div className="bg-green-50 rounded-2xl border border-green-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={16} className="text-green-600" />
              <h2 className="text-sm font-semibold text-green-800">結案資訊</h2>
            </div>
            <div className="text-sm space-y-1">
              <p className="text-green-700">結案日期：{req.closed_date}</p>
              {req.close_notes && <p className="text-green-700">說明：{req.close_notes}</p>}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pb-4">
          <p>如有任何疑問，請與光輝影音科技聯繫</p>
          <p className="mt-1">此頁面由系統自動生成，僅供叫修追蹤使用</p>
        </div>
      </div>
    </div>
  )
}
