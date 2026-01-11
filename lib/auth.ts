import { createServerComponentClient } from './supabase/server'
import { redirect } from 'next/navigation'

export async function getCurrentUser() {
  try {
    const supabase = await createServerComponentClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error) {
      console.error('Auth error:', error.message)
      return null
    }
    
    if (!user) {
      return null
    }
    
    return user
  } catch (error) {
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

