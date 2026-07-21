'use client'

/**
 * 通用單據動作列（2026-07）— 比照估價單：
 * 預覽列印｜匯出 PDF｜匯出 Word｜匯出 Excel｜分享(寄自己信箱)｜Email 給客戶/廠商
 * 用於：訂購單、退貨單、出貨單、詢價單（銷貨單補 Email）
 */

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Eye, FileDown, FileText, Sheet, Send } from 'lucide-react'

export default function DocActionBar({ docType, docId, printHref, emailLabel = 'Email 給客戶', defaultEmail = '' }: {
  docType: 'purchase-order' | 'return' | 'shipment' | 'inquiry' | 'sales-order'
  docId: string
  printHref: string
  emailLabel?: string
  defaultEmail?: string
}) {
  const supabase = createClient()
  const [loading, setLoading] = useState<string | null>(null)
  const base = `/api/docs/${docType}/${docId}`
  const btn = 'flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50'

  async function sendTo(to: string, tag: string) {
    setLoading(tag)
    try {
      const res = await fetch(`${base}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      })
      const data = await res.json()
      alert(data.success ? `✅ 已寄出至 ${to}` : `寄送失敗：${data.error ?? ''}`)
    } catch (e: any) {
      alert('寄送失敗：' + e.message)
    }
    setLoading(null)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <a href={printHref} target="_blank" rel="noreferrer" className={btn}><Eye size={13} /> 預覽列印</a>
      <a href={printHref} target="_blank" rel="noreferrer" title="開啟後選「另存為 PDF」" className={btn}><FileDown size={13} /> 匯出 PDF</a>
      <a href={`${base}/export-docx`} className={btn}><FileText size={13} /> 匯出 Word</a>
      <a href={`${base}/export-xlsx`} className={btn}><Sheet size={13} /> 匯出 Excel</a>
      <button type="button" className={btn} disabled={loading !== null}
        onClick={async () => {
          const { data: { user } } = await supabase.auth.getUser()
          const me = user?.email
          if (!me) { alert('取不到你的登入信箱'); return }
          await sendTo(me, 'share')
        }}>
        <Send size={13} /> {loading === 'share' ? '寄送中...' : '分享(寄自己)'}
      </button>
      <button type="button" className={btn + ' text-blue-700 border-blue-200'} disabled={loading !== null}
        onClick={async () => {
          const to = window.prompt('請輸入收件人 Email：', defaultEmail)
          if (!to) return
          await sendTo(to.trim(), 'email')
        }}>
        <Send size={13} /> {loading === 'email' ? '寄送中...' : emailLabel}
      </button>
    </div>
  )
}
