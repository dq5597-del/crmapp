'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  LayoutDashboard, Users, FileText, ShoppingCart, Package,
  Settings, LogOut, ChevronRight, Truck, X, Building2, Warehouse, CreditCard, Receipt, Wrench, BookOpen
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/',                 label: '戰情室',   icon: LayoutDashboard },
  { href: '/clients',          label: '客戶資料', icon: Users },
  { href: '/quotes',           label: '報價單',   icon: FileText },
  { href: '/sales-orders',     label: '銷貨單',   icon: ShoppingCart },
  { href: '/service-requests', label: '叫修管理', icon: Wrench },
  { href: '/purchase-orders',  label: '訂購單',   icon: Truck },
  { href: '/receivables',      label: '應收帳款', icon: CreditCard },
  { href: '/payables',         label: '應付帳款', icon: Receipt },
  { href: '/vendors',          label: '廠商建檔', icon: Building2 },
  { href: '/inventory',        label: '庫存管理', icon: Warehouse },
  { href: '/products',                label: '產品管理', icon: Package },
  { href: '/accounting/expenses',    label: '支出記錄', icon: BookOpen },
  { href: '/accounting/pnl',        label: '損益表',   icon: BookOpen },
  { href: '/settings',              label: '系統設定', icon: Settings },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed top-0 left-0 h-screen w-60 bg-gray-900 text-white z-40 flex flex-col transition-transform duration-200',
        'lg:translate-x-0 lg:static lg:z-auto',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-sm font-bold shrink-0">
              光
            </div>
            <span className="font-semibold text-sm leading-tight">光輝影音科技<br/>CRM系統</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto scrollbar-thin">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive(href)
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )}
            >
              <Icon size={18} className="shrink-0" />
              <span className="flex-1">{label}</span>
              {isActive(href) && <ChevronRight size={14} />}
            </Link>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 pb-4 border-t border-gray-700 pt-3 shrink-0">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover: