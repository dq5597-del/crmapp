'use client'

/**
 * 戰情室共用區塊組
 *
 * 每個戰情室都掛這組區塊，以 room key 隔離資料：
 *   訊息（共用，不分室）／今日行程＋空檔任務／目標進度／行事曆／快捷筆記
 *
 * 排序可拖曳，記憶在 localStorage，各室各自一份（storageKey 帶 room）。
 *
 * ⚠ 需先在 Supabase 執行 sql/room_scope.sql（notes / schedules / goals 加 room 欄位），
 *   否則各室會讀不到資料（查詢條件 .eq('room', room) 會找不到欄位）。
 */

import MessagesWidget from './MessagesWidget'
import TodaySchedule from './TodaySchedule'
import CalendarWidget from './CalendarWidget'
import QuickNotes from './QuickNotes'
import GoalsWidget from './GoalsWidget'
import DraggableDashboard, { type DashboardBlock } from './DraggableDashboard'

export default function RoomBoard({ room }: { room: string }) {
  const blocks: DashboardBlock[] = [
    { id: 'messages', title: '訊息', node: <MessagesWidget /> },
    { id: 'today', title: '今日行程與空檔任務', node: <TodaySchedule room={room} /> },
    { id: 'goals', title: '目標進度', node: <GoalsWidget room={room} /> },
    { id: 'calendar', title: '行事曆', node: <CalendarWidget room={room} /> },
    { id: 'notes', title: '快捷筆記', node: <QuickNotes room={room} /> },
  ]

  return <DraggableDashboard blocks={blocks} storageKey={`room-board-order-${room}-v1`} />
}
