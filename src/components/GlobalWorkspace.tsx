'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import dynamic from 'next/dynamic'
import {
  Building2,
  Columns2,
  CreditCard,
  FileText,
  LayoutGrid,
  Package,
  PackageCheck,
  PanelRight,
  Plus,
  Receipt,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'

const spinner = () => (
  <div className="flex h-40 items-center justify-center text-sm text-gray-400">載入中…</div>
)

type WorkspaceModule = {
  label: string
  href: string
  icon: LucideIcon
  Comp: ComponentType
}

const MODULES = {
  quotes: {
    label: '報價單', href: '/quotes', icon: FileText,
    Comp: dynamic(() => import('@/app/(dashboard)/quotes/page'), { ssr: false, loading: spinner }),
  },
  'sales-orders': {
    label: '銷貨單', href: '/sales-orders', icon: ShoppingCart,
    Comp: dynamic(() => import('@/app/(dashboard)/sales-orders/page'), { ssr: false, loading: spinner }),
  },
  inventory: {
    label: '庫存管理', href: '/inventory', icon: Warehouse,
    Comp: dynamic(() => import('@/app/(dashboard)/inventory/page'), { ssr: false, loading: spinner }),
  },
  products: {
    label: '產品管理', href: '/products', icon: Package,
    Comp: dynamic(() => import('@/app/(dashboard)/products/page'), { ssr: false, loading: spinner }),
  },
  clients: {
    label: '客戶資料', href: '/clients', icon: Users,
    Comp: dynamic(() => import('@/app/(dashboard)/clients/page'), { ssr: false, loading: spinner }),
  },
  'purchase-orders': {
    label: '訂購單', href: '/purchase-orders', icon: Truck,
    Comp: dynamic(() => import('@/app/(dashboard)/purchase-orders/page'), { ssr: false, loading: spinner }),
  },
  purchases: {
    label: '進貨單', href: '/purchases', icon: PackageCheck,
    Comp: dynamic(() => import('@/app/(dashboard)/purchases/page'), { ssr: false, loading: spinner }),
  },
  receivables: {
    label: '應收帳款', href: '/receivables', icon: Receipt,
    Comp: dynamic(() => import('@/app/(dashboard)/receivables/page'), { ssr: false, loading: spinner }),
  },
  payables: {
    label: '應付帳款', href: '/payables', icon: CreditCard,
    Comp: dynamic(() => import('@/app/(dashboard)/payables/page'), { ssr: false, loading: spinner }),
  },
  'service-requests': {
    label: '叫修管理', href: '/service-requests', icon: Wrench,
    Comp: dynamic(() => import('@/app/(dashboard)/service-requests/page'), { ssr: false, loading: spinner }),
  },
  vendors: {
    label: '廠商資料', href: '/vendors', icon: Building2,
    Comp: dynamic(() => import('@/app/(dashboard)/vendors/page'), { ssr: false, loading: spinner }),
  },
} satisfies Record<string, WorkspaceModule>

export type WorkspaceModuleKey = keyof typeof MODULES
export const WORKSPACE_MODULE_KEYS = Object.keys(MODULES) as WorkspaceModuleKey[]

export function workspaceKeyFromHref(href: string): WorkspaceModuleKey | null {
  const match = WORKSPACE_MODULE_KEYS.find(key => MODULES[key].href === href)
  return match ?? null
}

export function workspaceHrefFromKey(key: WorkspaceModuleKey): string {
  return MODULES[key].href
}

const LS_KEY = 'gh-workspace-tabs-v2'

type WorkspaceContextValue = {
  open: WorkspaceModuleKey[]
  active: WorkspaceModuleKey | null
  split: WorkspaceModuleKey | null
  openModule: (key: WorkspaceModuleKey) => void
  closeModule: (key: WorkspaceModuleKey) => void
  toggleSplit: (key: WorkspaceModuleKey) => void
  setOpen: Dispatch<SetStateAction<WorkspaceModuleKey[]>>
  setActive: Dispatch<SetStateAction<WorkspaceModuleKey | null>>
  setSplit: Dispatch<SetStateAction<WorkspaceModuleKey | null>>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function useGlobalWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useGlobalWorkspace must be used inside GlobalWorkspaceProvider')
  return value
}

export function GlobalWorkspaceProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<WorkspaceModuleKey[]>([])
  const [active, setActive] = useState<WorkspaceModuleKey | null>(null)
  const [split, setSplit] = useState<WorkspaceModuleKey | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY) ?? localStorage.getItem('gh-workspace-tabs-v1')
      const saved = JSON.parse(raw ?? 'null')
      const valid = Array.isArray(saved?.open)
        ? saved.open.filter((key: string): key is WorkspaceModuleKey => key in MODULES)
        : []
      setOpen(valid)
      setActive(valid.includes(saved?.active) ? saved.active : null)
      setSplit(valid.includes(saved?.split) && saved.split !== saved.active ? saved.split : null)
    } catch {
      // Ignore invalid or unavailable local storage.
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(LS_KEY, JSON.stringify({ open, active, split }))
  }, [active, hydrated, open, split])

  const openModule = useCallback((key: WorkspaceModuleKey) => {
    setOpen(current => current.includes(key) ? current : [...current, key])
    setActive(key)
    setSplit(current => current === key ? null : current)
  }, [])

  const closeModule = useCallback((key: WorkspaceModuleKey) => {
    setOpen(current => {
      const remaining = current.filter(item => item !== key)
      setActive(currentActive => currentActive === key ? remaining[remaining.length - 1] ?? null : currentActive)
      setSplit(currentSplit => currentSplit === key ? null : currentSplit)
      return remaining
    })
  }, [])

  const toggleSplit = useCallback((key: WorkspaceModuleKey) => {
    if (split === key) {
      setSplit(null)
      return
    }
    if (active === key) {
      const other = open.find(item => item !== key)
      if (!other) return
      setActive(other)
    }
    setSplit(key)
  }, [active, open, split])

  const value = useMemo(() => ({
    open, active, split, openModule, closeModule, toggleSplit, setOpen, setActive, setSplit,
  }), [active, closeModule, open, openModule, split, toggleSplit])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function GlobalWorkspaceSurface({
  children,
  pathname,
  allowedKeys,
  permissionsReady,
}: {
  children: ReactNode
  pathname: string
  allowedKeys: WorkspaceModuleKey[]
  permissionsReady: boolean
}) {
  const {
    open, active, split, openModule, closeModule, toggleSplit, setOpen, setActive, setSplit,
  } = useGlobalWorkspace()
  const [picker, setPicker] = useState(false)
  const allowedKeySignature = allowedKeys.join('|')
  const allowedSet = useMemo(
    () => new Set<WorkspaceModuleKey>(
      allowedKeySignature ? allowedKeySignature.split('|') as WorkspaceModuleKey[] : []
    ),
    [allowedKeySignature]
  )
  const safeOpen = permissionsReady ? open.filter(key => allowedSet.has(key)) : []

  // Navigating to an ordinary route shows that page while preserving all open work tabs.
  useEffect(() => {
    if (pathname !== '/workspace') {
      setActive(null)
      setSplit(null)
    }
  }, [pathname, setActive, setSplit])

  // Tabs restored from local storage must still obey the current user's permissions.
  useEffect(() => {
    if (!permissionsReady) return
    setOpen(current => {
      const permitted = current.filter(key => allowedSet.has(key))
      return permitted.length === current.length ? current : permitted
    })
    setActive(current => current && allowedSet.has(current) ? current : null)
    setSplit(current => current && allowedSet.has(current) ? current : null)
  }, [allowedSet, permissionsReady, setActive, setOpen, setSplit])

  const workspaceVisible = pathname === '/workspace' || (permissionsReady && (active !== null || split !== null))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="no-print flex shrink-0 items-end gap-1 border-b border-gray-200 bg-white px-3 pt-2">
        <div className="flex shrink-0 items-center gap-1.5 px-2 pb-2 text-xs text-gray-500">
          <Columns2 size={14} /> 多工作業
        </div>

        <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
          {safeOpen.map(key => {
            const module = MODULES[key]
            const Icon = module.icon
            const isActive = key === active
            const isSplit = key === split
            return (
              <div
                key={key}
                className={`flex shrink-0 select-none items-center gap-1.5 rounded-t-lg border border-b-0 px-2 py-1.5 text-xs ${
                  isActive
                    ? 'border-blue-200 bg-blue-50 font-medium text-blue-700'
                    : isSplit
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                <button
                  type="button"
                  onClick={() => openModule(key)}
                  className="flex items-center gap-1.5 px-1 py-0.5"
                >
                  <Icon size={13} /> {module.label}
                </button>
                {isSplit && <span className="rounded bg-emerald-100 px-1 text-[10px] text-emerald-700">右</span>}
                <button
                  type="button"
                  title={isSplit ? '取消分割' : '釘到右半邊'}
                  onClick={event => { event.stopPropagation(); toggleSplit(key) }}
                  className={`rounded p-0.5 hover:bg-white ${isSplit ? 'text-emerald-600' : 'text-gray-300 hover:text-emerald-600'}`}
                >
                  <PanelRight size={12} />
                </button>
                <button
                  type="button"
                  title="關閉"
                  onClick={event => { event.stopPropagation(); closeModule(key) }}
                  className="rounded p-0.5 text-gray-300 hover:bg-white hover:text-red-500"
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
        </div>

        <div className="relative shrink-0 pb-1">
          <button
            type="button"
            aria-expanded={picker}
            aria-haspopup="menu"
            onClick={() => setPicker(current => !current)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
          >
            <Plus size={13} /> 新增作業
          </button>
          {picker && (
            <div className="absolute right-0 top-full z-30 mt-1 grid w-64 grid-cols-2 gap-1 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
              {WORKSPACE_MODULE_KEYS.filter(key => allowedSet.has(key)).map(key => {
                const module = MODULES[key]
                const Icon = module.icon
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={safeOpen.includes(key)}
                    onClick={() => { openModule(key); setPicker(false) }}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Icon size={14} className="text-gray-400" /> {module.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {!workspaceVisible ? (
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      ) : safeOpen.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-gray-400">
          <LayoutGrid size={40} className="text-gray-200" />
          <div className="text-sm">從側邊選單點選功能，或按「新增作業」</div>
          <div className="text-xs text-gray-300">不必先開啟多工頁面，工作分頁會在所有頁面保留</div>
        </div>
      ) : (
        <div className={`grid min-h-0 flex-1 ${split ? 'grid-cols-1 gap-0 lg:grid-cols-2' : 'grid-cols-1'}`}>
          {safeOpen.map(key => {
            const module = MODULES[key]
            const Comp = module.Comp
            const isActive = key === active
            const isSplit = key === split
            const visible = isActive || isSplit
            return (
              <div
                key={key}
                className={`${visible ? 'block' : 'hidden'} min-h-0 overflow-y-auto ${
                  isSplit ? 'lg:col-start-2 lg:row-start-1 lg:border-l lg:border-gray-200' : ''
                } ${isActive && split ? 'lg:col-start-1 lg:row-start-1' : ''}`}
              >
                {isSplit && (
                  <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-1.5 text-xs text-emerald-700">
                    <PanelRight size={12} /> 分割檢視：{module.label}
                    <button type="button" onClick={() => setSplit(null)} className="ml-auto hover:text-red-500">
                      <X size={12} />
                    </button>
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

