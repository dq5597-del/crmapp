'use client'

import { useState, useEffect, useCallback } from 'react'
import { TrainFront, RefreshCw, ArrowRightLeft } from 'lucide-react'

type Train = { trainNo: string; trainType: string; departure: string; arrival: string }

const ROUTES = [
  { from: '花蓮', to: '台北' },
  { from: '台北', to: '花蓮' },
  { from: '花蓮', to: '台東' },
  { from: '台東', to: '花蓮' },
  { from: '花蓮', to: '玉里' },
  { from: '玉里', to: '花蓮' },
  { from: '花蓮', to: '瑞穗' },
  { from: '瑞穗', to: '花蓮' },
  { from: '花蓮', to: '羅東' },
  { from: '羅東', to: '花蓮' },
  { from: '花蓮', to: '宜蘭' },
  { from: '宜蘭', to: '花蓮' },
]

export default function TrainWidget() {
  const [idx, setIdx] = useState(0)
  const [trains, setTrains] = useState<Train[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [now, setNow] = useState('')

  const route = ROUTES[idx]

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const res = await fetch(`/api/train?from=${encodeURIComponent(route.from)}&to=${encodeURIComponent(route.to)}&limit=5`)
      const data = await res.json()
      if (data.error) { setErr(data.error); setTrains([]) }
      else { setTrains(data.trains ?? []); setNow(data.now ?? '') }
    } catch (e: any) {
      setErr(e?.message ?? '查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [route.from, route.to])

  useEffect(() => {
    load()
    const iv = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [load])

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <TrainFront size={17} className="text-indigo-600" /> 火車時刻
          {now && <span className="text-xs text-gray-400 font-normal">（{now} 之後）</span>}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setIdx(i => (i % 2 === 0 ? i + 1 : i - 1))}
            title="對調起訖站"
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50">
            <ArrowRightLeft size={14} />
          </button>
          <button onClick={load} disabled={loading}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 mb-3 flex-wrap">
        {ROUTES.map((r, i) => (
          <button key={i} onClick={() => setIdx(i)}
            className={`px-2.5 py-1 rounded-full text-xs border transition ${
              idx === i ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:border-indigo-300'
            }`}>
            {r.from}→{r.to}
          </button>
        ))}
      </div>

      {err ? (
        <p className="text-xs text-red-600 py-3">{err}</p>
      ) : loading ? (
        <p className="text-sm text-gray-400 text-center py-4">查詢中…</p>
      ) : trains.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">今日已無班次</p>
      ) : (
        <div className="space-y-1">
          {trains.map(t => (
            <div key={t.trainNo} className="flex items-center gap-3 py-2 border-t border-gray-50 text-sm">
              <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-medium shrink-0 w-20 text-center">
                {t.trainType}
              </span>
              <span className="text-gray-500 text-xs shrink-0 w-12">{t.trainNo}</span>
              <div className="flex-1 flex items-center gap-2 font-medium text-gray-900">
                {t.departure}
                <span className="text-gray-300">→</span>
                {t.arrival}
              </div>
              <span className="text-xs text-gray-400 shrink-0">
                {(() => {
                  const [dh, dm] = t.departure.split(':').map(Number)
                  const [ah, am] = t.arrival.split(':').map(Number)
                  let mins = (ah * 60 + am) - (dh * 60 + dm)
                  if (mins < 0) mins += 24 * 60
                  return `${Math.floor(mins / 60)}時${String(mins % 60).padStart(2, '0')}分`
                })()}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">資料來源：TDX 運輸資料流通服務・每 5 分鐘更新</p>
    </div>
  )
}
