'use client'

// 會計人員戰情室（2026-07）：會計人員個人工作台（自己的出勤/行程/任務）
import TeamDashboard from '@/components/TeamDashboard'
import { Calculator } from 'lucide-react'

export default function AcctStaffDashboard() {
  return <TeamDashboard pageTitle="會計人員戰情室" scope="self" icon={<Calculator size={22} className="text-teal-600" />} />
}
