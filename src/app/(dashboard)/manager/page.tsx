'use client'

// 總經理戰情室（原主管戰情室，2026-07 改制）：看所有經理＋主任＋人員
import TeamDashboard from '@/components/TeamDashboard'
import { ShieldCheck } from 'lucide-react'

export default function GmDashboard() {
  return <TeamDashboard pageTitle="總經理戰情室" scope="gm" icon={<ShieldCheck size={22} className="text-blue-600" />} />
}
