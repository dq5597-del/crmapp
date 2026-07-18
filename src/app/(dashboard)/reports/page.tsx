'use client'

import Link from 'next/link'
import {
  ClipboardList, BookOpen, Scale, Wallet, PiggyBank, TrendingUp, Crown,
  LayoutDashboard, Wrench, ShoppingCart, Truck, Warehouse, RotateCcw,
  CreditCard, Receipt, Users, ChevronRight,
} from 'lucide-react'

type Report = { href: string; label: string; desc: string; icon: any }
type Group = { title: string; color: string; items: Report[] }

const GROUPS: Group[] = [
  {
    title: '財務會計報表',
    color: 'text-emerald-600',
    items: [
      { href: '/accounting/pnl', label: '損益表', desc: '營收、成本、費用與淨利', icon: BookOpen },
      { href: '/accounting/balance-sheet', label: '資產負債表', desc: '資產、負債與權益結構', icon: Scale },
      { href: '/accounting/cash-flow', label: '現金流量表', desc: '營運、投資、籌資現金流', icon: Wallet },
      { href: '/accounting/equity-changes', label: '權益變動表', desc: '股東權益增減變化', icon: PiggyBank },
      { href: '/accounting/income', label: '收入記錄', desc: '各期開票與收入明細', icon: BookOpen },
      { href: '/accounting/expenses', label: '支出記錄', desc: '各項費用支出明細', icon: BookOpen },
    ],
  },
  {
    title: '營運管理報表',
    color: 'text-blue-600',
    items: [
      { href: '/ceo', label: 'CEO 戰情室', desc: '經營總覽與關鍵指標', icon: Crown },
      { href: '/', label: '業務戰情總覽', desc: 'KPI、單位狀態、回訪提醒', icon: LayoutDashboard },
    ],
  },
  {
    title: '帳款報表',
    color: 'text-orange-600',
    items: [
      { href: '/receivables', label: '應收帳款', desc: '未收款項與逾期明細', icon: CreditCard },
      { href: '/payables', label: '應付帳款', desc: '待付廠商款項與到期日', icon: Receipt },
    ],
  },
  {
    title: '進銷存報表',
    color: 'text-purple-600',
    items: [
      { href: '/sales-orders', label: '銷貨單', desc: '銷貨紀錄與狀態', icon: ShoppingCart },
      { href: '/purchase-orders', label: '訂購單', desc: '採購訂單與進度', icon: Truck },
      { href: '/inventory', label: '庫存管理', desc: '庫存數量與異動', icon: Warehouse },
      { href: '/returns', label: '退貨管理', desc: '退貨紀錄與處理', icon: RotateCcw },
      { href: '/service-requests', label: '叫修管理', desc: '設備維修追蹤', icon: Wrench },
      { href: '/clients', label: '單位資料', desc: '客戶清單與服務狀態', icon: Users },
    ],
  },
]

export default function ReportsPage() {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ClipboardList size={22} className="text-blue-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">各式報表</h1>
          <p className="text-sm text-gray-500 mt-0.5">點選下方報表即可查看</p>
        </div>
      </div>

      <div className="space-y-8">
        {GROUPS.map(group => (
          <div key={group.title}>
            <h2 className={`text-sm font-semibold mb-3 ${group.color}`}>{group.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.items.map(({ href, label, desc, icon: Icon }) => (
                <Link
                  key={href + label}
                  href={href}
                  className="group flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-blue-300 hover:shadow transition-all"
                >
                  <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100">
                    <Icon size={20} className="text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900">{label}</div>
                    <div className="text-xs text-gray-500 truncate">{desc}</div>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
