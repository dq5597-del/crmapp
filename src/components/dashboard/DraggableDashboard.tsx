'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, RotateCcw } from 'lucide-react'

export interface DashboardBlock {
  id: string
  title: string
  node: ReactNode
}

interface Props {
  blocks: DashboardBlock[]
  /** localStorage key，不同儀表板可各自保存排列 */
  storageKey: string
}

function SortableCard({ block }: { block: DashboardBlock }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 30 : undefined,
      }}
      className={isDragging ? 'opacity-90 shadow-xl ring-2 ring-blue-300 rounded-2xl' : ''}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="touch-none flex items-center justify-center w-9 h-9 -ml-2 text-gray-300 hover:text-gray-500 active:text-blue-500 cursor-grab active:cursor-grabbing rounded-lg"
          aria-label={`拖曳調整「${block.title}」位置`}
          title="按住拖曳可調整位置"
        >
          <GripVertical size={17} />
        </button>
        <span className="text-xs text-gray-400 select-none">{block.title}</span>
      </div>
      {block.node}
    </div>
  )
}

export default function DraggableDashboard({ blocks, storageKey }: Props) {
  const defaultOrder = blocks.map((b) => b.id)
  const [order, setOrder] = useState<string[]>(defaultOrder)

  // 讀取先前保存的排列（僅在 client 端執行，避免 SSR/hydration 不一致）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const saved = JSON.parse(raw) as string[]
      if (!Array.isArray(saved) || saved.length === 0) return
      const currentIds = new Set(defaultOrder)
      // 保留仍存在的元件排列，新增的元件（如新上線功能）補在最後，
      // 已消失的元件（如條件式警示卡片目前無資料）自動略過
      const merged = [
        ...saved.filter((id) => currentIds.has(id)),
        ...defaultOrder.filter((id) => !saved.includes(id)),
      ]
      setOrder(merged)
    } catch {
      // localStorage 資料異常時，安靜地維持預設排列即可
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks.length])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id))
      const newIndex = prev.indexOf(String(over.id))
      if (oldIndex === -1 || newIndex === -1) return prev
      const next = arrayMove(prev, oldIndex, newIndex)
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // 無痕模式等 localStorage 不可寫的情況，不影響當下操作
      }
      return next
    })
  }

  function resetOrder() {
    setOrder(defaultOrder)
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
  }

  const blockMap = new Map(blocks.map((b) => [b.id, b]))
  const visibleOrder = order.filter((id) => blockMap.has(id))
  const isCustomOrder = visibleOrder.join() !== defaultOrder.filter((id) => visibleOrder.includes(id)).join()

  return (
    <div className="space-y-6">
      {isCustomOrder && (
        <div className="flex justify-end -mb-3">
          <button
            onClick={resetOrder}
            type="button"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 min-h-[44px] sm:min-h-0"
          >
            <RotateCcw size={13} />
            還原預設排列
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      >
        <SortableContext items={visibleOrder} strategy={verticalListSortingStrategy}>
          <div className="space-y-6">
            {visibleOrder.map((id) => {
              const block = blockMap.get(id)
              if (!block) return null
              return <SortableCard key={id} block={block} />
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
