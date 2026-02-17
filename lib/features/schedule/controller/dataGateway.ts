import type { Staff } from '@/types/staff'
import type { SpecialProgram, SPTAllocation, PCAPreference } from '@/types/allocation'

type GatewayResult<T> = {
  data: T | null
  error: string | null
}

export function splitStaffRowsByStatus(rows: Staff[]) {
  const activeRows = rows.filter((s) => s.status === 'active' || s.status == null)
  const inactiveRows = rows.filter((s) => s.status === 'inactive')
  const bufferRows = rows.filter((s) => s.status === 'buffer')

  return { activeRows, inactiveRows, bufferRows }
}

export async function fetchStaffRowsWithFallback(args: {
  supabase: any
  selectFields: string
}): Promise<GatewayResult<Staff[]>> {
  const { supabase, selectFields } = args
  const result = await supabase
    .from('staff')
    .select(selectFields)
    .order('rank', { ascending: true })
    .order('name', { ascending: true })

  if (!result.error) {
    return { data: (result.data || []) as Staff[], error: null }
  }

  return {
    data: null,
    error: result.error.message || 'Error loading staff.',
  }
}

export async function fetchSpecialProgramsWithFallback(args: {
  supabase: any
  selectFields: string
}): Promise<GatewayResult<SpecialProgram[]>> {
  const { supabase, selectFields } = args
  const result = await supabase.from('special_programs').select(selectFields)
  if (!result.error) {
    return { data: (result.data || []) as SpecialProgram[], error: null }
  }
  return {
    data: null,
    error: result.error.message || 'Error loading special programs.',
  }
}

export async function fetchSptAllocationsWithFallback(args: {
  supabase: any
  selectFields: string
}): Promise<GatewayResult<SPTAllocation[]>> {
  const { supabase, selectFields } = args
  const result = await supabase.from('spt_allocations').select(selectFields)
  if (result.error) {
    return {
      data: null,
      error: result.error.message || 'Error loading SPT allocations.',
    }
  }

  const rows = (result.data || []) as any[]
  const activeAllocations = rows.filter((a) => (a as any).active !== false) as SPTAllocation[]
  return { data: activeAllocations, error: null }
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
  const result = await supabase.from('wards').select(selectFields)
  if (result.error) {
    return {
      data: null,
      error: result.error.message || 'Error loading wards.',
    }
  }

  const mapped = (result.data || []).map((ward: any) => ({
    name: ward.name,
    total_beds: ward.total_beds,
    team_assignments: ward.team_assignments || {},
    team_assignment_portions: ward.team_assignment_portions || {},
  }))

  return { data: mapped, error: null }
}

export async function fetchPcaPreferencesWithFallback(args: {
  supabase: any
  selectFields: string
}): Promise<GatewayResult<PCAPreference[]>> {
  const { supabase, selectFields } = args
  const result = await supabase.from('pca_preferences').select(selectFields)
  if (!result.error) {
    return { data: (result.data || []) as PCAPreference[], error: null }
  }
  return {
    data: null,
    error: result.error.message || 'Error loading PCA preferences.',
  }
}
