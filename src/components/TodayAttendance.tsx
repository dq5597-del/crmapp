'use client'

/**
 * 今日出勤打卡總覽（2026-07）— CEO 戰情室 / 主管戰情室共用
 * 每位人員一個籤：綠＝準時、紅＝遲到（依 system_settings.work_start_time 判定）、灰＝未打卡
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Clock } from 'lucide-react'

const hhmm = (ts: string | null) =>
  ts ? new Date(ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) : null

export default function TodayAttendance() {
  const supabase = createClient()
  const [people, setPeople] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [workStart, setWorkStart] = useState('09:00')

  useEffect(() => {
    (async () => {
      const today = new Date().toLocaleDateString('sv')
      const [sp, at, st] = await Promise.all([
        supabase.from('user_profiles').select('id, full_name, is_active'),
        supabase.from('attendance_records').select('*').eq('work_date', today),
        supabase.from('system_settings').select('work_start_time').limit(1).maybeSingle(),
      ])
      setPeople((sp.data ?? []).filter((p: any) => p.is_active !== false))
      setRecords(at.data ?? [])
      if ((st.data as any)?.work_start_time) setWorkStart((st.data as any).work_start_time)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (people.length === 0) return null

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5">
        <Clock size={12} /> 今日出勤打卡（上班時間 {workStart}，遲到紅字）
      </div>
      <div className="flex flex-wrap gap-1.5">
        {people.map(p => {
          const r = records.find(x => x.user_id === p.id)
          const inT = hhmm(r?.clock_in ?? null)
          const outT = hhmm(r?.clock_out ?? null)
          const late = !!inT && inT > workStart
          return (
            <span key={p.id} className={`text-xs px-2.5 py-1 rounded-full border ${
              !inT ? 'bg-gray-50 border-gray-200 text-gray-400'
              : late ? 'bg-red-50 border-red-200 text-red-600 font-semibold'
              : 'bg-green-50 border-green-200 text-green-700'}`}>
              {p.full_name ?? '—'}：{!inT ? '未打卡' : `${inT}${late ? '（遲到）' : ''}`}{outT ? ` – ${outT}` : ''}
            </span>
          )
        })}
      </div>
    </div>
  )
}
