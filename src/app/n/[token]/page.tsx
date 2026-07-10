import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { StickyNote } from 'lucide-react'

export default async function SharedNotePage({ params }: { params: { token: string } }) {
  const supabase = createServerSupabaseClient()

  const { data: note } = await supabase
    .from('notes')
    .select('title, content, created_by_name, updated_at')
    .eq('share_token', params.token)
    .eq('is_public', true)
    .single()

  if (!note) return notFound()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
            <StickyNote size={18} className="text-white" />
          </div>
          <div>
            <p className="text-xs text-gray-500">光輝影音科技</p>
            <p className="text-sm font-semibold text-gray-800">分享筆記</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-2">{note.title}</h1>
          <p className="text-xs text-gray-400 mb-5">
            {note.created_by_name ? `${note.created_by_name} · ` : ''}
            更新於 {new Date(note.updated_at).toLocaleDateString('zh-TW')}
          </p>
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {note.content || '（無內容）'}
          </div>
        </div>

        <div className="text-center text-xs text-gray-400 pt-6">
          <p>此頁面由光輝影音科技 CRM 系統分享</p>
        </div>
      </div>
    </div>
  )
}
