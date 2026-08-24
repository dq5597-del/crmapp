'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Plus, RefreshCw, Save, Settings2, Trash2, X } from 'lucide-react'
import type { ProductFilterGroup, ProductFilterInputType, ProductFilterSelectionMode } from '@/lib/product-filters'

type Props = {
  open: boolean
  categoryId: string
  categoryName: string
  groups: ProductFilterGroup[]
  supabase: any
  onClose: () => void
  onSaved: () => Promise<void>
}

function uniqueSlug(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export default function ProductFilterManagerModal({ open, categoryId, categoryName, groups, supabase, onClose, onSaved }: Props) {
  const categoryGroups = useMemo(
    () => groups.filter(group => group.category_ids.includes(categoryId)),
    [groups, categoryId],
  )
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const selectedGroup = categoryGroups.find(group => group.id === selectedGroupId) ?? categoryGroups[0]
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [selectionMode, setSelectionMode] = useState<ProductFilterSelectionMode>('multiple')
  const [webSyncEnabled, setWebSyncEnabled] = useState(true)
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({})
  const [newOption, setNewOption] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<ProductFilterInputType>('multi_select')
  const [newUnit, setNewUnit] = useState('')
  const [newMode, setNewMode] = useState<ProductFilterSelectionMode>('multiple')
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!open) return
    if (!selectedGroupId && categoryGroups[0]) setSelectedGroupId(categoryGroups[0].id)
  }, [open, categoryGroups, selectedGroupId])

  useEffect(() => {
    if (!selectedGroup) return
    setName(selectedGroup.name)
    setUnit(selectedGroup.unit ?? '')
    setSelectionMode(selectedGroup.selection_mode)
    setWebSyncEnabled(selectedGroup.web_sync_enabled !== false)
    setOptionDrafts(Object.fromEntries(selectedGroup.options.map(option => [option.id, option.name])))
    setNewOption('')
    setError('')
    setNotice('')
  }, [selectedGroup?.id, selectedGroup?.name, selectedGroup?.unit, selectedGroup?.selection_mode, selectedGroup?.web_sync_enabled, selectedGroup?.options])

  if (!open) return null

  async function syncWebsite(groupId?: string) {
    const response = await fetch('/api/wordpress/filter-sets/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId, group_id: groupId }),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok) throw new Error(result?.error ?? `官網同步失敗（HTTP ${response.status}）`)
    const warning = Array.isArray(result?.warnings) && result.warnings.length
      ? `；注意：${result.warnings.join('、')}`
      : ''
    const unresolved = Array.isArray(result?.unresolved) && result.unresolved.length
      ? `；找不到同名官網分類：${result.unresolved.map((row: any) => row.name).join('、')}`
      : ''
    return `官網已同步 ${result?.categories ?? 0} 個分類${warning}${unresolved}`
  }

  async function run(key: string, action: () => Promise<string>, success: string) {
    setSaving(key); setError(''); setNotice('')
    let stored = false
    try {
      const groupId = await action()
      stored = true
      await onSaved()
      const webResult = await syncWebsite(groupId)
      setNotice(`${success}，${webResult}`)
    } catch (cause: any) {
      const message = cause?.message ?? '儲存失敗，請稍後再試'
      setError(stored ? `${success}，但${message}` : message)
    } finally {
      setSaving('')
    }
  }

  async function syncNow() {
    setSaving('sync'); setError(''); setNotice('')
    try {
      const result = await syncWebsite(selectedGroup?.id)
      await onSaved()
      setNotice(result)
    } catch (cause: any) {
      setError(cause?.message ?? '官網同步失敗')
    } finally {
      setSaving('')
    }
  }

  async function saveGroup() {
    if (!selectedGroup || !name.trim()) return setError('請輸入篩選條件名稱')
    await run('group', async () => {
      const { error: updateError } = await supabase.from('product_filter_groups').update({
        name: name.trim(),
        unit: selectedGroup.input_type === 'number' ? unit.trim() || null : null,
        selection_mode: selectionMode,
        web_sync_enabled: webSyncEnabled,
        updated_at: new Date().toISOString(),
      }).eq('id', selectedGroup.id)
      if (updateError) throw updateError
      return selectedGroup.id
    }, '篩選條件已更新')
  }

  async function saveOption(optionId: string) {
    const value = optionDrafts[optionId]?.trim()
    if (!value) return setError('選項名稱不可空白')
    await run(`option-${optionId}`, async () => {
      const option = selectedGroup?.options.find(row => row.id === optionId)
      if (!selectedGroup || !option) throw new Error('找不到要更新的選項')
      const aliases = Array.from(new Set([...(option.aliases ?? []), option.name].map(row => row.trim()).filter(Boolean)))
      const { error: updateError } = await supabase.from('product_filter_options').update({ name: value, aliases }).eq('id', optionId)
      if (updateError) throw updateError
      return selectedGroup.id
    }, '選項已更新')
  }

  async function addOption() {
    if (!selectedGroup || !newOption.trim()) return setError('請輸入新選項名稱')
    await run('new-option', async () => {
      const maxSort = selectedGroup.options.reduce((max, option) => Math.max(max, option.sort_order), 0)
      const { error: insertError } = await supabase.from('product_filter_options').insert({
        group_id: selectedGroup.id,
        name: newOption.trim(),
        slug: uniqueSlug('custom_option'),
        aliases: [],
        sort_order: maxSort + 10,
        is_active: true,
      })
      if (insertError) throw insertError
      setNewOption('')
      return selectedGroup.id
    }, '新選項已加入')
  }

  async function deleteOption(optionId: string, optionName: string) {
    if (!confirm(`確定刪除選項「${optionName}」？所有產品已套用的此選項也會移除。`)) return
    await run(`delete-option-${optionId}`, async () => {
      const { error: assignmentError } = await supabase.from('product_filter_assignments').delete().eq('option_id', optionId)
      if (assignmentError) throw assignmentError
      const { error: optionError } = await supabase.from('product_filter_options').update({ is_active: false }).eq('id', optionId)
      if (optionError) throw optionError
      return selectedGroup.id
    }, '選項已刪除')
  }

  async function deleteGroupFromCategory() {
    if (!selectedGroup) return
    if (!confirm(`確定從「${categoryName}」刪除篩選條件「${selectedGroup.name}」？\n\n此分類產品已填寫的對應值會一併移除；其他分類不受影響。`)) return
    await run('delete-group', async () => {
      const { error: exclusionError } = await supabase.from('product_category_filter_exclusions').upsert(
        { category_id: categoryId, group_id: selectedGroup.id },
        { onConflict: 'category_id,group_id' },
      )
      if (exclusionError) {
        if (String(exclusionError.message).includes('product_category_filter_exclusions')) {
          throw new Error('尚未建立分類刪除規則資料表，請先執行最新 Supabase migration。')
        }
        throw exclusionError
      }

      const { data: categoryProducts, error: productsError } = await supabase.from('products').select('id').eq('category_id', categoryId)
      if (productsError) throw productsError
      const productIds = (categoryProducts ?? []).map((row: { id: string }) => row.id)
      if (productIds.length > 0) {
        const { data: groupOptions, error: optionsError } = await supabase.from('product_filter_options').select('id').eq('group_id', selectedGroup.id)
        if (optionsError) throw optionsError
        const optionIds = (groupOptions ?? []).map((row: { id: string }) => row.id)
        if (optionIds.length > 0) {
          const { error: assignmentError } = await supabase.from('product_filter_assignments').delete().in('product_id', productIds).in('option_id', optionIds)
          if (assignmentError) throw assignmentError
        }
        const { error: numberError } = await supabase.from('product_filter_numbers').delete().in('product_id', productIds).eq('group_id', selectedGroup.id)
        if (numberError) throw numberError
      }
      setSelectedGroupId('')
      return selectedGroup.id
    }, '篩選條件已從此分類刪除')
  }

  async function addGroup() {
    if (!newName.trim()) return setError('請輸入新篩選條件名稱')
    await run('new-group', async () => {
      const maxSort = categoryGroups.reduce((max, group) => Math.max(max, group.category_sort_orders?.[categoryId] ?? group.sort_order), 0)
      const { data: created, error: groupError } = await supabase.from('product_filter_groups').insert({
        name: newName.trim(),
        slug: uniqueSlug('custom_filter'),
        input_type: newType,
        unit: newType === 'number' ? newUnit.trim() || null : null,
        selection_mode: newMode,
        sort_order: maxSort + 10,
        is_active: true,
      }).select('id').single()
      if (groupError) throw groupError

      const templateSlug = `custom_category_${categoryId.replaceAll('-', '')}`
      let { data: template, error: templateLookupError } = await supabase.from('product_filter_templates').select('id').eq('slug', templateSlug).maybeSingle()
      if (templateLookupError) throw templateLookupError
      if (!template) {
        const result = await supabase.from('product_filter_templates').insert({
          name: `${categoryName}－自訂篩選`, slug: templateSlug, sort_order: 9990, is_active: true,
        }).select('id').single()
        if (result.error) throw result.error
        template = result.data
      }
      const { error: categoryError } = await supabase.from('product_category_filter_templates').upsert(
        { category_id: categoryId, template_id: template.id },
        { onConflict: 'category_id,template_id' },
      )
      if (categoryError) throw categoryError
      const { error: mappingError } = await supabase.from('product_filter_template_groups').upsert(
        { template_id: template.id, group_id: created.id, sort_order: maxSort + 10, is_required: false },
        { onConflict: 'template_id,group_id' },
      )
      if (mappingError) throw mappingError
      setNewName(''); setNewUnit(''); setSelectedGroupId(created.id)
      return created.id as string
    }, '新篩選條件已建立')
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4" role="dialog" aria-modal="true" aria-label="管理篩選條件">
    <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <div className="rounded-xl bg-violet-100 p-2 text-violet-700"><Settings2 size={18} /></div>
        <div><h2 className="font-bold text-gray-900">管理「{categoryName}」篩選條件</h2><p className="text-xs text-gray-500">新增、修改條件與選項，並指定顧客可單選或多選</p></div>
        <button type="button" disabled={!!saving} onClick={syncNow} className="ml-auto flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">{saving === 'sync' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}立即同步官網</button>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label="關閉"><X size={18} /></button>
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="overflow-y-auto border-r border-gray-100 bg-gray-50 p-3">
          <p className="mb-2 px-2 text-xs font-semibold text-gray-500">現有條件（{categoryGroups.length}）</p>
          <div className="space-y-1">{categoryGroups.map(group => <button key={group.id} type="button" onClick={() => setSelectedGroupId(group.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedGroup?.id === group.id ? 'bg-violet-600 text-white' : 'text-gray-700 hover:bg-white'}`}><span className="block font-medium">{group.name}</span><span className={`text-[11px] ${selectedGroup?.id === group.id ? 'text-violet-100' : 'text-gray-400'}`}>{group.selection_mode === 'single' ? '單一選' : '多選'} · {group.input_type === 'number' ? '數值區間' : `${group.options.length} 個選項`}</span></button>)}</div>
        </aside>

        <main className="overflow-y-auto p-5">
          {error ? <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          {notice ? <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><Check size={14} />{notice}</div> : null}

          <section className="rounded-xl border border-violet-100 bg-violet-50/30 p-4">
            <h3 className="mb-3 text-sm font-bold text-gray-900"><Plus size={15} className="mr-1 inline" />新增篩選條件</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-gray-600 sm:col-span-2">條件名稱<input value={newName} onChange={event => setNewName(event.target.value)} placeholder="例如：安裝方式" className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-gray-600">資料型態<select value={newType} onChange={event => setNewType(event.target.value as ProductFilterInputType)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"><option value="multi_select">文字選項</option><option value="number">數值區間</option></select></label>
              <label className="text-xs font-medium text-gray-600">選取方式<select value={newMode} onChange={event => setNewMode(event.target.value as ProductFilterSelectionMode)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"><option value="multiple">多選</option><option value="single">單一選</option></select></label>
              {newType === 'number' ? <label className="text-xs font-medium text-gray-600">單位<input value={newUnit} onChange={event => setNewUnit(event.target.value)} placeholder="例如 W、吋" className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" /></label> : null}
            </div>
            <button type="button" disabled={!!saving} onClick={addGroup} className="mt-3 flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">{saving === 'new-group' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}建立條件</button>
          </section>

          {selectedGroup ? <section className="mt-5">
            <h3 className="text-sm font-bold text-gray-900">修改篩選條件</h3>
            <p className="mt-1 text-xs text-amber-700">共用條件的名稱與選項修改後，其他有使用此條件的分類也會同步更新。</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-gray-600">條件名稱<input value={name} onChange={event => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-gray-600">選取方式<select value={selectionMode} onChange={event => setSelectionMode(event.target.value as ProductFilterSelectionMode)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"><option value="multiple">多選</option><option value="single">單一選</option></select></label>
              {selectedGroup.input_type === 'number' ? <label className="text-xs font-medium text-gray-600">單位<input value={unit} onChange={event => setUnit(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></label> : <div className="text-xs text-gray-500"><span className="block font-medium text-gray-600">資料型態</span><span className="mt-1 block rounded-lg bg-gray-100 px-3 py-2 text-sm">文字選項</span></div>}
              <label className="flex items-center gap-2 self-end rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700">
                <input type="checkbox" checked={webSyncEnabled} onChange={event => setWebSyncEnabled(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-violet-600" />同步官網篩選器
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={!!saving} onClick={saveGroup} className="flex items-center gap-1.5 rounded-lg border border-violet-200 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50">{saving === 'group' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}儲存條件設定</button>
              <button type="button" disabled={!!saving} onClick={deleteGroupFromCategory} className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">{saving === 'delete-group' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}從此分類刪除</button>
              <span className="text-[11px] text-gray-400">{selectedGroup.woo_attribute_slug ? `官網屬性：${selectedGroup.woo_attribute_slug}` : '首次推送商品時自動建立官網屬性'}</span>
            </div>

            {selectedGroup.input_type === 'multi_select' ? <div className="mt-5 border-t border-gray-100 pt-4">
              <h4 className="text-sm font-semibold text-gray-900">選項設定</h4>
              <div className="mt-3 space-y-2">{selectedGroup.options.map(option => <div key={option.id} className="flex gap-2"><input value={optionDrafts[option.id] ?? ''} onChange={event => setOptionDrafts(current => ({ ...current, [option.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" /><button type="button" disabled={!!saving || optionDrafts[option.id]?.trim() === option.name} onClick={() => saveOption(option.id)} className="rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-35">{saving === `option-${option.id}` ? '儲存中' : '更新'}</button><button type="button" disabled={!!saving} onClick={() => deleteOption(option.id, option.name)} className="rounded-lg border border-red-100 px-2.5 text-red-500 hover:bg-red-50 disabled:opacity-35" aria-label={`刪除選項 ${option.name}`}>{saving === `delete-option-${option.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}</button></div>)}</div>
              <div className="mt-3 flex gap-2"><input value={newOption} onChange={event => setNewOption(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addOption() } }} placeholder="輸入新選項" className="min-w-0 flex-1 rounded-lg border border-violet-200 px-3 py-2 text-sm" /><button type="button" disabled={!!saving || !newOption.trim()} onClick={addOption} className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 text-sm font-medium text-white disabled:opacity-50"><Plus size={14} />新增選項</button></div>
            </div> : <div className="mt-5 rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-600">數值型條件會依單位自動產生區間選項；商品的實際數值仍在商品規格資料中維護。</div>}
          </section> : <div className="mt-5 rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">此分類尚無篩選條件，請先建立第一個條件。</div>}
        </main>
      </div>
    </div>
  </div>
}
