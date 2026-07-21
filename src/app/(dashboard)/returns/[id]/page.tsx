'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { ArrowLeft, PackageCheck, Ban, CheckCircle2 } from 'lucide-react'
import DocActionBar from '@/components/DocActionBar'

const STATUS_COLORS: Record<string, string> = {
  '待審核': 'bg-gray-100 text-gray-600',
  '已入庫': 'bg-blue-100 text-blue-700',
  '已結算': 'bg-green-100 text-green-700',
  '作廢':   'bg-red-100 text-red-400',
}

const TYPE_COLORS: Record<string, string> = {
  '客戶退貨':   'bg-purple-100 text-purple-700',
  '供應商退貨': 'bg-amber-100 text-amber-700',
}

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [ret, setRet] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [linkedBill, setLinkedBill] = useState<any>(null) // receivable or payable
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  const fetchAll = useCallback(async () => {
    const { data: r } = await supabase
      .from('returns')
      .select('*, clients(company_name), vendors(company_name, bank_name, bank_account, bank_account_name)')
      .eq('id', id)
      .single()
    setRet(r)

    const { data: i } = await supabase.from('return_items').select('*').eq('return_id', id).order('seq_no')
    setItems(i ?? [])

    if (r?.ref_doc_id) {
      if (r.ref_doc_type === 'sales_order') {
        const { data: bill } = await supabase.from('receivables').select('*').eq('sales_order_id', r.ref_doc_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        setLinkedBill(bill)
      } else if (r.ref_doc_type === 'purchase_order') {
        const { data: bill } = await supabase.from('payables').select('*').eq('purchase_order_id', r.ref_doc_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
        setLinkedBill(bill)
      }
    }
    setLoading(false)
  }, [id, supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleConfirmStock() {
    if (!ret) return
    if (!confirm(ret.return_type === '客戶退貨' ? '確認商品已入庫？將自動增加庫存。' : '確認商品已出庫寄回廠商？將自動扣減庫存。')) return
    setProcessing(true)
    try {
      const isCustomerReturn = ret.return_type === '客戶退貨'
      const txType = isCustomerReturn ? '退貨入庫' : '供應商退貨出庫'

      for (const item of items) {
        if (!item.product_id) continue // 沒有連結產品的品項無法異動庫存
        const qty = isCustomerReturn ? Math.abs(item.quantity) : -Math.abs(item.quantity)
        const { error } = await supabase.from('inventory_transactions').insert({
          product_id: item.product_id,
          type: txType,
          quantity: qty,
          unit_cost: item.unit_price || null,
          reference_type: 'return',
          reference_id: ret.id,
          reference_no: ret.return_no,
          vendor_id: ret.vendor_id || null,
          notes: `退貨單 ${ret.return_no}`,
        })
        if (error) throw error
      }

      await supabase.from('returns').update({ status: '已入庫' }).eq('id', id)
      await fetchAll()
    } catch (e: any) {
      alert('入庫處理失敗: ' + e.message)
    }
    setProcessing(false)
  }

  async function handleVoid() {
    if (!confirm('確定作廢此退貨單？作廢後不可復原。')) return
    setProcessing(true)
    await supabase.from('returns').update({ status: '作廢' }).eq('id', id)
    await fetchAll()
    setProcessing(false)
  }

  async function handleSettle() {
    if (!ret) return
    setProcessing(true)
    try {
      if (ret.settlement_method === '沖抵帳款' && linkedBill) {
        if (ret.return_type === '客戶退貨') {
          const { error } = await supabase.from('payment_records').insert({
            receivable_id: linkedBill.id,
            payment_date: new Date().toISOString().slice(0, 10),
            amount: -Math.abs(ret.total_amount),
            payment_method: '退貨沖抵',
            notes: `退貨單 ${ret.return_no} 沖抵`,
          })
          if (error) throw error
          await supabase.from('returns').update({
            status: '已結算', settled_at: new Date().toISOString(),
            settled_ref_type: 'payment_record', settled_ref_id: linkedBill.id,
          }).eq('id', id)
        } else {
          const { error } = await supabase.from('payable_payments').insert({
            payable_id: linkedBill.id,
            payment_date: new Date().toISOString().slice(0, 10),
            amount: -Math.abs(ret.total_amount),
            payment_method: '退貨沖抵',
            notes: `退貨單 ${ret.return_no} 沖抵`,
          })
          if (error) throw error
          await supabase.from('returns').update({
            status: '已結算', settled_at: new Date().toISOString(),
            settled_ref_type: 'payable_payment', settled_ref_id: linkedBill.id,
          }).eq('id', id)
        }
      } else {
        if (!confirm('此退貨無關聯帳款可自動沖抵，確認僅將狀態標記為已結算？（實際退款/換貨請自行至會計模組登錄）')) {
          setProcessing(false)
          return
        }
        await supabase.from('returns').update({ status: '已結算', settled_at: new Date().toISOString() }).eq('id', id)
      }
      await fetchAll()
    } catch (e: any) {
      alert('結算失敗: ' + e.message)
    }
    setProcessing(false)
  }

  if (loading) return <div className="p-6 text-gray-400">載入中...</div>
  if (!ret) return <div className="p-6 text-gray-400">找不到此退貨單</div>

  const partnerName = ret.clients?.company_name ?? ret.vendors?.company_name ?? '—'

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{ret.return_no}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${TYPE_COLORS[ret.return_type]}`}>{ret.return_type}</span>
            <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${STATUS_COLORS[ret.status]}`}>{ret.status}</span>
          </div>
          <div className="text-sm text-gray-500 mt-0.5">{partnerName}</div>
        </div>
        {ret.status === '待審核' && (
          <div className="flex gap-2">
            <button onClick={handleVoid} disabled={processing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-60">
              <Ban size={13} /> 作廢
            </button>
            <button onClick={handleConfirmStock} disabled={processing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              <PackageCheck size={13} /> {ret.return_type === '客戶退貨' ? '確認入庫' : '確認出庫'}
            </button>
          </div>
        )}
        {ret.status === '已入庫' && (
          <button onClick={handleSettle} disabled={processing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60">
            <CheckCircle2 size={13} /> {processing ? '處理中...' : '確認結算'}
          </button>
        )}
      </div>

      {/* 列印分享（比照估價單） */}
      <div className="mb-5">
        <DocActionBar docType="return" docId={ret.id} printHref={`/returns/${ret.id}/print`}
          emailLabel={ret.return_type === '客戶退貨' ? 'Email 給客戶' : 'Email 給廠商'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 左：基本資訊 */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-3">
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">基本資訊</div>
            {[
              { label: '關聯單據', value: ret.ref_doc_no ?? '無' },
              { label: '退貨日期', value: formatDate(ret.return_date) },
              { label: '退貨原因', value: ret.return_reason ?? '—' },
              { label: '品項狀況', value: ret.item_condition },
              { label: '財務處理方式', value: ret.settlement_method },
            ].map(item => (
              <div key={item.label} className="flex justify-between text-sm">
                <span className="text-gray-500">{item.label}</span>
                <span className="font-medium text-gray-800 text-right max-w-48">{item.value}</span>
              </div>
            ))}
            {ret.notes && <div className="border-t border-gray-100 pt-3 text-sm text-gray-600">{ret.notes}</div>}
          </div>

          {/* 金額摘要 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-2">
            <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">金額</div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">小計</span><span>{formatCurrency(ret.subtotal)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">稅額（5%）</span><span>{formatCurrency(ret.tax_amount)}</span></div>
            <div className="flex justify-between font-bold border-t border-gray-100 pt-2"><span>含稅總計</span><span className="text-purple-700">{formatCurrency(ret.total_amount)}</span></div>
          </div>

          {/* 沖抵帳款資訊 */}
          {ret.settlement_method === '沖抵帳款' && (
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5">
              <div className="text-xs text-orange-700 font-medium mb-3 uppercase tracking-wide">
                {ret.return_type === '客戶退貨' ? '關聯應收帳款' : '關聯應付帳款'}
              </div>
              {linkedBill ? (
                <div className="space-y-1.5 text-sm text-gray-700">
                  <div className="font-semibold">{linkedBill.receivable_no ?? linkedBill.payable_no}</div>
                  <div className="text-xs text-gray-500">
                    {ret.return_type === '客戶退貨'
                      ? `餘額：${formatCurrency(linkedBill.balance)}`
                      : `餘額：${formatCurrency(linkedBill.balance)}`}
                  </div>
                  {ret.status === '已結算' && (
                    <div className="text-xs text-green-700 mt-2 bg-green-100 px-2 py-1 rounded">已沖抵 {formatCurrency(ret.total_amount)}</div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-500">無找到關聯帳款，結算時將僅標記狀態</div>
              )}
            </div>
          )}
        </div>

        {/* 右：品項明細 */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="font-semibold text-gray-900">退貨品項</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">#</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">品名</th>
                    <th className="text-center px-3 py-3 text-gray-600 font-medium">數量</th>
                    <th className="text-right px-4 py-3 text-gray-600 font-medium">單價</th>
                    <th className="text-right px-4 py-3 text-gray-600 font-medium">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i, idx) => (
                    <tr key={i.id} className="border-t border-gray-50">
                      <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{i.product_name}</div>
                        {i.model && <div className="text-xs text-gray-400">{i.model}</div>}
                      </td>
                      <td className="px-3 py-3 text-center">{i.quantity} {i.unit}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(i.unit_price)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(i.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
