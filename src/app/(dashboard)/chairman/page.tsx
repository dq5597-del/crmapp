'use client'

// 董事長戰情室（2026-07 新增）：全公司視角
import TeamDashboard from '@/components/TeamDashboard'
import { Crown } from 'lucide-react'

export default function ChairmanDashboard() {
  return <TeamDashboard pageTitle="董事長戰情室" scope="all" icon={<Crown size={22} className="text-amber-500" />} />
}
