'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { usePermissions, FEATURES } from '@/lib/permissions'
import Sidebar from './Sidebar'
import { Menu } from 'lucide-react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const { can, ready } = usePermissions()

  // 依網址找出對應功能（最長前綴優先），沒對應到的頁面不擋
  const feature = FEATURES
    .filter(f => f.href && f.href !== '/' && pathname.startsWith(f.href))
    .sort((a, b) => (b.href!.length - a.href!.length))[0]?.key
    ?? (pathname === '/' ? 'dashboard' : undefined)
  const blocked = ready && feature ? !can(feature, 'can_view') : false

  return (
    <div className="app-shell flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <header className="no-print lg:hidden flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-600 hover:text-gray-900"
          >
            <Menu size={22} />
          </button>
          <span className="font-semibold text-gray-900">光輝影音科技 CRM</span>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {blocked ? (
            <div className="p-10 max-w-lg mx-auto text-center">
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6 text-sm">
                你沒有這個功能的使用權限。<br />如需開通請聯繫管理員。
              </div>
            </div>
          ) : children}
        </main>
      </div>
    </div>
  )
}
