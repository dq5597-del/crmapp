'use client'

import { useEffect, useState } from 'react'
import { Cloud, RefreshCw } from 'lucide-react'

interface ForecastDay {
  date: string
  weekday: string
  weather: string
  temp_max: number
  temp_min: number
  rain_pct: number
  wind_speed: number
}

interface WeatherData {
  area: string
  forecast: ForecastDay[]
  updated_at: string
}

function weatherEmoji(weather: string): string {
  if (weather.includes('晴')) return '☀️'
  if (weather.includes('多雲') || weather.includes('大致晴')) return '⛅'
  if (weather.includes('陰')) return '☁️'
  if (weather.includes('雷')) return '⛈️'
  if (weather.includes('雨')) return '🌧️'
  if (weather.includes('霧')) return '🌫️'
  if (weather.includes('雪')) return '❄️'
  return '🌤️'
}

export default function WeatherWidget() {
  const [data, setData] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  async function fetchWeather() {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/weather')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setData(json)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchWeather() }, [])

  return (
    <div className="bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl p-5 text-white">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Cloud size={18} />
          <span className="font-semibold">花蓮天氣預報</span>
          {data && <span className="text-sky-200 text-xs">{data.area}</span>}
        </div>
        <button
          onClick={fetchWeather}
          disabled={loading}
          className="text-sky-200 hover:text-white transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && (
        <div className="text-center py-6 text-sky-200 text-sm">載入中...</div>
      )}
      {error && (
        <div className="text-center py-6 text-sky-200 text-sm">無法取得天氣資料</div>
      )}
      {data && (
        <div className="grid grid-cols-7 gap-1">
          {data.forecast.map((day) => (
            <div key={day.date} className="flex flex-col items-center text-center">
              <div className="text-sky-200 text-xs mb-1">{day.weekday}</div>
              <div className="text-lg">{weatherEmoji(day.weather)}</div>
              <div className="text-xs font-semibold mt-1">{day.temp_max}°</div>
              <div className="text-sky-300 text-xs">{day.temp_min}°</div>
              <div className="text-sky-200 text-xs mt-1">{day.rain_pct}%</div>
            </div>
          ))}
        </div>
      )}
      {data && (
        <div className="text-sky-300 text-xs mt-3">
          更新：{new Date(data.updated_at).toLocaleString('zh-TW')} | Open-Meteo
        </div>
      )}
    </div>
  )
}
