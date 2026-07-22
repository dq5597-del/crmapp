'use client'

// 總工程師戰情室（2026-07）：自己支線（底下所有資深工程師＋工程師）
import TeamDashboard from '@/components/TeamDashboard'
import { HardHat } from 'lucide-react'

export default function ChiefEngineerDashboard() {
  return <TeamDashboard pageTitle="總工程師戰情室" scope="subtree" icon={<HardHat size={22} className="text-orange-600" />} />
}
