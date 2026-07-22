'use client'

// 資深工程師戰情室（2026-07）：自己底下的工程師
import TeamDashboard from '@/components/TeamDashboard'
import { HardHat } from 'lucide-react'

export default function SeniorEngineerDashboard() {
  return <TeamDashboard pageTitle="資深工程師戰情室" scope="subtree" icon={<HardHat size={22} className="text-amber-600" />} />
}
