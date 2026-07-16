'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

/** 系統所有可控功能（新增功能時在這裡加一列，權限頁會自動出現） */
export const FEATURES: { key: string; label: string; group: string; href?: string; costLabel?: string }[] = [
  { key: 'ceo',              label: 'CEO 戰情室',      group: '決策',   href: '/ceo',            costLabel: '看毛利與現金' },
  { key: 'dashboard',        label: '戰情室',          group: '決策',   href: '/' },
  { key: 'projects',         label: '專案資料夾',      group: '業務',   href: '/projects',       costLabel: '看專案成本' },
  { key: 'clients',          label: '單位資料',        group: '業務',   href: '/clients' },
  { key: 'vendors',          label: '廠商建檔',        group: '業務',   href: '/vendors',        costLabel: '看銀行帳戶' },
  { key: 'quotes',           label: '報價單',          group: '業務',   href: '/quotes',         costLabel: '看進貨成本' },
  { key: 'notes',            label: '業務筆記',        group: '業務',   href: '/notes' },
  { key: 'todos',            label: '事情清單',        group: '業務',   href: '/todos' },
  { key: 'schedule',         label: '每日行程',        group: '業務',   href: '/schedule' },

  { key: 'sales-orders',     label: '銷貨單',          group: '進銷存', href: '/sales-orders',   costLabel: '看成本' },
  { key: 'inquiries',        label: '廠商詢價單',      group: '進銷存', href: '/inquiries' },
  { key: 'purchase-orders',  label: '訂購單',          group: '進銷存', href: '/purchase-orders' },
  { key: 'shipments',        label: '出貨管理',        group: '進銷存', href: '/shipments' },
  { key: 'inventory',        label: '庫存管理',        group: '進銷存', href: '/inventory',      costLabel: '看庫存價值' },
  { key: 'returns',          label: '退貨管理',        group: '進銷存', href: '/returns' },
  { key: 'products',         label: '產品管理',        group: '進銷存', href: '/products',       costLabel: '看成本價' },

  { key: 'receivables',      label: '應收帳款',        group: '財務',   href: '/receivables' },
  { key: 'payables',         label: '應付帳款',        group: '財務',   href: '/payables' },
  { key: 'accounting',       label: '會計（收支/報表）', group: '財務', href: '/accounting/pnl' },

  { key: 'service-requests', label: '叫修管理',        group: '服務',   href: '/service-requests', costLabel: '看維修成本' },
  { key: 'knowledge-base',   label: 'SOP／教材庫',     group: '服務',   href: '/knowledge-base' },

  { key: 'hr-employees',     label: '員工資料',        group: '人資',   href: '/hr/employees',    costLabel: '看薪資與身分證' },
  { key: 'hr-attendance',    label: '出勤紀錄',        group: '人資',   href: '/hr/attendance' },
  { key: 'hr-leaves',        label: '請假管理',        group: '人資',   href: '/hr/leaves' },
  { key: 'hr-payroll',       label: '薪資管理',        group: '人資',   href: '/hr/payroll',      costLabel: '看薪資金額' },
  { key: 'hr-reviews',       label: '績效考評',        group: '人資',   href: '/hr/reviews' },
  { key: 'hr-trainings',     label: '教育訓練',        group: '人資',   href: '/hr/trainings' },
  { key: 'hr-contractors',   label: '協力廠商／臨時工', group: '人資',  href: '/hr/contractors',  costLabel: '看日薪與帳戶' },

  { key: 'settings',         label: '系統設定',        group: '系統',   href: '/settings' },
  { key: 'permissions',      label: '權限管理',        group: '系統' },
]

export const FEATURE_GROUPS = ['決策', '業務', '進銷存', '財務', '服務', '人資', '系統']

export type Perm = {
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  can_cost: boolean
}
export type PermMap = Record<string, Perm>

const NONE: Perm = { can_view: false, can_create: false, can_edit: false, can_delete: false, can_cost: false }
const ALL: Perm = { can_view: true, can_create: true, can_edit: true, can_delete: true, can_cost: true }

/**
 * 取得目前使用者的有效權限。
 * 若權限資料表尚未建立（還沒跑 schema_permissions.sql），一律放行 —— 避免整套系統鎖死。
 */
export function usePermissions() {
  const [perms, setPerms] = useState<PermMap>({})
  const [ready, setReady] = useState(false)
  const [bypass, setBypass] = useState(false)   // 資料表不存在 → 全開
  const [role, setRole] = useState<string>('')

  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setReady(true); return }

      const { data: prof } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
      setRole(prof?.role ?? '')

      const { data, error } = await supabase.rpc('my_permissions')
      if (error) {
        // 權限系統尚未安裝 → 不擋任何人
        console.warn('權限系統未啟用：', error.message)
        setBypass(true); setReady(true); return
      }
      const m: PermMap = {}
      ;(data ?? []).forEach((r: any) => {
        m[r.feature_key] = {
          can_view: !!r.can_view, can_create: !!r.can_create,
          can_edit: !!r.can_edit, can_delete: !!r.can_delete, can_cost: !!r.can_cost,
        }
      })
      setPerms(m); setReady(true)
    })()
  }, [])

  const isAdmin = role === 'admin' || role === '管理員'

  function can(feature: string, action: keyof Perm = 'can_view'): boolean {
    if (bypass || isAdmin) return true
    return !!perms[feature]?.[action]
  }

  function permOf(feature: string): Perm {
    if (bypass || isAdmin) return ALL
    return perms[feature] ?? NONE
  }

  return { perms, can, permOf, ready, bypass, isAdmin, role }
}
