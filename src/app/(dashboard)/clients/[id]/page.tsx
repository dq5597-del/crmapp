'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Client, Contact, VisitRecord, Project, Quote, CompetitorInfo } from '@/types'
import ClientForm from '@/components/clients/ClientForm'
import ContactsTab from '@/components/clients/ContactsTab'
import ImportantDatesTab from '@/components/clients/ImportantDatesTab'
import VisitsTab from '@/components/clients/VisitsTab'
import ProjectsTab from '@/components/clients/ProjectsTab'
import CompetitorsTab from '@/components/clients/CompetitorsTab'
import { CLIENT_STATUS_COLORS, formatDate } from '@/lib/utils'
import {
  ArrowLeft, Edit2, Phone, MapPin, Calendar,
  Users, FileText, Briefcase, Eye, Building2, Trash2, Cake, Printer
} from 'lucide-react'

const TABS = [
  { key: 'info',        label: '基本資料', icon: Eye },
  { key: 'contacts',    label: '聯絡人',   icon: Users },
  { key: 'dates',       label: '重要日子', icon: Cake },
  { key: 'visits',      label: '拜訪紀錄', icon: Calendar },
  { key: 'projects',    label: '專案',     icon: Briefcase },
  { key: 'competitors', label: '同業資訊', icon: Building2 },
  { key: 'quotes',      label: '報價單',   icon: FileText },
]

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('info')
  const [autoEditId, setAutoEditId] = useState<string | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Quote counts for badge
  const [quoteCount, setQuoteCount] = useState(0)
  const [clientQuotes, setClientQuotes] = useState<Quote[]>([])

  // 從網址讀取 ?tab= / ?edit=（供「專案資料夾」深連結進完整編輯器）
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const t = sp.get('tab'); if (t) setActiveTab(t)
    const e = sp.get('edit'); if (e) setAutoEditId(e)
  }, [])

  useEffect(() => {
    fetchClient()
    fetchQuoteCount()
  }, [id])

  async function fetchClient() {
    const { data } = await supabase.from('clients').select('*').eq('id', id).single()
    setClient(data)
    setLoading(false)
  }

  async function handleDelete() {
    if (!window.confirm(`確定要刪除「${client?.company_name}」？\n此操作無法復原。`)) return
    setDeleting(true)
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) {
      alert('刪除失敗：' + error.message)
      setDeleting(false)
    } else {
      router.push('/clients')
    }
  }

  async function fetchQuoteCount() {
    const { count, data } = await supabase
      .from('quotes')
      .select('*', { count: 'exact' })
      .eq('client_id', id)
      .order('created_at', { ascending: false })
    setQuoteCount(count ?? 0)
    setClientQuotes(data ?? [])
  }

  if (loading) return <div className="p-8 text-center text-gray-400">載入中...</div>
  if (!client) return <div className="p-8 text-center text-red-500">找不到單位名稱</div>

  if (editing) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-gray-900">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-gray-900">編輯單位名稱</h1>
        </div>
        <ClientForm
          initialData={client}
          onSuccess={() => { setEditing(false); fetchClient() }}
        />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Back + Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.push('/clients')} className="text-gray-500 hover:text-gray-900">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 truncate">{client.company_name}</h1>
            <span className={`text-xs px-2 py-1 rounded-lg font-medium ${CLIENT_STATUS_COLORS[client.status]}`}>
              {client.status}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-0.5">{client.contact_name ?? '—'}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link
            href={`/quotes/new?client_id=${id}&client_name=${encodeURIComponent(client.company_name)}&phone=${encodeURIComponent(client.phone ?? '')}&contact=${encodeURIComponent(client.contact_name ?? '')}`}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-sm font-medium"
          >
            <FileText size={14} />
            開報價單
          </Link>
          <button
            onClick={() => window.open(`/clients/${id}/print`, '_blank')}
            className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-xl text-sm font-medium text-gray-700"
          >
            <Printer size={14} />
            列印資料卡
          </button>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-xl text-sm font-medium text-gray-700"
          >
            <Edit2 size={14} />
            編輯
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-xl text-sm font-medium text-red-600 disabled:opacity-50"
          >
            <Trash2 size={14} />
            {deleting ? '刪除中...' : '刪除'}
          </button>
        </div>
      </div>

      {/* Quick info bar */}
      <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-5 bg-white rounded-xl px-4 py-3 border border-gray-100">
        {client.phone && (
          <div className="flex items-center gap-1.5">
            <Phone size={13} className="text-gray-400" />
            {client.phone}
          </div>
        )}
        {client.address && (
          <div className="flex items-center gap-1.5">
            <MapPin size={13} className="text-gray-400" />
            {client.address}
          </div>
        )}
        {client.next_visit_date && (
          <div className="flex items-center gap-1.5 text-orange-600">
            <Calendar size={13} />
            應回訪：{formatDate(client.next_visit_date)}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === key
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon size={14} />
            {label}
            {key === 'quotes' && quoteCount > 0 && (
              <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">
                {quoteCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {[
              { label: '公司名稱', value: client.company_name },
              { label: '聯絡人', value: client.contact_name },
              { label: '電話', value: client.phone },
              { label: 'LINE ID', value: client.line_id },
              { label: 'Email', value: client.email },
              { label: '地址', value: client.address },
              { label: '生日', value: formatDate(client.birthday) },
              { label: '興趣', value: client.interest },
              { label: '長相/特徵', value: client.appearance },
              { label: '已提供 DM', value: client.dm_provided ? '✓ 是' : '否' },
              { label: '服務週期', value: client.service_cycle_months ? `${client.service_cycle_months} 個月` : '—' },
              { label: '上次服務', value: formatDate(client.last_service_date) },
              { label: '下次回訪', value: formatDate(client.next_visit_date) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-gray-500 text-xs mb-0.5">{label}</div>
                <div className="text-gray-900">{value || '—'}</div>
              </div>
            ))}
            {client.notes && (
              <div className="sm:col-span-2">
                <div className="text-gray-500 text-xs mb-0.5">備註</div>
                <div className="text-gray-900 whitespace-pre-wrap">{client.notes}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'contacts' && <ContactsTab clientId={id} />}
      {activeTab === 'dates' && <ImportantDatesTab clientId={id} />}
      {activeTab === 'visits' && <VisitsTab clientId={id} />}
      {activeTab === 'projects' && <ProjectsTab clientId={id} autoEditProjectId={autoEditId} />}
      {activeTab === 'competitors' && <CompetitorsTab clientId={id} />}
      {activeTab === 'quotes' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">共 {quoteCount} 張報價單</span>
            <Link
              href={`/quotes/new?client_id=${id}&client_name=${encodeURIComponent(client.company_name)}`}
              className="text-sm text-blue-600 hover:underline"
            >
              + 新增報價單
            </Link>
          </div>
          {clientQuotes.map(q => (
            <Link key={q.id} href={`/quotes/${q.id}`}
              className="block bg-white rounded-xl p-4 border border-gray-100 hover:border-blue-300 transition">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold text-gray-900">{q.quote_no}</div>
                  <div className="text-sm text-gray-500">{q.project_name ?? '—'}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-gray-900">NT${Number(q.total_amount).toLocaleString()}</div>
                  <div className={`text-xs px-2 py-0.5 rounded-full inline-block ${
                    q.status === '草稿' ? 'bg-gray-100 text-gray-600' :
                    q.status === '已確認' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                  }`}>{q.status}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
