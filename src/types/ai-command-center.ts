export type RoleType = 'codex' | 'hermes' | 'gemini' | 'claude' | 'xiaoji'

export type AIWorkStatus =
  | 'backlog'
  | 'in_progress'
  | 'waiting_user'
  | 'review'
  | 'done'
  | 'blocked'

export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export interface AIWorkItem {
  id: string
  title: string
  owner: RoleType
  status: AIWorkStatus
  progress: number
  priority: Priority
  blocker: string | null
  user_input_needed: string | null
  next_action: string | null
  updated_at: string
}
