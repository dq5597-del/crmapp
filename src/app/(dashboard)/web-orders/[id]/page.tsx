'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { ArrowLeft, ExternalLink, FileUp, FileText, Truck, Save } from 'lucide-react'

const BUCKET = 'invoice-pdfs'

const CARRIER_LABEL: Record<string, string> = {
  member: '會員載具',
  mobile: '手機條碼',
  certificate: '自然人憑證',
  donate: '捐贈',
}

export default function WebOrderDetailPage() {
  const supabase = createClient()
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')

  const [order, setOrder] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [form, setForm] = useState({ invoice_no: '', invoice_date: '', invoice_pdf_url: '', invoice_notes: '' })

  useEffect(() => {
    if (!id) return
    supabase.from('web_orders').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      setOrder(data)
      if (data) {
        setForm({
          invoice_no: data.invoice_no ?? '',
          invoice_date: data.invoice_date ?? '',
          invoice_pdf_url: data.invoice_pdf_url ?? '',
          invoice_notes: data.invoice_notes ?? '',
        })
      }
      setLoading(false)
    })
  }, [id])

  async function handleUpload(file: File) {
    if (file.type !== 'application/pdf') { alert('請上傳 PDF 檔'); return }
    if (file.size > 5 * 1024 * 1024) { alert('檔案不可超過 5 MB'); return }

    setUploading(true)
    const path = `${id}/${crypto.randomUUID()}.pdf`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: 'application/pdf' })

    if (error) {
      alert(`上傳失敗：${error.message}`)
      setUploading(false)
      return
    }

    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    setForm(f => ({ ...f, invoice_pdf_url: url }))
    setUploading(false)
  }

  async function handleSave() {
    if (!form.invoice_no.trim()) { alert('請填寫發票號碼'); return }
    if (!form.invoice_date) { alert('請填寫開立日期'); return }

    setSaving(true)
    const res = await fetch(`/api/web/orders/${id}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    setSaving(false)

    if (!res.ok) { alert(json?.error ?? '儲存失敗'); return }

    if (json.pushError) {
      alert(`發票資料已存入 CRM，但回寫官網失敗：${json.pushError}`)
    } else {
      alert('已儲存並同步至官網')
    }
    router.refresh()
    const { data } = await supabase.from('web_orders').select('*').eq('id', id).maybeSingle()
    setOrder(data)
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">載入中…</div>
  if (!order) return <div className="p-6 text-sm text-gray-500">找不到這筆訂單。</div>

  const isCompany = order.invoice_type === 'company'
  const issued = order.invoice_status === '已開立'

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <Link href="/web-orders" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={16} /> 返回網路訂單
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">#{order.order_no}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {order.order_date ? formatDate(order.order_date) : '—'} · {order.customer_company || order.customer_name || '—'}
          </p>
        </div>
        {order.permalink && (
          <a href={order.permalink} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1.5 px-3 h-11 sm:h-9 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            <ExternalLink size={15} /> 在官網後台開啟
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-medium text-gray-900 mb-3">商品明細</h2>
            <div className="border-t border-gray-100">
              {(order.items ?? []).map((it: any, i: number) => (
                <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{it.name}</p>
                    {it.sku && <p className="text-xs text-gray-400 mt-0.5">{it.sku}</p>}
                  </div>
                  <span className="text-sm text-gray-500">x {it.qty}</span>
                  <span className="text-sm text-gray-900 w-24 text-right">{formatCurrency(Number(it.subtotal) || 0)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-3">
                <span className="text-sm text-gray-500">訂單金額</span>
                <span className="text-base font-medium text-gray-900">{formatCurrency(Number(order.total) || 0)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                <FileText size={16} className="text-gray-400" /> 電子發票
              </h2>
              <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${issued ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {order.invoice_status ?? '未開立'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3 border-y border-gray-100 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">發票類型</p>
                <p className="text-gray-900">{isCompany ? '公司（三聯式）' : '個人（二聯式）'}</p>
              </div>
              {isCompany ? (
                <>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">統一編號</p>
                    <p className="text-gray-900 font-mono">{order.invoice_tax_id || '—'}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-gray-500 mb-0.5">發票抬頭</p>
                    <p className="text-gray-900">{order.invoice_title || '—'}</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">存放方式</p>
                    <p className="text-gray-900">{CARRIER_LABEL[order.invoice_carrier_type] ?? '會員載具'}</p>
                  </div>
                  {order.invoice_carrier && (
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">載具號碼</p>
                      <p className="text-gray-900 font-mono">{order.invoice_carrier}</p>
                    </div>
                  )}
                  {order.invoice_donate && (
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">捐贈碼</p>
                      <p className="text-gray-900 font-mono">{order.invoice_donate}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">發票號碼</label>
                <input
                  value={form.invoice_no}
                  onChange={e => setForm(f => ({ ...f, invoice_no: e.target.value.toUpperCase() }))}
                  placeholder="AB12345678"
                  maxLength={10}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">開立日期</label>
                <input
                  type="date"
                  value={form.invoice_date}
                  onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="pb-4">
              <label className="block text-xs text-gray-500 mb-1.5">發票 PDF</label>
              {form.invoice_pdf_url ? (
                <div className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg">
                  <FileText size={18} className="text-gray-400" />
                  <a href={form.invoice_pdf_url} target="_blank" rel="noreferrer" className="flex-1 text-sm text-blue-600 truncate">
                    已上傳，點此檢視
                  </a>
                  <button onClick={() => setForm(f => ({ ...f, invoice_pdf_url: '' }))}
                          className="text-xs text-gray-400 hover:text-red-600">移除</button>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-1.5 px-4 py-6 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <FileUp size={22} className="text-gray-400" />
                  <span className="text-sm text-gray-600">{uploading ? '上傳中…' : '點擊選擇 PDF 檔案'}</span>
                  <span className="text-xs text-gray-400">單檔上限 5 MB</span>
                  <input type="file" accept="application/pdf" className="hidden"
                         onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
                </label>
              )}
            </div>

            <div className="pb-4">
              <label className="block text-xs text-gray-500 mb-1.5">備註（選填）</label>
              <textarea
                value={form.invoice_notes}
                onChange={e => setForm(f => ({ ...f, invoice_notes: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap gap-2 justify-end pt-3 border-t border-gray-100">
              <a href="https://www.einvoice.nat.gov.tw/" target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1.5 px-4 h-11 sm:h-9 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                <ExternalLink size={15} /> 開啟財政部平台
              </a>
              <button onClick={handleSave} disabled={saving || uploading}
                      className="inline-flex items-center gap-1.5 px-5 h-11 sm:h-9 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
                <Save size={15} /> {saving ? '儲存中…' : '儲存發票資料'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-medium text-gray-900 mb-3">收件資訊</h2>
            <div className="space-y-2.5 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">收件人</p>
                <p className="text-gray-900">{order.customer_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">電話</p>
                <p className="text-gray-900">{order.customer_phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Email</p>
                <p className="text-gray-900 break-all">{order.customer_email || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">地址</p>
                <p className="text-gray-900">{order.shipping_address || '—'}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Truck size={16} className="text-gray-400" /> 物流
            </h2>
            <div className="space-y-2.5 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">配送方式</p>
                <p className="text-gray-900">{order.shipping_method || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">宅配單號</p>
                <p className="text-gray-900 font-mono">{order.tracking_no || '尚未出貨'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">狀態</p>
                <p className="text-gray-900">{order.shipping_status || '—'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
