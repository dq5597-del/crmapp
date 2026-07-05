'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

// 長相／特徵標籤組 —— 供業務快速勾選認人，勿加入性向等敏感個資標籤
export const APPEARANCE_TAG_GROUPS: { label: string; options: string[] }[] = [
  { label: '性別', options: ['男', '女'] },
  { label: '年齡', options: ['20多', '30多', '40多', '50多', '60以上'] },
  { label: '身高', options: ['高', '中', '矮'] },
  { label: '體型', options: ['胖', '中等', '瘦', '壯'] },
  { label: '髮型／髮色', options: ['光頭', '平頭', '長髮', '短髮', '白髮', '染髮'] },
  { label: '臉部特徵', options: ['戴眼鏡', '有鬍子', '膚色黝黑', '膚色白皙'] },
  { label: '其他辨識', options: ['刺青', '疤痕', '輪椅／拐杖', '聲音宏亮', '口音明顯'] },
]

const ALL_TAGS = APPEARANCE_TAG_GROUPS.flatMap(g => g.options)

function parseValue(value: string) {
  if (!value) return { tags: [] as string[], extra: '' }
  const tokens = value.split(/[、,，]/).map(t => t.trim()).filter(Boolean)
  const tags = tokens.filter(t => ALL_TAGS.includes(t))
  const extra = tokens.filter(t => !ALL_TAGS.includes(t)).join('、')
  return { tags, extra }
}

function buildValue(tags: string[], extra: string) {
  const parts = [...tags]
  if (extra.trim()) parts.push(extra.trim())
  return parts.join('、')
}

interface Props {
  value: string
  onChange: (v: string) => void
}

// 收合式下拉多選：關閉時只佔一行（跟一般輸入框同高），適合手機版；
// 點開才展開分類勾選面板，選外面自動收合。字級加大方便老花眼使用者閱讀。
export default function AppearanceTagPicker({ value, onChange }: Props) {
  // 內部 state 只在掛載時解析一次；父層若切換編輯對象請帶 key 讓元件重新掛載
  const initial = parseValue(value)
  const [tags, setTags] = useState<string[]>(initial.tags)
  const [extra, setExtra] = useState(initial.extra)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  function toggle(tag: string) {
    const next = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]
    setTags(next)
    onChange(buildValue(next, extra))
  }

  function handleExtraChange(v: string) {
    setExtra(v)
    onChange(buildValue(tags, v))
  }

  const summary = [...tags, extra].filter(Boolean).join('、')

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-3 border border-gray-200 rounded-xl text-base text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className={summary ? 'text-gray-900 truncate' : 'text-gray-400'}>
          {summary || '點選長相 / 特徵標籤'}
        </span>
        <ChevronDown size={20} className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full bg-white border border-gray-200 rounded-xl shadow-lg p-3.5 space-y-3 max-h-80 overflow-y-auto">
          {APPEARANCE_TAG_GROUPS.map(group => (
            <div key={group.label} className="flex items-start gap-2">
              <span className="text-sm text-gray-500 w-16 shrink-0 pt-2">{group.label}</span>
              <div className="flex flex-wrap gap-2">
                {group.options.map(opt => {
                  const active = tags.includes(opt)
                  return (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => toggle(opt)}
                      className={`px-3.5 py-2 rounded-lg text-base font-medium border transition-colors ${
                        active
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
                      }`}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <input
            value={extra}
            onChange={e => handleExtraChange(e.target.value)}
            placeholder="其他補充（自由輸入）"
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}
    </div>
  )
}
