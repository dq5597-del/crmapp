import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 常用車站代碼（TDX 台鐵站碼）
export const STATIONS: Record<string, string> = {
  花蓮: '7000', 台北: '1000', 台東: '7150',
  板橋: '1020', 南港: '0990', 樹林: '1040',
  瑞穗: '7060', 玉里: '7080', 池上: '7110',
  宜蘭: '7190', 羅東: '7180', 台中: '3300', 高雄: '4400',
}

let cachedToken: { token: string; exp: number } | null = null

async function getToken(): Promise<{ token: string } | { error: string }> {
  const id = process.env.TDX_CLIENT_ID?.trim()
  const secret = process.env.TDX_CLIENT_SECRET?.trim()
  if (!id || !secret) {
    return { error: `環境變數未讀到（TDX_CLIENT_ID:${id ? 'OK' : '缺'}／TDX_CLIENT_SECRET:${secret ? 'OK' : '缺'}）。請確認 Vercel 變數名稱正確並重新部署。` }
  }

  if (cachedToken && Date.now() < cachedToken.exp) return { token: cachedToken.token }

  const res = await fetch('https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret,
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    return { error: `TDX 驗證失敗（${res.status}）：${t.slice(0, 200)}` }
  }
  const data = await res.json()
  cachedToken = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 }
  return { token: cachedToken.token }
}

function todayTaipei(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
}
function nowHM(): string {
  return new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })
}

// GET /api/train?from=花蓮&to=台北&limit=5
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? '花蓮'
  const to = searchParams.get('to') ?? '台北'
  const limit = Number(searchParams.get('limit') ?? 5)

  const fromId = STATIONS[from]
  const toId = STATIONS[to]
  if (!fromId || !toId) return NextResponse.json({ error: '未支援的車站' }, { status: 400 })

  const auth = await getToken()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 500 })
  const token = auth.token

  async function query(date: string) {
    const url = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/OD/${fromId}/to/${toId}/${date}?%24format=JSON`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (!res.ok) {
      const t = await res.text()
      throw new Error('TDX 查詢失敗：' + t.slice(0, 200))
    }
    const data = await res.json()
    const list: any[] = data?.TrainTimetables ?? []
    return list.map(t => {
      const stops = t.StopTimes ?? []
      const dep = stops[0]?.DepartureTime ?? ''
      const arr = stops[stops.length - 1]?.ArrivalTime ?? ''
      return {
        trainNo: t.TrainInfo?.TrainNo ?? '',
        trainType: t.TrainInfo?.TrainTypeName?.Zh_tw ?? '',
        departure: dep.slice(0, 5),
        arrival: arr.slice(0, 5),
      }
    })
  }

  const now = nowHM()
  try {
    const today = todayTaipei()
    let trains = (await query(today))
      .filter(t => t.departure && t.departure >= now)
      .sort((a, b) => a.departure.localeCompare(b.departure))
      .slice(0, limit)

    if (trains.length > 0) {
      return NextResponse.json({ from, to, date: today, now, nextDay: false, trains })
    }

    // 今日已無班次 → 自動查隔天
    const tomorrow = todayTaipei(1)
    trains = (await query(tomorrow))
      .filter(t => t.departure)
      .sort((a, b) => a.departure.localeCompare(b.departure))
      .slice(0, limit)

    return NextResponse.json({ from, to, date: tomorrow, now, nextDay: true, trains })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '查詢失敗' }, { status: 500 })
  }
}
