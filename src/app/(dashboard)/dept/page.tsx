'use client'

// 經理戰情室（2026-07 新增）：各經理登入只看自己底下的主任與其群組人員（組織樹子樹）
import TeamDashboard from '@/components/TeamDashboard'
import { Briefcase } from 'lucide-react'

export default function DeptDashboard() {
  return <TeamDashboard pageTitle="經理戰情室" scope="subtree" icon={<Briefcase size={22} className="text-indigo-600" />} />
}
