'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 註冊
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [regName, setRegName] = useState('')
  const [regCode, setRegCode] = useState('')
  const [regDone, setRegDone] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (/banned|disabled/i.test(error.message)) {
        setError('此帳號尚未啟用，請等待管理員審核')
      } else {
        setError('帳號或密碼錯誤')
      }
    } else {
      router.push('/')
      router.refresh()
    }
    setLoading(false)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: regName, code: regCode }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || '註冊失敗'); return }
      setRegDone(true)
    } catch {
      setError('註冊失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <span className="text-white text-2xl font-bold">光</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">光輝影音科技</h1>
          <p className="text-gray-500 mt-1">CRM 管理系統</p>
        </div>

        {/* 登入 / 員工註冊 切換 */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); setRegDone(false) }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${mode === 'login' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}
          >
            登入
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError('') }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${mode === 'register' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}
          >
            員工註冊
          </button>
        </div>

        {regDone ? (
          <div className="space-y-4 text-center">
            <div className="bg-green-50 text-green-800 text-sm px-4 py-4 rounded-xl leading-relaxed">
              註冊完成！<br />
              你的帳號需經<strong>管理員審核啟用</strong>後才能登入，<br />
              啟用後即可用此 Email 與密碼登入。
            </div>
            <button
              type="button"
              onClick={() => { setMode('login'); setRegDone(false); setPassword(''); setRegCode(''); setRegName('') }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition"
            >
              回到登入
            </button>
          </div>
        ) : (
        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-5">
          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                姓名
              </label>
              <input
                type="text"
                required
                value={regName}
                onChange={e => setRegName(e.target.value)}
                placeholder="王小明"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              電子信箱
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              密碼
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                公司註冊碼
              </label>
              <input
                type="text"
                required
                value={regCode}
                onChange={e => setRegCode(e.target.value)}
                placeholder="請向管理員索取"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              <p className="text-xs text-gray-400 mt-1.5">密碼至少 8 碼。註冊後需管理員審核啟用才能登入。</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 rounded-xl transition"
          >
            {loading ? (mode === 'login' ? '登入中...' : '註冊中...') : (mode === 'login' ? '登入' : '送出註冊')}
          </button>
        </form>
        )}
      </div>
    </div>
  )
}
