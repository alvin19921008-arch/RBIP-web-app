import type { Team } from '@/types/staff'
import type { Staff } from '@/types/staff'
import type { TherapistAllocation, PCAAllocation } from '@/types/schedule'

export function buildStaffByIdMap(staff: Staff[]): Map<string, Staff> {
  const staffById = new Map<string, Staff>()
  ;(staff || []).forEach((s) => staffById.set(s.id, s))
  return staffById
}

export function groupTherapistAllocationsByTeam(args: {
  teams: Team[]
  allocations: any[]
  staffById: Map<string, Staff>
  sort?: (a: TherapistAllocation & { staff: Staff }, b: TherapistAllocation & { staff: Staff }) => number
}): Record<Team, (TherapistAllocation & { staff: Staff })[]> {
  const { teams, allocations, staffById, sort } = args
  const byTeam = {} as Record<Team, (TherapistAllocation & { staff: Staff })[]>
  for (const t of teams) byTeam[t] = []

  ;(allocations || []).forEach((alloc: any) => {
    const staffMember = staffById.get(alloc.staff_id)
    if (staffMember && alloc.team) {
      byTeam[alloc.team as Team].push({ ...alloc, staff: staffMember })
    }
  })

  if (sort) {
    teams.forEach((t) => {
      byTeam[t].sort(sort)
    })
  }

  return byTeam
}

export function groupPcaAllocationsByTeamWithSlotTeams(args: {
  teams: Team[]
  allocations: any[]
  staffById: Map<string, Staff>
  sort?: (a: PCAAllocation & { staff: Staff }, b: PCAAllocation & { staff: Staff }) => number
}): Record<Team, (PCAAllocation & { staff: Staff })[]> {
  const { teams, allocations, staffById, sort } = args
  const byTeam = {} as Record<Team, (PCAAllocation & { staff: Staff })[]>
  for (const t of teams) byTeam[t] = []

  ;(allocations || []).forEach((alloc: any) => {
    const staffMember = staffById.get(alloc.staff_id)
    if (!staffMember) return

    const allocationWithStaff = { ...alloc, staff: staffMember }

    if (alloc.team) {
      byTeam[alloc.team as Team].push(allocationWithStaff)
    }

    const slotTeams = new Set<Team>()
    if (alloc.slot1 && alloc.slot1 !== alloc.team) slotTeams.add(alloc.slot1 as Team)
    if (alloc.slot2 && alloc.slot2 !== alloc.team) slotTeams.add(alloc.slot2 as Team)
    if (alloc.slot3 && alloc.slot3 !== alloc.team) slotTeams.add(alloc.slot3 as Team)
    if (alloc.slot4 && alloc.slot4 !== alloc.team) slotTeams.add(alloc.slot4 as Team)

    slotTeams.forEach((slotTeam) => {
      byTeam[slotTeam].push(allocationWithStaff)
    })
  })

  if (sort) {
    teams.forEach((t) => {
      byTeam[t].sort(sort)
    })
  }

  return byTeam
}

export function sortTherapistApptFirstThenName(
  a: TherapistAllocation & { staff: Staff },
  b: TherapistAllocation & { staff: Staff }
): number {
  const aIsAPPT = a.staff?.rank === 'APPT'
  const bIsAPPT = b.staff?.rank === 'APPT'
  if (aIsAPPT && !bIsAPPT) return -1
  if (!aIsAPPT && bIsAPPT) return 1
  const aName = a.staff?.name ?? ''
  const bName = b.staff?.name ?? ''
  return aName.localeCompare(bName)
}

export function sortPcaNonFloatingFirstThenName(
  a: PCAAllocation & { staff: Staff },
  b: PCAAllocation & { staff: Staff }
): number {
  const aIsNonFloating = !(a.staff?.floating ?? true)
  const bIsNonFloating = !(b.staff?.floating ?? true)
  if (aIsNonFloating && !bIsNonFloating) return -1
  if (!aIsNonFloating && bIsNonFloating) return 1
  const aName = a.staff?.name ?? ''
  const bName = b.staff?.name ?? ''
  return aName.localeCompare(bName)
}

export function sortPcaNonFloatingFirstOnly(
  a: PCAAllocation & { staff: Staff },
  b: PCAAllocation & { staff: Staff }
): number {
  const aIsNonFloating = !(a.staff?.floating ?? true)
  const bIsNonFloating = !(b.staff?.floating ?? true)
  if (aIsNonFloating && !bIsNonFloating) return -1
  if (!aIsNonFloating && bIsNonFloating) return 1
  return 0
}

