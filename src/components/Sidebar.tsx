'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  LayoutDashboard, Users, FileText, ShoppingCart, Package,
  Settings, LogOut, ChevronRight, ChevronDown, Truck, X, Building2, Warehouse, CalendarDays,
  CreditCard, Receipt, Wrench, BookOpen, Library, Calculator, Briefcase, Scale, Wallet, PiggyBank, RotateCcw,
  MessageSquareQuote, StickyNote, FolderKanban, UserCog, HardHat, Contact, CalendarCheck, CalendarOff, Award, GraduationCap, PackageCheck, Crown, ShieldCheck, ListTodo, MessageSquare, ClipboardList, Columns2, ShoppingBag, Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissions, FEATURES } from '@/lib/permissions'
import ViewModeSwitch from '@/components/ViewModeSwitch'
import PunchClock from '@/components/PunchClock'

// ============================================================
// 側邊欄結構
//   1. 戰情室（維持原樣，置頂）
//   2. 業務日常（維持原樣）
//   3~9. 七大分類：專案/施工 → 銷售 → 進貨與採購 → 庫存 → 財務與會計
//                 → 人資管理 → 報表與決策分析 → 設置與系統管理
//   ※ 只改選單分組，所有頁面路由與資料完全不動
// ============================================================

const navItemsTop = [
  { href: '/chairman', label: '董事長戰情室', icon: Award },
  { href: '/ceo', label: 'CEO 戰情室', icon: Crown },
  { href: '/manager', label: '總經理戰情室', icon: ShieldCheck },
  { href: '/dept', label: '經理戰情室', icon: Briefcase },
  { href: '/team', label: '業務主任戰情室', icon: Users },
  { href: '/finance-team', label: '會計主管戰情室', icon: Calculator },
  { href: '/acct-staff', label: '會計人員戰情室', icon: Calculator },
  { href: '/tech-team', label: '工程師戰情室', icon: Wrench },
  { href: '/chief-engineer', label: '總工程師戰情室', icon: HardHat },
  { href: '/senior-engineer', label: '資深工程師戰情室', icon: HardHat },
  { href: '/approvals', label: '簽呈中心', icon: ClipboardList },
  { href: '/finance', label: '會計戰情室', icon: Calculator },
  { href: '/hr', label: '人資戰情室', icon: UserCog },
  { href: '/', label: '業務戰情室', icon: LayoutDashboard },
  { href: '/workspace', label: '多工工作區', icon: Columns2 },
] // top nav

// 業務日常（訊息／任務／行程／筆記）
const businessItems = [
  { href: '/messages', label: '訊息',     icon: MessageSquare },
  { href: '/todos',    label: '任務清單', icon: ListTodo },
  { href: '/tasks',    label: '交辦任務', icon: ClipboardList },
  { href: '/schedule', label: '每日行程', icon: CalendarDays },
  { href: '/notes',    label: '業務筆記', icon: StickyNote },
]

// ── 七大分類 ──────────────────────────────────────────────

/** 1. 專案／施工項目（工程專案） */
const projectItems = [
  { href: '/projects',         label: '專案資料夾', icon: FolderKanban },
  { href: '/construction',     label: '施工追蹤',   icon: HardHat },
  { href: '/work-hours',       label: '工時統計',   icon: Clock },
  { href: '/service-requests', label: '叫修管理',   icon: Wrench },
]

/** 2. 銷售項目（業務接單） */
const salesItems = [
  { href: '/clients',      label: '客戶資料', icon: Building2 },
  { href: '/quotes',       label: '報價單',   icon: FileText },
  { href: '/sales-orders', label: '銷貨單',   icon: ShoppingCart },
  { href: '/web-orders',   label: '網路訂單', icon: ShoppingBag },
  { href: '/shipments',    label: '出貨管理', icon: PackageCheck },
]

/** 3. 進貨與採購（依需求採購進貨） */
const purchasingItems = [
  { href: '/vendors',         label: '廠商建檔',   icon: Building2 },
  { href: '/inquiries',       label: '廠商詢價單', icon: MessageSquareQuote },
  { href: '/purchase-orders', label: '訂購單',     icon: Truck },
  { href: '/purchases',       label: '進貨單',     icon: PackageCheck },
]

/** 4. 庫存（物料管理／領料） */
const inventoryItems = [
  { href: '/products',  label: '產品管理', icon: Package },
  { href: '/inventory', label: '庫存管理', icon: Warehouse },
  { href: '/returns',   label: '退貨管理', icon: RotateCcw },
]

/** 5. 財務與會計（結帳開票／應收應付） */
const accountingItems = [
  { href: '/receivables',               label: '應收帳款',   icon: CreditCard },
  { href: '/payables',                  label: '應付帳款',   icon: Receipt },
  { href: '/accounting/income',         label: '收入記錄',   icon: BookOpen },
  { href: '/accounting/expenses',       label: '支出記錄',   icon: BookOpen },
  { href: '/accounting/pnl',            label: '損益表',     icon: BookOpen },
  { href: '/accounting/balance-sheet',  label: '資產負債表', icon: Scale },
  { href: '/accounting/cash-flow',      label: '現金流量表', icon: Wallet },
  { href: '/accounting/equity-changes', label: '權益變動表', icon: PiggyBank },
]

/** 人資管理（維持原樣） */
const hrItems = [
  { href: '/hr/employees',   label: '員工資料',        icon: Contact },
  { href: '/hr/attendance',  label: '出勤紀錄',        icon: CalendarCheck },
  { href: '/hr/leaves',      label: '請假管理',        icon: CalendarOff },
  { href: '/hr/payroll',     label: '薪資管理',        icon: Wallet },
  { href: '/hr/reviews',     label: '績效考評',        icon: Award },
  { href: '/hr/trainings',   label: '教育訓練',        icon: GraduationCap },
  { href: '/hr/contractors', label: '協力廠商／臨時工', icon: HardHat },
]

/** 6. 報表與決策分析 */
const reportItems = [
  { href: '/reports', label: '各式報表', icon: ClipboardList },
]

/** 7. 設置與系統管理 */
const systemItems = [
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
  const flt = (items: any[]) => isAdmin ? items : items.filter(i => {
    const f = featureOf(i.href)
    return f ? can(f, 'can_view') : true
  })

  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  // 選單分組定義（順序即畫面順序）
  const groups = [
    { key: 'business',    label: '業務日常',       icon: Briefcase,   items: businessItems },
    { key: 'projects',    label: '專案／施工',     icon: HardHat,     items: projectItems },
    { key: 'sales',       label: '銷售',           icon: ShoppingCart, items: salesItems },
    { key: 'purchasing',  label: '進貨與採購',     icon: Truck,       items: purchasingItems },
    { key: 'inventory',   label: '庫存',           icon: Warehouse,   items: inventoryItems },
    { key: 'accounting',  label: '財務與會計',     icon: Calculator,  items: accountingItems },
    { key: 'hr',          label: '人資管理',       icon: UserCog,     items: hrItems },
    { key: 'reports',     label: '報表與決策分析', icon: ClipboardList, items: reportItems },
    { key: 'system',      label: '設置與系統管理', icon: Settings,    items: systemItems },
  ]

  const activeKeys = groups.filter(g => g.items.some(({ href }) => isActive(href))).map(g => g.key)
  const activeKey = activeKeys[0]

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(activeKeys.map(k => [k, true]))
  )
  // 進到某頁時自動展開所屬分類
  useEffect(() => {
    if (activeKey) setOpenGroups(prev => (prev[activeKey] ? prev : { ...prev, [activeKey]: true }))
  }, [activeKey])

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
            <span className="font-semibold text-sm leading-tight">光輝影音科技<br/>行政系統</span>
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

          {/* 七大分類（可收合）：專案/施工 → 銷售 → 進貨採購 → 庫存 → 財務會計 → 人資 → 報表 → 設置 */}
          {groups.map(g => (
            <NavGroup
              key={g.key}
              label={g.label}
              icon={g.icon}
              items={flt(g.items)}
              active={g.items.some(({ href }) => isActive(href))}
              open={!!openGroups[g.key]}
              onToggle={() => setOpenGroups(prev => ({ ...prev, [g.key]: !prev[g.key] }))}
              isActive={isActive}
              onClose={onClose}
            />
          ))}
        </nav>

        {/* Logout */}
        <div className="pb-4 border-t border-gray-700 pt-1 shrink-0">
          <PunchClock />
          <ViewModeSwitch />
          <div className="px-3">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <LogOut size={18} />
              登出
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
