/**
 * Staff filtering, grouping, and sorting utilities.
 * Used by dashboard panels (e.g. Team Configuration) for team/unassigned lists and search.
 */

import type { Staff, StaffRank, StaffStatus, Team } from '@/types/staff'
import { TEAMS } from '@/lib/utils/types'

export interface FilterStaffOptions {
  /** Single rank or multiple ranks (e.g. ['APPT', 'RPT', 'PCA']) */
  rank?: StaffRank | StaffRank[]
  /** Team to filter by; null = unassigned only */
  team?: Team | null
  /** Only include active staff (status === 'active' or legacy active === true) */
  activeOnly?: boolean
  /** For PCA: true = floating only, false = non-floating only, undefined = all */
  floating?: boolean
  /** Case-insensitive substring match on name */
  searchQuery?: string
}

/**
 * Normalizes free-text search so all panels use the same matching baseline.
 */
export function normalizeStaffSearchQuery(query: string | undefined | null): string {
  return (query ?? '').trim().toLowerCase()
}

/**
 * Case-insensitive name matching; empty query matches everything.
 */
export function matchesStaffName(staff: Pick<Staff, 'name'>, query: string | undefined | null): boolean {
  const normalized = normalizeStaffSearchQuery(query)
  if (!normalized) return true
  return (staff.name ?? '').toLowerCase().includes(normalized)
}

/**
 * Legacy-safe active check.
 * - New rows: status field
 * - Legacy rows: active boolean
 */
export function isStaffActive(staff: Pick<Staff, 'status' | 'active'>): boolean {
  return staff.status === 'active' || staff.active === true
}

/**
 * Matches explicit status with dashboard semantics (missing status defaults to active).
 */
export function matchesStaffStatus(
  staff: Pick<Staff, 'status' | 'active'>,
  targetStatus: StaffStatus | null
): boolean {
  if (targetStatus === null) return true
  const status = staff.status ?? 'active'
  return status === targetStatus
}

/**
 * Filters a staff list by rank, team, active status, floating, and/or name search.
 */
export function filterStaff(staff: Staff[], options: FilterStaffOptions): Staff[] {
  let result = staff

  if (options.rank !== undefined) {
    const ranks = Array.isArray(options.rank) ? options.rank : [options.rank]
    result = result.filter((s) => ranks.includes(s.rank))
  }

  if (options.team !== undefined) {
    if (options.team === null) {
      result = result.filter((s) => s.team === null)
    } else {
      result = result.filter((s) => s.team === options.team)
    }
  }

  if (options.activeOnly) {
    result = result.filter((s) => isStaffActive(s))
  }

  if (options.floating !== undefined) {
    result = result.filter((s) => s.rank !== 'PCA' || s.floating === options.floating)
  }

  if (options.searchQuery?.trim()) {
    result = result.filter((s) => matchesStaffName(s, options.searchQuery))
  }

  return result
}

/**
 * Groups staff by team. Returns a record with all teams as keys; teams with no staff get [].
 */
export function groupStaffByTeam(staff: Staff[]): Record<Team, Staff[]> {
  const record = TEAMS.reduce((acc, team) => {
    acc[team] = []
    return acc
  }, {} as Record<Team, Staff[]>)
  for (const s of staff) {
    if (s.team !== null) {
      record[s.team].push(s)
    }
  }
  return record
}

/**
 * Sorts staff by name (locale-aware, case-insensitive).
 */
export function sortStaffByName(staff: Staff[]): Staff[] {
  return [...staff].sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' })
  )
}
