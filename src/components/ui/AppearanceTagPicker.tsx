'use client'

import { useState } from 'react'

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

export default function AppearanceTagPicker({ value, onChange }: Props) {
  // 內部 state 只在掛載時解析一次；父層若切換編輯對象請帶 key 讓元件重新掛載
  const initial = parseValue(value)
  const [tags, setTags] = useState<string[]>(initial.tags)
  const [extra, setExtra] = useState(initial.extra)

  function toggle(tag: string) {
    const next = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag]
    setTags(next)
    onChange(buildValue(next, extra))
  }

  function handleExtraChange(v: string) {
    setExtra(v)
    onChange(buildValue(tags, v))
  }

  return (
    <div className="space-y-2">
      {APPEARANCE_TAG_GROUPS.map(group => (
        <div key={group.label} className="flex items-start gap-2">
          <span className="text-xs text-gray-400 w-16 shrink-0 pt-1.5">{group.label}</span>
          <div className="flex flex-wrap gap-1.5">
            {group.options.map(opt => {
              const active = tags.includes(opt)
              return (
                <button
                  type="button"
                  key={opt}
                  onClick={() => toggle(opt)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
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
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
