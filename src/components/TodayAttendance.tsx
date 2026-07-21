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
  const [branches, setBranches] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [workStart, setWorkStart] = useState('09:00')

  useEffect(() => {
    (async () => {
      const today = new Date().toLocaleDateString('sv')
      const [sp, br, at, st] = await Promise.all([
        supabase.from('user_profiles').select('id, full_name, is_active, branch_id'),
        supabase.from('branches').select('id, name').order('name'),
        supabase.from('attendance_records').select('*').eq('work_date', today),
        supabase.from('system_settings').select('work_start_time').limit(1).maybeSingle(),
      ])
      setPeople((sp.data ?? []).filter((p: any) => p.is_active !== false))
      setBranches(br.data ?? [])
      setRecords(at.data ?? [])
      if ((st.data as any)?.work_start_time) setWorkStart((st.data as any).work_start_time)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (people.length === 0) return null

  // 依通訊處分組（未分配的歸「未分配通訊處」）
  const groups: { name: string; members: any[] }[] = [
    ...branches.map(b => ({ name: b.name, members: people.filter(p => p.branch_id === b.id) })),
    { name: '未分配通訊處', members: people.filter(p => !p.branch_id || !branches.some(b => b.id === p.branch_id)) },
  ].filter(g => g.members.length > 0)

  const chip = (p: any) => {
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
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5">
        <Clock size={12} /> 今日出勤打卡（上班時間 {workStart}，遲到紅字）
      </div>
      <div className="space-y-2">
        {groups.map(g => (
          <div key={g.name}>
            <div className="text-[11px] text-gray-400 mb-1">{g.name}（{g.members.length} 人）</div>
            <div className="flex flex-wrap gap-1.5">{g.members.map(chip)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
