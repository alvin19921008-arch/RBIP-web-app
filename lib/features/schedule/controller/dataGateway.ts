import type { Staff } from '@/types/staff'
import type { SpecialProgram, SPTAllocation, PCAPreference } from '@/types/allocation'

type GatewayResult<T> = {
  data: T | null
  error: string | null
  usedFallback: boolean
}

const isMissingColumnError = (error: any, fieldHint?: string) => {
  const msg = typeof error?.message === 'string' ? error.message : ''
  if (fieldHint && msg.includes(fieldHint)) return true
  return msg.includes('column') || error?.code === '42703'
}

export function splitStaffRowsByStatus(rows: Staff[]) {
  const normalizedRows = rows.map((row) => {
    const rawStatus = (row as any)?.status
    const hasSupportedStatus = rawStatus === 'active' || rawStatus === 'inactive' || rawStatus === 'buffer'
    if (hasSupportedStatus) return row

    // Legacy compatibility: old schemas only store [active] boolean (no [status]/[buffer]).
    const legacyActive = (row as any)?.active
    const normalizedStatus = typeof legacyActive === 'boolean' ? (legacyActive ? 'active' : 'inactive') : 'active'
    return {
      ...row,
      status: normalizedStatus,
    } as Staff
  })

  const activeRows = normalizedRows.filter((s) => s.status === 'active' || s.status == null)
  const inactiveRows = normalizedRows.filter((s) => s.status === 'inactive')
  const bufferRows = normalizedRows.filter((s) => s.status === 'buffer')

  return { normalizedRows, activeRows, inactiveRows, bufferRows }
}

export async function fetchStaffRowsWithFallback(args: {
  supabase: any
  selectFields: string
}): Promise<GatewayResult<Staff[]>> {
  const { supabase, selectFields } = args
  const attempt = await supabase
    .from('staff')
    .select(selectFields)
    .order('rank', { ascending: true })
    .order('name', { ascending: true })

  if (!attempt.error) {
    return { data: (attempt.data || []) as Staff[], error: null, usedFallback: false }
  }

  if (!isMissingColumnError(attempt.error)) {
    return {
      data: null,
      error: attempt.error.message || 'Error loading staff (status query).',
      usedFallback: false,
    }
  }

  const fallback = await supabase
    .from('staff')
    .select('*')
    .order('rank', { ascending: true })
    .order('name', { ascending: true })

  if (fallback.error) {
    return {
      data: null,
      error: fallback.error.message || 'Error loading staff (fallback query).',
      usedFallback: true,
    }
  }

  return { data: (fallback.data || []) as Staff[], error: null, usedFallback: true }
}

export async function fetchSpecialProgramsWithFallback(args: {
  supabase: any
  selectFields: string
}): Promise<GatewayResult<SpecialProgram[]>> {
  const { supabase, selectFields } = args
  const attempt = await supabase.from('special_programs').select(selectFields)
  if (!attempt.error) {
    return { data: (attempt.data || []) as SpecialProgram[], error: null, usedFallback: false }
  }

  if (!isMissingColumnError(attempt.error)) {
    return {
      data: null,
      error: attempt.error.message || 'Error loading special programs.',
      usedFallback: false,
    }
  }

  const fallback = await supabase.from('special_programs').select('*')
  if (fallback.error) {
    return {
      data: null,
      error: fallback.error.message || 'Error loading special programs (fallback query).',
      usedFallback: true,
    }
  }
  return { data: (fallback.data || []) as SpecialProgram[], error: null, usedFallback: true }
}

export async function fetchSptAllocationsWithFallback(args: {
  supabase: any
  selectFields: string
}): Promise<GatewayResult<SPTAllocation[]>> {
  const { supabase, selectFields } = args
  const attempt = await supabase.from('spt_allocations').select(selectFields)
  let rows: any[] | null = null
  let usedFallback = false

  if (!attempt.error) {
    rows = attempt.data || []
  } else if (isMissingColumnError(attempt.error)) {
    const fallback = await supabase.from('spt_allocations').select('*')
    if (fallback.error) {
      return {
        data: null,
        error: fallback.error.message || 'Error loading SPT allocations (fallback query).',
        usedFallback: true,
      }
    }
    rows = fallback.data || []
    usedFallback = true
  } else {
    return {
      data: null,
      error: attempt.error.message || 'Error loading SPT allocations.',
      usedFallback: false,
    }
  }

  const activeAllocations = (rows || []).filter((a) => (a as any).active !== false) as SPTAllocation[]
  return { data: activeAllocations, error: null, usedFallback }
}

export async function fetchWardsWithFallback(args: {
  supabase: any
  selectFields: string
}): Promise<GatewayResult<Array<{
  name: string
  total_beds: number
  team_assignments: Record<string, any>
  team_assignment_portions: Record<string, any>
}>>> {
  const { supabase, selectFields } = args
  const attempt = await supabase.from('wards').select(selectFields)
  let res = attempt
  let usedFallback = false

  if (attempt.error?.message?.includes('team_assignment_portions')) {
    res = await supabase.from('wards').select('id,name,total_beds,team_assignments')
    usedFallback = true
  } else if (attempt.error && isMissingColumnError(attempt.error)) {
    res = await supabase.from('wards').select('*')
    usedFallback = true
  }

  if (res.error) {
    return {
      data: null,
      error: res.error.message || 'Error loading wards.',
      usedFallback,
    }
  }

  const mapped = (res.data || []).map((ward: any) => ({
    name: ward.name,
    total_beds: ward.total_beds,
    team_assignments: ward.team_assignments || {},
    team_assignment_portions: ward.team_assignment_portions || {},
  }))

  return { data: mapped, error: null, usedFallback }
}

export async function fetchPcaPreferencesWithFallback(args: {
  supabase: any
  selectFields: string
}): Promise<GatewayResult<PCAPreference[]>> {
  const { supabase, selectFields } = args
  const attempt = await supabase.from('pca_preferences').select(selectFields)
  if (!attempt.error) {
    return { data: (attempt.data || []) as PCAPreference[], error: null, usedFallback: false }
  }

  if (!isMissingColumnError(attempt.error)) {
    return {
      data: null,
      error: attempt.error.message || 'Error loading PCA preferences.',
      usedFallback: false,
    }
  }

  const fallback = await supabase.from('pca_preferences').select('*')
  if (fallback.error) {
    return {
      data: null,
      error: fallback.error.message || 'Error loading PCA preferences (fallback query).',
      usedFallback: true,
    }
  }
  return { data: (fallback.data || []) as PCAPreference[], error: null, usedFallback: true }
}
