import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

function isLocalhostHost(host: string | null): boolean {
  if (!host) return false
  const h = host.toLowerCase()
  return h.startsWith('localhost') || h.startsWith('127.0.0.1')
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Localhost-only restriction (no dev secret).
  // We prefer x-forwarded-host if present (some proxies/devtools set it).
  const forwardedHost = req.headers.get('x-forwarded-host')
  const host = forwardedHost || req.headers.get('host')
  if (!isLocalhostHost(host)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const admin = createSupabaseAdminClient()

    // Pick a deterministic developer profile (newest update wins).
    const { data: profile, error: profileError } = await admin
      .from('user_profiles')
      .select('id')
      .eq('role', 'developer')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (profileError) throw new Error(profileError.message)
    const devUserId = (profile as any)?.id as string | undefined
    if (!devUserId) throw new Error('No developer account found in user_profiles')

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(devUserId)
    if (userError) throw new Error(userError.message)
    const email = userData.user?.email
    if (!email) throw new Error('Developer account has no email')

    // Generate a magiclink OTP (but do NOT email it; we will verify server-side).
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: new URL('/schedule', req.url).toString(),
      },
    })
    if (linkError) throw new Error(linkError.message)
    const emailOtp = linkData?.properties?.email_otp
    if (!emailOtp) throw new Error('Failed to generate magiclink OTP')

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
    if (!anon) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY')

    const cookieStore = await cookies()
    const res = NextResponse.redirect(new URL('/schedule', req.url))

    const supabase = createServerClient(url, anon, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          res.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          res.cookies.set({ name, value: '', ...options })
        },
      },
    })

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: emailOtp,
      type: 'magiclink',
    })

    if (verifyError) throw new Error(verifyError.message)

    return res
  } catch (e) {
    return NextResponse.json(
      {
        error: (e as any)?.message || 'Unexpected error',
      },
      { status: 500 }
    )
  }
}

