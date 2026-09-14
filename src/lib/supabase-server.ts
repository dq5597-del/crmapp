import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createServerSupabaseClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          return (await cookieStore).getAll()
        },
        async setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            const store = await cookieStore
            cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options))
          } catch {
            // Server Components 不允許寫 cookie；proxy 仍會負責刷新登入狀態。
          }
        },
      },
    }
  )
}
