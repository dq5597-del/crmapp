'use client'

/**
 * 上班/下班打卡（2026-07 新增）— 顯示在側邊欄
 * 每人每天一筆（attendance_records），上班、下班各打一次
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { LogIn, LogOut as LogOutIcon, Clock } from 'lucide-react'

const hhmm = (ts: string | null) =>
  ts ? new Date(ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) : null

export default function PunchClock() {
  const supabase = createClient()
  const [rec, setRec] = useState<any | null>(null)
  const [uid, setUid] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [workStart, setWorkStart] = useState('09:00')

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUid(user.id)
    const today = new Date().toLocaleDateString('sv')
    const [{ data }, { data: settings }] = await Promise.all([
      supabase.from('attendance_records').select('*').eq('user_id', user.id).eq('work_date', today).maybeSingle(),
      supabase.from('system_settings').select('work_start_time').limit(1).maybeSingle(),
    ])
    setRec(data ?? null)
    if ((settings as any)?.work_start_time) setWorkStart((settings as any).work_start_time)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function punchIn() {
    if (!uid || busy) return
    setBusy(true)
    const today = new Date().toLocaleDateString('sv')
    const { error } = await supabase.from('attendance_records')
      .upsert({ user_id: uid, work_date: today, clock_in: new Date().toISOString() }, { onConflict: 'user_id,work_date' })
    if (error) alert('打卡失敗：' + error.message)
    await load()
    setBusy(false)
  }

  async function punchOut() {
    if (!uid || busy || !rec) return
    setBusy(true)
    const { error } = await supabase.from('attendance_records')
      .update({ clock_out: new Date().toISOString() }).eq('id', rec.id)
    if (error) alert('打卡失敗：' + error.message)
    await load()
    setBusy(false)
  }

  const inTime = hhmm(rec?.clock_in)
  const outTime = hhmm(rec?.clock_out)
  const isLate = !!inTime && inTime > workStart

  return (
    <div className="px-3 py-2 border-t border-gray-700">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-1.5 px-1">
        <Clock size={11} /> 今日打卡
        {inTime && <span className={`ml-auto ${isLate ? 'text-red-400 font-semibold' : 'text-emerald-400'}`}>上 {inTime}{isLate ? '（遲到）' : ''}</span>}
        {outTime && <span className="text-sky-400">下 {outTime}</span>}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" onClick={punchIn} disabled={busy || !!inTime}
          className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors ${
            inTime ? 'bg-gray-800 text-gray-500 cursor-default' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}>
          <LogIn size={13} /> {inTime ? '已上班' : '上班打卡'}
        </button>
        <button type="button" onClick={punchOut} disabled={busy || !inTime || !!outTime}
          className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors ${
            outTime ? 'bg-gray-800 text-gray-500 cursor-default'
            : !inTime ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
            : 'bg-sky-600 hover:bg-sky-500 text-white'}`}>
          <LogOutIcon size={13} /> {outTime ? '已下班' : '下班打卡'}
        </button>
      </div>
    </div>
  )
}
