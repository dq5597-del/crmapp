'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  LayoutDashboard, Users, FileText, ShoppingCart, Package,
  Settings, LogOut, ChevronRight, ChevronDown, Truck, X, Building2, Warehouse, CalendarDays,
  CreditCard, Receipt, Wrench, BookOpen, Library, Calculator, Briefcase, Scale, Wallet, PiggyBank, RotateCcw,
  MessageSquareQuote, StickyNote, FolderKanban, UserCog, HardHat, Contact, CalendarCheck, CalendarOff, Award, GraduationCap, PackageCheck, Crown, ShieldCheck, ListTodo, MessageSquare, ClipboardList
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissions, FEATURES } from '@/lib/permissions'

const navItemsTop = [
  { href: '/ceo', label: 'CEO 戰情室', icon: Crown },
  { href: '/', label: '戰情室', icon: LayoutDashboard },
  { href: '/projects', label: '專案資料夾', icon: FolderKanban },
] // top nav

const businessItems = [
  { href: '/messages',         label: '訊息',     icon: MessageSquare },
  { href: '/todos',            label: '事情清單', icon: ListTodo },
  { href: '/schedule',         label: '每日行程', icon: CalendarDays },
  { href: '/service-requests', label: '叫修管理', icon: Wrench },
  { href: '/notes',            label: '業務筆記', icon: StickyNote },
]

const companyItems: { href: string; label: string; icon: any }[] = []

const psiItems = [
  { href: '/quotes',          label: '報價單',   icon: FileText },
  { href: '/sales-orders',    label: '銷貨單',   icon: ShoppingCart },
  { href: '/inquiries',       label: '廠商詢價單', icon: MessageSquareQuote },
  { href: '/purchases',       label: '進貨單',   icon: PackageCheck },
  { href: '/purchase-orders', label: '訂購單',   icon: Truck },
  { href: '/shipments',       label: '出貨管理', icon: PackageCheck },
  { href: '/inventory',       label: '庫存管理', icon: Warehouse },
  { href: '/returns',         label: '退貨管理', icon: RotateCcw },
]

const navItemsMid: { href: string; label: string; icon: any }[] = []

const accountingItems = [
  { href: '/receivables',               label: '應收帳款',     icon: CreditCard },
  { href: '/payables',                  label: '應付帳款',     icon: Receipt },
  { href: '/accounting/income',         label: '收入記錄',     icon: BookOpen },
  { href: '/accounting/expenses',       label: '支出記錄',     icon: BookOpen },
  { href: '/accounting/pnl',            label: '損益表',       icon: BookOpen },
  { href: '/accounting/balance-sheet',  label: '資產負債表',   icon: Scale },
  { href: '/accounting/cash-flow',      label: '現金流量表',   icon: Wallet },
  { href: '/accounting/equity-changes', label: '權益變動表',   icon: PiggyBank },
]

const hrItems = [
  { href: '/hr/employees',   label: '員工資料',        icon: Contact },
  { href: '/hr/attendance',  label: '出勤紀錄',        icon: CalendarCheck },
  { href: '/hr/leaves',      label: '請假管理',        icon: CalendarOff },
  { href: '/hr/payroll',     label: '薪資管理',        icon: Wallet },
  { href: '/hr/reviews',     label: '績效考評',        icon: Award },
  { href: '/hr/trainings',   label: '教育訓練',        icon: GraduationCap },
  { href: '/hr/contractors', label: '協力廠商／臨時工', icon: HardHat },
]

const navItemsAfter = [
  { href: '/reports',        label: '各式報表',   icon: ClipboardList },
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
  if (!items || items.length === 0) return null

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
  const { can, isAdmin } = usePermissions()
  const featureOf = (href: string) =>
    FEATURES.filter(f => f.href && f.href !== '/' && href.startsWith(f.href))
      .sort((a, b) => b.href!.length - a.href!.length)[0]?.key ?? (href === '/' ? 'dashboard' : undefined)
  const flt = (items: any[]) => items.filter(i => {
    const f = featureOf(i.href)
    return f ? can(f, 'can_view') : true
  })

  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  const isBusinessActive = businessItems.some(({ href }) => isActive(href))
  const isCompanyActive  = companyItems.some(({ href }) => isActive(href))
  const isPsiActive      = psiItems.some(({ href }) => isActive(href))
  const isAcctActive     = pathname.startsWith('/accounting') || pathname.startsWith('/receivables') || pathname.startsWith('/payables')
  const isHrActive       = pathname.startsWith('/hr')

  const [businessOpen, setBusinessOpen] = useState(isBusinessActive)
  const [companyOpen,  setCompanyOpen]  = useState(isCompanyActive)
  const [psiOpen,      setPsiOpen]      = useState(isPsiActive)
  const [acctOpen,     setAcctOpen]     = useState(isAcctActive)
  const [hrOpen,       setHrOpen]       = useState(isHrActive)

  useEffect(() => { if (isBusinessActive) setBusinessOpen(true) }, [isBusinessActive])
  useEffect(() => { if (isCompanyActive)  setCompanyOpen(true) },  [isCompanyActive])
  useEffect(() => { if (isPsiActive)      setPsiOpen(true) },      [isPsiActive])
  useEffect(() => { if (isAcctActive)     setAcctOpen(true) },     [isAcctActive])
  useEffect(() => { if (isHrActive)       setHrOpen(true) },       [isHrActive])

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
            <img src="/icons/icon-192.png" alt="GH" className="w-8 h-8 rounded-lg shrink-0 object-cover" />
            <span className="font-semibold text-sm leading-tight">光輝影音科技<br/>CRM系統</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto scrollbar-thin">
          {flt(navItemsTop).map(({ href, label, icon }) => (
            <NavLink key={href} href={href} label={label} icon={icon} active={isActive(href)} onClick={onClose} />
          ))}

          {/* 業務 分類（可收合） */}
          <NavGroup
            label="業務"
            icon={Briefcase}
            items={flt(businessItems)}
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
            items={flt(companyItems)}
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
            items={flt(psiItems)}
            active={isPsiActive}
            open={psiOpen}
            onToggle={() => setPsiOpen(o => !o)}
            isActive={isActive}
            onClose={onClose}
          />

          {flt(navItemsMid).map(({ href, label, icon }) => (
            <NavLink key={href} href={href} label={label} icon={icon} active={isActive(href)} onClick={onClose} />
          ))}

          {/* 會計 分類（可收合） */}
          <NavGroup
            label="會計"
            icon={Calculator}
            items={flt(accountingItems)}
            active={isAcctActive}
            open={acctOpen}
            onToggle={() => setAcctOpen(o => !o)}
            isActive={isActive}
            onClose={onClose}
          />

          {/* 人資管理 分類（可收合） */}
          <NavGroup
            label="人資管理"
            icon={UserCog}
            items={flt(hrItems)}
            active={isHrActive}
            open={hrOpen}
            onToggle={() => setHrOpen(o => !o)}
            isActive={isActive}
            onClose={onClose}
          />

          {flt(navItemsAfter).map(({ href, label, icon }) => (
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
