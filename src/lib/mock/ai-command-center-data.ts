import type { AIWorkItem, RoleType } from '@/types/ai-command-center'

export const AGENT_PROFILES: Record<RoleType, { displayName: string; responsibility: string }> = {
  codex: { displayName: 'Codex', responsibility: '監督、驗收、權限安全與失敗救援' },
  hermes: { displayName: 'HERMES／小哈', responsibility: '程式執行、資料整理與例行工作' },
  gemini: { displayName: '小古', responsibility: '主指揮、方法審查、拆解與分派工作' },
  claude: { displayName: '小西', responsibility: '重大策略反方檢查，平時節省用量' },
  xiaoji: { displayName: '小雞', responsibility: '大量資料與高記憶體批次處理' },
}

export const MOCK_AI_WORK_ITEMS: AIWorkItem[] = [
  {
    id: 'commerce-review',
    title: 'PChome、momo、Yahoo 電商策略比較',
    owner: 'codex', status: 'done', progress: 100, priority: 'high',
    blocker: null, user_input_needed: null,
    next_action: '將結論轉成光輝網站調整項目', updated_at: '2026-08-12T14:00:00+08:00',
  },
  {
    id: 'ai-command-center',
    title: '光輝系統 AI 戰情室',
    owner: 'hermes', status: 'in_progress', progress: 20, priority: 'urgent',
    blocker: 'HERMES 9B 曾逾時，已改成短任務分段執行', user_input_needed: null,
    next_action: '完成響應式頁面並接入管理者權限', updated_at: '2026-08-12T15:00:00+08:00',
  },
  {
    id: 'website-phase-one',
    title: '光輝網站第一階段優化',
    owner: 'gemini', status: 'waiting_user', progress: 10, priority: 'high',
    blocker: null,
    user_input_needed: '請提供前三種重要客群、三個代表性案例、二十個主力商品型號',
    next_action: '收到資料後建立三個標準方案頁', updated_at: '2026-08-12T14:30:00+08:00',
  },
  {
    id: 'market-tracking',
    title: '競品價格與優惠追蹤',
    owner: 'xiaoji', status: 'backlog', progress: 0, priority: 'medium',
    blocker: null, user_input_needed: null,
    next_action: '確認追蹤商品與通路清單', updated_at: '2026-08-12T14:30:00+08:00',
  },
]
