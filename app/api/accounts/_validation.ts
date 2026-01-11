import type { AccountRole } from '@/app/api/accounts/_utils'

export function normalizeUsername(input: unknown): string {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) throw new Error('Username is required')
  return raw
}

export function normalizeEmail(input: unknown): string | null {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) return null
  return raw
}

export function normalizePassword(input: unknown): string {
  const raw = typeof input === 'string' ? input : ''
  if (!raw) throw new Error('Password is required')
  return raw
}

export function normalizeRole(input: unknown): AccountRole {
  const raw = typeof input === 'string' ? input : ''
  if (raw === 'user' || raw === 'admin' || raw === 'developer') return raw
  throw new Error('Invalid role')
}

export function computeAuthEmail(username: string, publicEmail: string | null): string {
  if (publicEmail) return publicEmail
  return `${username.toLowerCase()}@rbip.local`
}

