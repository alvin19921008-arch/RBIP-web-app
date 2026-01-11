import { createServerComponentClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'

export type AccountRole = 'user' | 'admin' | 'developer'

export type RequesterContext = {
  requesterId: string
  requesterRole: AccountRole
}

export async function getRequesterContext(): Promise<RequesterContext> {
  const user = await requireAuth()
  const supabase = await createServerComponentClient()

  const { data, error } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const roleRaw = (data as any)?.role
  const role: AccountRole =
    roleRaw === 'developer' || roleRaw === 'admin' || roleRaw === 'user'
      ? roleRaw
      : roleRaw === 'regular'
        ? 'user'
        : roleRaw === 'admin'
          ? 'admin'
          : 'user'

  return { requesterId: user.id, requesterRole: role }
}

export function assertCanManageAccounts(role: AccountRole) {
  if (role === 'user') {
    throw new Error('FORBIDDEN: account management requires admin or developer access')
  }
}

export function assertDeveloper(role: AccountRole) {
  if (role !== 'developer') {
    throw new Error('FORBIDDEN: developer access required')
  }
}

export function assertAdminCanTouchRole(requesterRole: AccountRole, targetRole: AccountRole) {
  // Admins cannot see/edit developers.
  if (requesterRole !== 'developer' && targetRole === 'developer') {
    throw new Error('FORBIDDEN: developers are not manageable by admins')
  }
}

export function assertAdminRoleAssignment(requesterRole: AccountRole, nextRole: AccountRole) {
  if (requesterRole === 'admin' && nextRole === 'developer') {
    throw new Error('FORBIDDEN: admin cannot assign developer role')
  }
}

