'use server'

import type { Team } from '@/types/staff'
import { createServerComponentClient } from '@/lib/supabase/server'

type ActionResult = {
  ok: boolean
  error?: string
  usedLegacyFallback?: boolean
}

const isMissingColumnError = (error: any) => {
  const msg = typeof error?.message === 'string' ? error.message : ''
  return msg.includes('column') || error?.code === '42703' || error?.code === 'PGRST116'
}

export async function promoteInactiveStaffToBufferAction(staffIds: string[]): Promise<ActionResult> {
  const ids = Array.from(new Set((staffIds || []).filter(Boolean)))
  if (ids.length === 0) return { ok: true }

  try {
    const supabase = await createServerComponentClient()
    const promoteAttempt = await supabase.from('staff').update({ status: 'buffer' }).in('id', ids)
    if (!promoteAttempt.error) return { ok: true, usedLegacyFallback: false }

    if (!isMissingColumnError(promoteAttempt.error)) {
      return { ok: false, error: promoteAttempt.error.message || 'Failed to promote inactive staff.' }
    }

    const legacyAttempt = await supabase.from('staff').update({ active: true }).in('id', ids)
    if (legacyAttempt.error) {
      return { ok: false, error: legacyAttempt.error.message || 'Failed legacy promotion fallback.' }
    }

    return { ok: true, usedLegacyFallback: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to promote inactive staff.' }
  }
}

export async function convertBufferStaffToInactiveAction(staffId: string): Promise<ActionResult> {
  if (!staffId) return { ok: false, error: 'Missing staff id.' }

  try {
    const supabase = await createServerComponentClient()
    const attempt = await supabase
      .from('staff')
      .update({ status: 'inactive', team: null })
      .eq('id', staffId)

    if (!attempt.error) return { ok: true, usedLegacyFallback: false }
    if (!isMissingColumnError(attempt.error)) {
      return { ok: false, error: attempt.error.message || 'Failed to convert buffer staff to inactive.' }
    }

    const legacyAttempt = await supabase.from('staff').update({ active: false, team: null }).eq('id', staffId)
    if (legacyAttempt.error) {
      return { ok: false, error: legacyAttempt.error.message || 'Failed legacy inactive fallback.' }
    }

    return { ok: true, usedLegacyFallback: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to convert buffer staff to inactive.' }
  }
}

export async function updateBufferStaffTeamAction(staffId: string, team: Team | null): Promise<ActionResult> {
  if (!staffId) return { ok: false, error: 'Missing staff id.' }

  try {
    const supabase = await createServerComponentClient()
    const attempt = await supabase.from('staff').update({ team }).eq('id', staffId)
    if (attempt.error) {
      return { ok: false, error: attempt.error.message || 'Failed to update buffer staff team.' }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to update buffer staff team.' }
  }
}
