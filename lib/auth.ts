import { createServerComponentClient } from './supabase/server'
import { redirect } from 'next/navigation'

export async function getCurrentUser() {
  try {
    const supabase = await createServerComponentClient()
    // Always validate with Supabase for trusted user identity.
    const { data: { user }, error } = await supabase.auth.getUser()

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

