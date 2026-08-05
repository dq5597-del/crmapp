'use client'

// 工程師戰情室（2026-07）：全區所有技術線人員（跨通訊處）
import TeamDashboard from '@/components/TeamDashboard'
import { Wrench } from 'lucide-react'

export default function TechHeadDashboard() {
  return <TeamDashboard pageTitle="工程師戰情室" scope="tech-line" room="tech-team" icon={<Wrench size={22} className="text-purple-600" />} />
}
