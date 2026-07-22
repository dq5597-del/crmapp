'use client'

// 會計主管戰情室（2026-07）：全區所有會計線人員（跨通訊處）
import TeamDashboard from '@/components/TeamDashboard'
import { Calculator } from 'lucide-react'

export default function AcctHeadDashboard() {
  return <TeamDashboard pageTitle="會計主管戰情室" scope="acct-line" icon={<Calculator size={22} className="text-emerald-600" />} />
}
