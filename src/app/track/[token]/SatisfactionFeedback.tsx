'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Star, CheckCircle } from 'lucide-react'

export default function SatisfactionFeedback({ token, initialRating, initialComment, initialSubmittedAt }: {
  token: string
  initialRating: number | null
  initialComment: string | null
  initialSubmittedAt: string | null
}) {
  const supabase = createClient()
  const [rating, setRating] = useState(initialRating ?? 0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState(initialComment ?? '')
  const [submitted, setSubmitted] = useState(!!initialSubmittedAt)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function submit() {
    if (rating === 0) { setErrorMsg('請先點選滿意度星等'); return }
    setErrorMsg(null)
    setSaving(true)
    const { error } = await supabase
      .from('service_requests')
      .update({
        satisfaction_rating: rating,
        satisfaction_comment: comment || null,
        satisfaction_submitted_at: new Date().toISOString(),
      })
      .eq('track_token', token)
      .eq('is_closed', true)
    setSaving(false)
    if (error) {
      setErrorMsg('目前無法送出評分，請稍後再試或直接與我們聯繫。')
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="bg-green-50 rounded-2xl border border-green-200 p-5 text-center">
        <CheckCircle size={24} className="text-green-600 mx-auto mb-2" />
        <p className="text-sm font-semibold text-green-800">感謝您的評分回饋！</p>
        <p className="text-xs text-green-700 mt-1">您的意見是我們持續進步的動力。</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-gray-800 mb-1">服務滿意度評分</h2>
      <p className="text-xs text-gray-500 mb-4">您的意見將幫助我們提供更好的服務</p>

      <div className="flex items-center gap-1 mb-4 justify-center">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="p-1"
            aria-label={`${n} 星`}
          >
            <Star
              size={32}
              className={(hover || rating) >= n ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}
            />
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="有什麼想告訴我們的嗎？（選填）"
        rows={3}
        className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
      />

      {errorMsg && <p className="text-xs text-red-600 mb-3">{errorMsg}</p>}

      <button
        onClick={submit}
        disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
      >
        {saving ? '送出中...' : '送出評分'}
      </button>
    </div>
  )
}
