'use client'

/**
 * 多工工作區（/workspace）
 *
 * 已確認設計（2026-07）：
 *  A. 工作分頁列：像瀏覽器分頁，開幾個作業就有幾個分頁，
 *     切換時元件保持掛載（display:none keep-alive），打到一半的內容不會消失。
 *  B. 分割畫面：任一分頁可釘選到右半邊，左邊繼續操作目前分頁，
 *     例如左打估價單、右看庫存或銷貨單。手機(<1024px)自動改為上下堆疊。
 *
 * 實作策略：完全不動既有路由頁面，直接動態載入既有 page 元件嵌入，
 * 零回歸風險；既有頁面照常單獨使用。
 */

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import {
  FileText, ShoppingCart, Warehouse, Package, Users, Truck,
  CreditCard, Receipt, Wrench, Building2, PackageCheck,
  Plus, X, PanelRight, LayoutGrid,
} from 'lucide-react'

const spinner = () => (
  <div className="flex items-center justify-center h-40 text-gray-400 text-sm">載入中…</div>
)

const MODULES: Record<string, { label: string; icon: any; Comp: any }> = {
  quotes:            { label: '報價單',   icon: FileText,      Comp: dynamic(() => import('../quotes/page'),            { ssr: false, loading: spinner }) },
  'sales-orders':    { label: '銷貨單',   icon: ShoppingCart,  Comp: dynamic(() => import('../sales-orders/page'),      { ssr: false, loading: spinner }) },
  inventory:         { label: '庫存管理', icon: Warehouse,     Comp: dynamic(() => import('../inventory/page'),         { ssr: false, loading: spinner }) },
  products:          { label: '產品資料', icon: Package,       Comp: dynamic(() => import('../products/page'),          { ssr: false, loading: spinner }) },
  clients:           { label: '客戶資料', icon: Users,         Comp: dynamic(() => import('../clients/page'),           { ssr: false, loading: spinner }) },
  'purchase-orders': { label: '訂購單',   icon: Truck,         Comp: dynamic(() => import('../purchase-orders/page'),   { ssr: false, loading: spinner }) },
  purchases:         { label: '進貨單',   icon: PackageCheck,  Comp: dynamic(() => import('../purchases/page'),         { ssr: false, loading: spinner }) },
  receivables:       { label: '應收帳款', icon: Receipt,       Comp: dynamic(() => import('../receivables/page'),       { ssr: false, loading: spinner }) },
  payables:          { label: '應付帳款', icon: CreditCard,    Comp: dynamic(() => import('../payables/page'),          { ssr: false, loading: spinner }) },
  'service-requests':{ label: '叫修管理', icon: Wrench,        Comp: dynamic(() => import('../service-requests/page'),  { ssr: false, loading: spinner }) },
  vendors:           { label: '廠商資料', icon: Building2,     Comp: dynamic(() => import('../vendors/page'),           { ssr: false, loading: spinner }) },
}

const LS_KEY = 'gh-workspace-tabs-v1'

export default function WorkspacePage() {
  const [open, setOpen] = useState<string[]>([])          // 已開啟的模組 key（依開啟順序）
  const [active, setActive] = useState<string | null>(null) // 左側（主要）作業
  const [split, setSplit] = useState<string | null>(null)   // 右側（分割）作業
  const [picker, setPicker] = useState(false)

  // 還原上次的工作狀態
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null')
      if (s?.open?.length) {
        const valid = s.open.filter((k: string) => MODULES[k])
        setOpen(valid)
        setActive(valid.includes(s.active) ? s.active : valid[0] ?? null)
        setSplit(valid.includes(s.split) && s.split !== s.active ? s.split : null)
      }
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ open, active, split }))
  }, [open, active, split])

  function openModule(key: string) {
    setOpen(o => o.includes(key) ? o : [...o, key])
    setActive(key)
    if (split === key) setSplit(null)
    setPicker(false)
  }
  function closeModule(key: string) {
    setOpen(o => o.filter(k => k !== key))
    if (split === key) setSplit(null)
    if (active === key) {
      const rest = open.filter(k => k !== key)
      setActive(rest[rest.length - 1] ?? null)
    }
  }
  function toggleSplit(key: string) {
    if (split === key) { setSplit(null); return }
    if (active === key) {
      // 把目前主作業釘到右邊，左邊換成另一個已開啟的作業
      const other = open.find(k => k !== key)
      if (!other) return
      setActive(other)
    }
    setSplit(key)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-0px)]">
      {/* 工作分頁列 */}
      <div className="flex items-end gap-1 px-3 pt-2 border-b border-gray-200 bg-white sticky top-0 z-20">
        <div className="flex items-center gap-1.5 px-2 pb-2 text-gray-400 text-xs shrink-0">
          <LayoutGrid size={14} /> 多工工作區
        </div>
        <div className="flex items-end gap-1 overflow-x-auto flex-1 min-w-0">
        {open.map(key => {
          const m = MODULES[key]
          const Icon = m.icon
          const isActive = key === active
          const isSplit = key === split
          return (
            <div key={key}
                 className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs cursor-pointer select-none shrink-0 border border-b-0 ${
                   isActive ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium'
                   : isSplit ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                   : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                 onClick={() => setActive(key)}>
              <Icon size={13} /> {m.label}
              {isSplit && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded">右</span>}
              <button type="button" title={isSplit ? '取消分割' : '釘到右半邊（分割畫面）'}
                      onClick={e => { e.stopPropagation(); toggleSplit(key) }}
                      className={`p-0.5 rounded hover:bg-white ${isSplit ? 'text-emerald-600' : 'text-gray-300 hover:text-emerald-600'}`}>
                <PanelRight size={12} />
              </button>
              <button type="button" title="關閉"
                      onClick={e => { e.stopPropagation(); closeModule(key) }}
                      className="p-0.5 rounded text-gray-300 hover:text-red-500 hover:bg-white">
                <X size={12} />
              </button>
            </div>
          )
        })}
        </div>
        <div className="relative shrink-0 pb-1">
          <button type="button" onClick={() => setPicker(p => !p)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg">
            <Plus size={13} /> 新增作業
          </button>
          {picker && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-2 grid grid-cols-2 gap-1 w-64 z-30">
              {Object.entries(MODULES).map(([key, m]) => {
                const Icon = m.icon
                return (
                  <button key={key} type="button" onClick={() => openModule(key)}
                          disabled={open.includes(key)}
                          className="flex items-center gap-2 px-2.5 py-2 text-xs rounded-lg text-left hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed">
                    <Icon size={14} className="text-gray-400" /> {m.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 工作面板：keep-alive，切換分頁內容不消失 */}
      {open.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-gray-400 gap-3 py-24">
          <LayoutGrid size={40} className="text-gray-200" />
          <div className="text-sm">點「+ 新增作業」開啟第一個作業</div>
          <div className="text-xs text-gray-300">可同時開多個作業並排工作，例如左打估價單、右看庫存</div>
        </div>
      ) : (
        <div className={`grid flex-1 min-h-0 ${split ? 'grid-cols-1 lg:grid-cols-2 gap-0' : 'grid-cols-1'}`}>
          {open.map(key => {
            const m = MODULES[key]
            const Comp = m.Comp
            const isActive = key === active
            const isSplit = key === split
            const visible = isActive || isSplit
            return (
              <div key={key}
                   className={`${visible ? 'block' : 'hidden'} overflow-y-auto min-h-0 ${
                     isSplit ? 'lg:border-l lg:border-gray-200 lg:col-start-2' : ''} ${
                     isActive && split ? 'lg:col-start-1 lg:row-start-1' : ''} ${
                     isSplit ? 'lg:row-start-1' : ''}`}>
                {isSplit && (
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-50 text-emerald-700 text-xs border-b border-emerald-100 sticky top-0 z-10">
                    <PanelRight size={12} /> 分割檢視：{m.label}
                    <button type="button" onClick={() => setSplit(null)} className="ml-auto hover:text-red-500"><X size={12} /></button>
                  </div>
                )}
                <Comp />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
