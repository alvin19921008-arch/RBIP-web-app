import type { LeaveType } from '@/types/staff'

/**
 * Returns true when the UI/data represents "on duty / no leave".
 *
 * Notes:
 * - In most places we store on-duty as `null`.
 * - Some legacy/persisted data may store on-duty as a string (e.g. 'none' or 'On duty (no leave)').
 */
export function isOnDutyLeaveType(leaveType: LeaveType | null | undefined): boolean {
  if (leaveType === null || leaveType === undefined) return true
  if (typeof leaveType !== 'string') return false

  const s = leaveType.trim().toLowerCase()
  if (s === '') return true
  if (s === 'none') return true
  if (s === 'on duty') return true
  if (s === 'on duty (no leave)') return true
  // tolerate minor variations
  if (s.startsWith('on duty')) return true

  return false
}

