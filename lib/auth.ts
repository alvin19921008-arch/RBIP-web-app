import { createServerComponentClient } from './supabase/server'
import { redirect } from 'next/navigation'
import { jwtVerify } from 'jose'

async function verifySupabaseAccessToken(accessToken: string) {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) return { ok: false as const, reason: 'missing_secret' as const }

  try {
    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(accessToken, key, { algorithms: ['HS256'] })
    const sub = typeof payload.sub === 'string' ? payload.sub : null
    if (!sub) return { ok: false as const, reason: 'missing_sub' as const }
    return { ok: true as const, sub }
  } catch {
    return { ok: false as const, reason: 'invalid_token' as const }
  }
}

export async function getCurrentUser() {
  try {
    const supabase = await createServerComponentClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    // Fast-path: validate the access token locally (no network).
    // Enable by setting SUPABASE_JWT_SECRET on the server.
    if (session?.access_token) {
      const verified = await verifySupabaseAccessToken(session.access_token)
      if (verified.ok) {
        // Extra guard: ensure the token subject matches the session user id.
        if (session.user?.id && session.user.id === verified.sub) {
          return session.user
        }
        return null
      }
    }

    // Secure fallback: validate with Supabase (network). This is slower and is the
    // main contributor to high TTFB when called from server layouts.
    const { data: { user }, error } = await supabase.auth.getUser()

    if (sessionError) {
      console.warn('Session error:', sessionError.message)
    }

    if (error) {
      console.error('Auth error:', error.message)
      return null
    }

    return user ?? null
  } catch (error: unknown) {
    // During `next build`, Next may probe for static rendering and throw
    // DYNAMIC_SERVER_USAGE when code calls `cookies()`. These routes are
    // dynamic by design, so avoid noisy logs in build output.
    const maybeErr = error as { digest?: string } | null
    if (maybeErr?.digest === 'DYNAMIC_SERVER_USAGE') return null

    console.error('Auth exception:', error)
    return null
  }
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/login')
  }
  return user
}

export type UserRole = 'user' | 'admin' | 'developer'

export async function getUserRole(userId: string): Promise<UserRole> {
  const supabase = await createServerComponentClient()
  const { data, error } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .single()
  
  if (error || !data) {
    return 'user'
  }
  
  const role = (data as any).role
  if (role === 'developer' || role === 'admin' || role === 'user') return role
  if (role === 'regular') return 'user'
  return 'user'
}

export async function requireAdmin() {
  const user = await requireAuth()
  const role = await getUserRole(user.id)
  
  if (role !== 'admin' && role !== 'developer') {
    redirect('/schedule')
  }
  
  return { user, role }
}

