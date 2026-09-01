'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

/** 系統所有可控功能（新增功能時在這裡加一列，權限頁會自動出現） */
export const FEATURES: { key: string; label: string; group: string; href?: string; costLabel?: string }[] = [
  // 戰情室（各職位／部門專屬儀表板）— 依權限控管：每個帳號只看自己的，管理員看全部。
  // 逐一帳號指定用「權限管理 → 個人例外」；或在角色權限勾該角色共用的戰情室。
  { key: 'dashboard',        label: '業務戰情室',       group: '戰情室', href: '/' },
  { key: 'chairman',         label: '董事長戰情室',     group: '戰情室', href: '/chairman' },
  { key: 'ceo',              label: 'CEO 戰情室',       group: '戰情室', href: '/ceo',            costLabel: '看毛利與現金' },
  { key: 'manager',          label: '總經理戰情室',     group: '戰情室', href: '/manager' },
  { key: 'dept',             label: '經理戰情室',       group: '戰情室', href: '/dept' },
  { key: 'team',             label: '業務主任戰情室',       group: '戰情室', href: '/team' },
  { key: 'finance',          label: '會計戰情室',       group: '戰情室', href: '/finance' },
  { key: 'finance-team',     label: '會計主管戰情室',   group: '戰情室', href: '/finance-team' },
  { key: 'acct-staff',       label: '會計人員戰情室',   group: '戰情室', href: '/acct-staff' },
  { key: 'tech-team',        label: '工程師戰情室',     group: '戰情室', href: '/tech-team' },
  { key: 'chief-engineer',   label: '總工程師戰情室',   group: '戰情室', href: '/chief-engineer' },
  { key: 'senior-engineer',  label: '資深工程師戰情室', group: '戰情室', href: '/senior-engineer' },
  { key: 'hr-dashboard',     label: '人資戰情室',       group: '戰情室', href: '/hr' },
  { key: 'projects',         label: '專案資料夾',      group: '業務',   href: '/projects',       costLabel: '看專案成本' },
  { key: 'construction',     label: '施工追蹤',        group: '業務',   href: '/construction' },
  { key: 'work-hours',       label: '工時統計',        group: '業務',   href: '/work-hours',     costLabel: '看人工成本' },
  { key: 'equipment',        label: '設備清單',        group: '業務',   href: '/equipment' },
  { key: 'clients',          label: '客戶資料',        group: '業務',   href: '/clients' },
  { key: 'vendors',          label: '廠商資料',        group: '業務',   href: '/vendors',        costLabel: '看銀行帳戶' },
  { key: 'quotes',           label: '報價單',          group: '業務',   href: '/quotes',         costLabel: '看進貨成本' },
  { key: 'notes',            label: '業務筆記',        group: '業務',   href: '/notes' },
  { key: 'todos',            label: '任務清單',        group: '業務',   href: '/todos' },
  { key: 'schedule',         label: '每日行程',        group: '業務',   href: '/schedule' },
  { key: 'product-selector', label: '產品篩選／型錄分享', group: '業務', href: '/product-selector' },

  { key: 'sales-orders',     label: '銷貨單',          group: '進銷存', href: '/sales-orders',   costLabel: '看成本' },
  { key: 'inquiries',        label: '廠商詢價單',      group: '進銷存', href: '/inquiries' },
  { key: 'purchase-orders',  label: '訂購單',          group: '進銷存', href: '/purchase-orders' },
  { key: 'shipments',        label: '出貨管理',        group: '進銷存', href: '/shipments' },
  { key: 'inventory',        label: '庫存管理',        group: '進銷存', href: '/inventory',      costLabel: '看庫存價值' },
  { key: 'returns',          label: '退貨管理',        group: '進銷存', href: '/returns' },
  { key: 'products',         label: '產品資料',        group: '進銷存', href: '/products',       costLabel: '看成本價' },

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

  { key: 'ai-command-center', label: 'AI 團隊戰情室',  group: '系統',   href: '/ai-command-center' },
  { key: 'settings',         label: '系統設定',        group: '系統',   href: '/settings' },
  { key: 'permissions',      label: '權限管理',        group: '系統' },
]

export const FEATURE_GROUPS = ['戰情室', '業務', '進銷存', '財務', '服務', '人資', '系統']

export type Perm = {
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  can_cost: boolean
}
export type PermMap = Record<string, Perm>

export const DASHBOARD_FEATURES = new Set([
  'dashboard', 'chairman', 'ceo', 'manager', 'dept', 'team', 'finance',
  'finance-team', 'acct-staff', 'tech-team', 'chief-engineer',
  'senior-engineer', 'hr-dashboard',
])

const DASHBOARD_HREFS: Record<string, string> = {
  dashboard: '/', chairman: '/chairman', ceo: '/ceo', manager: '/manager',
  dept: '/dept', team: '/team', finance: '/finance',
  'finance-team': '/finance-team', 'acct-staff': '/acct-staff',
  'tech-team': '/tech-team', 'chief-engineer': '/chief-engineer',
  'senior-engineer': '/senior-engineer', 'hr-dashboard': '/hr',
}

/**
 * 戰情室只依人員職稱決定，不受角色權限或個人例外影響。
 * role 僅用於舊資料／「員工」職稱的部門判斷。
 */
export function dashboardFeatureFor(title: string, role: string): string | null {
  const t = title.trim().toUpperCase()
  const byTitle: Record<string, string> = {
    '董事長': 'chairman',
    'CEO': 'ceo',
    '執行長': 'ceo',
    '總經理': 'manager',
    '經理': 'dept',
    '主任': 'team',
    '業務主任': 'team',
    '會計主管': 'finance-team',
    '會計': 'acct-staff',
    '會計人員': 'acct-staff',
    '技術主管': 'tech-team',
    '總工程師': 'chief-engineer',
    '資深工程師': 'senior-engineer',
    '工程師': 'tech-team',
    '人資': 'hr-dashboard',
    '人資主管': 'hr-dashboard',
  }
  if (byTitle[t]) return byTitle[t]

  const r = role.trim().toLowerCase()
  if (r === 'hr') return 'hr-dashboard'
  if (r === 'accountant') return 'acct-staff'
  if (r === 'tech') return 'tech-team'
  if (['sales', 'user', 'viewer'].includes(r) || t === '員工') return 'dashboard'
  return null
}

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
  const [title, setTitle] = useState<string>('')

  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setReady(true); return }

      const { data: prof } = await supabase.from('user_profiles').select('role, title').eq('id', user.id).maybeSingle()
      setRole(prof?.role ?? '')
      setTitle(prof?.title ?? '')

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
  const dashboardFeature = dashboardFeatureFor(title, role)
  const dashboardHref = dashboardFeature ? DASHBOARD_HREFS[dashboardFeature] : null

  function can(feature: string, action: keyof Perm = 'can_view'): boolean {
    // AI 團隊戰情室包含跨代理工作與卡點，只允許系統管理員存取。
    if (feature === 'ai-command-center') return isAdmin
    // 管理員是系統最高權限，必須在「戰情室只能看自己的」規則之前放行。
    if (bypass || isAdmin) return true
    // 戰情室是互斥的：每個帳號永遠只能看到自己職稱對應的一間。
    if (DASHBOARD_FEATURES.has(feature)) {
      return action === 'can_view' && feature === dashboardFeature
    }
    return !!perms[feature]?.[action]
  }

  function permOf(feature: string): Perm {
    if (bypass || isAdmin) return ALL
    return perms[feature] ?? NONE
  }

  return {
    perms, can, permOf, ready, bypass, isAdmin, role, title,
    dashboardFeature, dashboardHref,
  }
}
