'use client'

// 主任戰情室（2026-07 新增）：各主任登入只看自己群組（直屬人員）
import TeamDashboard from '@/components/TeamDashboard'
import { Users } from 'lucide-react'

export default function TeamLeadDashboard() {
  return <TeamDashboard pageTitle="主任戰情室" scope="direct" icon={<Users size={22} className="text-teal-600" />} />
}
