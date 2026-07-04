'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  LayoutDashboard, Users, FileText, ShoppingCart, Package,
  Settings, LogOut, ChevronRight, ChevronDown, Truck, X, Building2, Warehouse,
  CreditCard, Receipt, Wrench, BookOpen, Library, Calculator, Briefcase, Scale, Wallet
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItemsTop = [
  { href: '/', label: '戰情室', icon: LayoutDashboard },
]

const businessItems = [
  { href: '/quotes',           label: '報價單',   icon: FileText },
  { href: '/service-requests', label: '叫修管理', icon: Wrench },
]

const companyItems = [
  { href: '/clients', label: '客戶資料', icon: Users },
  { href: '/vendors', label: '廠商建檔', icon: Building2 },
]

const psiItems = [
  { href: '/sales-orders',    label: '銷貨單',   icon: ShoppingCart },
  { href: '/purchase-orders', label: '訂購單',   icon: Truck },
  { href: '/inventory',       label: '庫存管理', icon: Warehouse },
  { href: '/products',        label: '產品管理', icon: Package },
]

const navItemsMid = [
  { href: '/receivables', label: '應收帳款', icon: CreditCard },
  { href: '/payables',    label: '應付帳款', icon: Receipt },
]

const accountingItems = [
  { href: '/accounting/income',        label: '收入記錄',   icon: BookOpen },
  { href: '/accounting/expenses',      label: '支出記錄',   icon: BookOpen },
  { href: '/accounting/pnl',           label: '損益表',     icon: BookOpen },
  { href: '/accounting/balance-sheet', label: '資產負債表', icon: Scale },
  { href: '/accounting/cash-flow',     label: '現金流量表', icon: Wallet },
]

const navItemsAfter = [
  { href: '/knowledge-base', label: 'SOP／教材庫', icon: Library },
  { href: '/settings',       label: '系統設定',   icon: Settings },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

function NavLink({ href, label, icon: Icon, active, onClick, sub }: {
  href: string; label: string; icon: any; active: boolean; onClick: () => void; sub?: boolean
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
        sub ? 'px-3 py-2' : 'px-3 py-2.5',
        active
          ? 'bg-blue-600 text-white'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      )}
    >
      <Icon size={sub ? 16 : 18} className="shrink-0" />
      <span className="flex-1">{label}</span>
      {active && <ChevronRight size={sub ? 12 : 14} />}
    </Link>
  )
}

function NavGroup({ label, icon: Icon, items, active, open, onToggle, isActive, onClose }: {
  label: string; icon: any; items: { href: string; label: string; icon: any }[]
  active: boolean; open: boolean; onToggle: () => void
  isActive: (href: string) => boolean; onClose: () => void
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          active && !open
            ? 'bg-blue-600 text-white'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        )}
      >
        <Icon size={18} className="shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {open && (
        <div className="mt-1 ml-3 pl-3 border-l border-gray-700 space-y-1">
          {items.map(({ href, label, icon }) => (
            <NavLink
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={isActive(href)}
              onClick={onClose}
              sub
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  const isBusinessActive = businessItems.some(({ href }) => isActive(href))
  const isCompanyActive  = companyItems.some(({ href }) => isActive(href))
  const isPsiActive      = psiItems.some(({ href }) => isActive(href))
  const isAcctActive     = pathname.startsWith('/accounting')

  const [businessOpen, setBusinessOpen] = useState(isBusinessActive)
  const [companyOpen,  setCompanyOpen]  = useState(isCompanyActive)
  const [psiOpen,      setPsiOpen]      = useState(isPsiActive)
  const [acctOpen,     setAcctOpen]     = useState(isAcctActive)

  useEffect(() => { if (isBusinessActive) setBusinessOpen(true) }, [isBusinessActive])
  useEffect(() => { if (isCompanyActive)  setCompanyOpen(true) },  [isCompanyActive])
  useEffect(() => { if (isPsiActive)      setPsiOpen(true) },      [isPsiActive])
  useEffect(() => { if (isAcctActive)     setAcctOpen(true) },     [isAcctActive])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

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
          {navItemsTop.map(({ href, label, icon }) => (
            <NavLink key={href} href={href} label={label} icon={icon} active={isActive(href)} onClick={onClose} />
          ))}

          {/* 業務 分類（可收合） */}
          <NavGroup
            label="業務"
            icon={Briefcase}
            items={businessItems}
            active={isBusinessActive}
            open={businessOpen}
            onToggle={() => setBusinessOpen(o => !o)}
            isActive={isActive}
            onClose={onClose}
          />

          {/* 公司資料 分類（可收合） */}
          <NavGroup
            label="公司資料"
            icon={Building2}
            items={companyItems}
            active={isCompanyActive}
            open={companyOpen}
            onToggle={() => setCompanyOpen(o => !o)}
            isActive={isActive}
            onClose={onClose}
          />

          {/* 進銷存 分類（可收合） */}
          <NavGroup
            label="進銷存"
            icon={Warehouse}
            items={psiItems}
            active={isPsiActive}
            open={psiOpen}
            onToggle={() => setPsiOpen(o => !o)}
            isActive={isActive}
            onClose={onClose}
          />

          {navItemsMid.map(({ href, label, icon }) => (
            <NavLink key={href} href={href} label={label} icon={icon} active={isActive(href)} onClick={onClose} />
          ))}

          {/* 會計 分類（可收合） */}
          <NavGroup
            label="會計"
            icon={Calculator}
            items={accountingItems}
            active={isAcctActive}
            open={acctOpen}
            onToggle={() => setAcctOpen(o => !o)}
            isActive={isActive}
            onClose={onClose}
          />

          {navItemsAfter.map(({ href, label, icon }) => (
            <NavLink key={href} href={href} label={label} icon={icon} active={isActive(href)} onClick={onClose} />
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 pb-4 border-t border-gray-700 pt-3 shrink-0">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <LogOut size={18} />
            登出
          </button>
        </div>
      </aside>
    </>
  )
}
