import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthPage = request.nextUrl.pathname.startsWith('/login')
  const isPublicCatalog = request.nextUrl.pathname.startsWith('/catalog/')
  const isPublicRfq = request.nextUrl.pathname.startsWith('/rfq/')
  const isApi = request.nextUrl.pathname.startsWith('/api/')
  const publicApiPrefixes = [
    '/api/auth/register',
    '/api/web/webhook',
    '/api/rfq/',
    '/api/shipments/sign',
    '/api/work-hours/sign',
    '/api/print/agent/',
    '/api/reminders/run',
  ]
  const isPublicApi = publicApiPrefixes.some(prefix => request.nextUrl.pathname.startsWith(prefix))

  if (!user && isApi && !isPublicApi) {
    return NextResponse.json({ error: '未登入或登入已失效' }, { status: 401 })
  }

  if (!user && !isAuthPage && !isPublicCatalog && !isPublicRfq && !isPublicApi) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isApi) {
    const pathname = request.nextUrl.pathname
    const adminOnlyPrefixes = [
      '/api/restore', '/api/backup', '/api/dedup-quotes', '/api/fix-quote-nos',
      '/api/get-quote-ids', '/api/import-quotes', '/api/seed-categories',
      '/api/seed-clients', '/api/scan-projects',
    ]
    const productWritePrefixes = ['/api/wordpress/', '/api/woocommerce/']

    if (adminOnlyPrefixes.some(prefix => pathname.startsWith(prefix))) {
      const { data: profile } = await supabase.from('user_profiles').select('role,is_active').eq('id', user.id).maybeSingle()
      if (!profile?.is_active || !['admin', '管理員'].includes(profile.role ?? '')) {
        return NextResponse.json({ error: '此操作僅限系統管理員' }, { status: 403 })
      }
    } else if (productWritePrefixes.some(prefix => pathname.startsWith(prefix))) {
      const [{ data: profile }, { data: permissions, error: permissionError }] = await Promise.all([
        supabase.from('user_profiles').select('role,is_active').eq('id', user.id).maybeSingle(),
        supabase.rpc('my_permissions'),
      ])
      const isAdmin = !!profile?.is_active && ['admin', '管理員'].includes(profile.role ?? '')
      const productPermission = (permissions ?? []).find((permission: any) => permission.feature_key === 'products')
      if (!isAdmin && (permissionError || !productPermission?.can_edit)) {
        return NextResponse.json({ error: '缺少產品編輯權限' }, { status: 403 })
      }
    }
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
