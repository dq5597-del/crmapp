import { NextResponse } from 'next/server'

// 花蓮各區座標
const HUALIEN_AREAS = [
  { name: '花蓮市', lat: 23.9772, lon: 121.6044 },
  { name: '吉安鄉', lat: 23.9503, lon: 121.5869 },
  { name: '新城鄉', lat: 24.1328, lon: 121.6497 },
]

export async function GET() {
  try {
    const area = HUALIEN_AREAS[0] // 預設花蓮市

    const url = `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${area.lat}&longitude=${area.lon}` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max` +
      `&timezone=Asia%2FTaipei&forecast_days=7`

    const res = await fetch(url, { next: { revalidate: 3600 } }) // 1小時快取
    if (!res.ok) throw new Error('Weather API failed')

    const data = await res.json()

    const WMO_CODES: Record<number, string> = {
      0: '晴天', 1: '大致晴朗', 2: '多雲', 3: '陰天',
      45: '霧', 48: '霧淞',
      51: '小毛雨', 53: '毛雨', 55: '濃毛雨',
      61: '小雨', 63: '中雨', 65: '大雨',
      71: '小雪', 73: '中雪', 75: '大雪',
      80: '陣雨', 81: '中陣雨', 82: '強陣雨',
      95: '雷雨', 96: '雷雨夾冰雹', 99: '強雷雨夾冰雹',
    }

    const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

    const forecast = data.daily.time.map((date: string, i: number) => {
      const d = new Date(date)
      const code = data.daily.weathercode[i]
      return {
        date,
        weekday: `週${WEEKDAYS[d.getDay()]}`,
        weather: WMO_CODES[code] ?? '未知',
        temp_max: data.daily.temperature_2m_max[i],
        temp_min: data.daily.temperature_2m_min[i],
        rain_pct: data.daily.precipitation_probability_max[i],
        wind_speed: data.daily.windspeed_10m_max[i],
      }
    })

    return NextResponse.json({ area: area.name, forecast, updated_at: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch weather' }, { status: 500 })
  }
}
