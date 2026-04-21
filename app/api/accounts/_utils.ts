import { cache } from 'react'
import { getUserRole, requireAuth } from '@/lib/auth'

export type AccountRole = 'user' | 'admin' | 'developer'

export type RequesterContext = {
  requesterId: string
  requesterRole: AccountRole
}

async function getRequesterContextImpl(): Promise<RequesterContext> {
  const user = await requireAuth()
  const role = await getUserRole(user.id)
  return {
    requesterId: user.id,
    requesterRole: role,
  }
}

/**
 * Per-request memoization: multiple calls in the same server request share one
 * resolved context. Trusted identity still comes from `requireAuth` → `getUser()`.
 */
export const getRequesterContext = cache(getRequesterContextImpl)

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
