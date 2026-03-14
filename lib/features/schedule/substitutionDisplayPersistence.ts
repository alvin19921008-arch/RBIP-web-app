import { applySubstitutionSlotsToOverride, hasAnySubstitution, removeSubstitutionForTeamsFromOverride } from '@/lib/utils/substitutionFor'
import type { PCAAllocation } from '@/types/schedule'
import type { Staff, Team } from '@/types/staff'

type SelectionEntry = {
  floatingPCAId?: string
  slots?: number[]
}

type AutoUpdate = {
  nonFloatingPCAId: string
  nonFloatingPCAName: string
  team: Team
  slots: number[]
}

function getAllocationTeams(allocation: PCAAllocation): Team[] {
  const teams = new Set<Team>()
  const maybeAdd = (value: unknown) => {
    if (typeof value === 'string' && value.length > 0) {
      teams.add(value as Team)
    }
  }

  maybeAdd(allocation.team)
  maybeAdd(allocation.slot1)
  maybeAdd(allocation.slot2)
  maybeAdd(allocation.slot3)
  maybeAdd(allocation.slot4)

  return Array.from(teams)
}

export function applyResolvedSubstitutionSelectionsToOverrides(args: {
  baseOverrides: Record<string, any>
  resolvedSelections?: Record<string, SelectionEntry[]>
  staff: Staff[]
}): Record<string, any> {
  const resolvedSelections = args.resolvedSelections ?? {}
  if (Object.keys(resolvedSelections).length === 0) return { ...(args.baseOverrides ?? {}) }

  const teamsTouched = new Set<Team>(
    Object.keys(resolvedSelections).map((key) => {
      const dashIdx = key.indexOf('-')
      return (dashIdx >= 0 ? key.slice(0, dashIdx) : key) as Team
    })
  )

  const next = { ...(args.baseOverrides ?? {}) }

  Object.entries(next).forEach(([staffId, override]) => {
    next[staffId] = removeSubstitutionForTeamsFromOverride({
      override,
      teams: teamsTouched,
    })
  })

  Object.entries(resolvedSelections).forEach(([key, selectionArr]) => {
    const dashIdx = key.indexOf('-')
    const team = (dashIdx >= 0 ? key.slice(0, dashIdx) : key) as Team
    const nonFloatingPCAId = dashIdx >= 0 ? key.slice(dashIdx + 1) : ''
    const nonFloating = args.staff.find((s) => s.id === nonFloatingPCAId)

    ;(selectionArr || []).forEach((selection) => {
      const floatingPCAId = String(selection?.floatingPCAId ?? '')
      const slots = Array.isArray(selection?.slots) ? selection.slots : []
      if (!floatingPCAId || slots.length === 0) return

      next[floatingPCAId] = applySubstitutionSlotsToOverride({
        existingOverride: next[floatingPCAId] ?? { leaveType: null, fteRemaining: 1.0 },
        team,
        nonFloatingPCAId,
        nonFloatingPCAName: nonFloating?.name ?? '',
        slots,
      })
    })
  })

  return next
}

export function detectAutoAssignedSubstitutions(args: {
  allocations: PCAAllocation[]
  staff: Staff[]
  overrides: Record<string, any>
}): Record<string, AutoUpdate[]> {
  const autoSubstitutionUpdates: Record<string, AutoUpdate[]> = {}
  const allocationsByTeam = new Map<Team, Array<{ alloc: PCAAllocation; staff: Staff }>>()

  args.allocations.forEach((alloc) => {
    const staffMember = args.staff.find((s) => s.id === alloc.staff_id)
    if (!staffMember) return
    const teams = getAllocationTeams(alloc)
    teams.forEach((team) => {
      if (!allocationsByTeam.has(team)) allocationsByTeam.set(team, [])
      allocationsByTeam.get(team)!.push({ alloc, staff: staffMember })
    })
  })

  allocationsByTeam.forEach((allocs, team) => {
    const nonFloatingPCAs = allocs.filter(
      (item) => item.staff.rank === 'PCA' && !item.staff.floating && item.staff.status !== 'buffer'
    )

    const floatingPCAAllocs = allocs.filter(
      (item) =>
        item.staff.rank === 'PCA' &&
        item.staff.floating &&
        !item.alloc.special_program_ids?.length &&
        !hasAnySubstitution(args.overrides[item.alloc.staff_id] as any)
    )
    const claimedSlotsByFloatingId = new Map<string, Set<number>>()

    for (const nfItem of nonFloatingPCAs) {
      const nfAlloc = nfItem.alloc as any
      const nfStaff = nfItem.staff
      const nfOverride = args.overrides[nfStaff.id]

      let missingSlots: number[] = []
      if (Array.isArray(nfOverride?.availableSlots) && nfOverride.availableSlots.length > 0) {
        missingSlots = [1, 2, 3, 4].filter((slot) => !nfOverride.availableSlots.includes(slot))
      } else {
        const nfFTE = nfOverride?.fteRemaining ?? 1.0
        if (nfFTE < 1.0) {
          const assignedSlots: number[] = []
          if (nfAlloc.slot1 === team) assignedSlots.push(1)
          if (nfAlloc.slot2 === team) assignedSlots.push(2)
          if (nfAlloc.slot3 === team) assignedSlots.push(3)
          if (nfAlloc.slot4 === team) assignedSlots.push(4)
          missingSlots = [1, 2, 3, 4].filter((slot) => !assignedSlots.includes(slot))
        }
      }

      if (missingSlots.length === 0) continue

      for (const floatItem of floatingPCAAllocs) {
        const floatAlloc = floatItem.alloc as any
        const floatingId = floatItem.staff.id
        const claimedSlots = claimedSlotsByFloatingId.get(floatingId) ?? new Set<number>()
        const assignedSlots: number[] = []
        if (floatAlloc.slot1 === team) assignedSlots.push(1)
        if (floatAlloc.slot2 === team) assignedSlots.push(2)
        if (floatAlloc.slot3 === team) assignedSlots.push(3)
        if (floatAlloc.slot4 === team) assignedSlots.push(4)

        const matchingSlots = assignedSlots.filter((slot) => missingSlots.includes(slot) && !claimedSlots.has(slot))
        if (matchingSlots.length === 0) continue

        autoSubstitutionUpdates[floatingId] = autoSubstitutionUpdates[floatingId] ?? []
        autoSubstitutionUpdates[floatingId].push({
          nonFloatingPCAId: nfStaff.id,
          nonFloatingPCAName: nfStaff.name,
          team,
          slots: matchingSlots,
        })
        matchingSlots.forEach((slot) => claimedSlots.add(slot))
        claimedSlotsByFloatingId.set(floatingId, claimedSlots)
        break
      }
    }
  })

  return autoSubstitutionUpdates
}

export function applyAutoAssignedSubstitutionsToOverrides(args: {
  baseOverrides: Record<string, any>
  autoSubstitutionUpdates: Record<string, AutoUpdate[]>
  staff: Staff[]
}): Record<string, any> {
  const next = { ...(args.baseOverrides ?? {}) }

  for (const [floatingPCAId, updates] of Object.entries(args.autoSubstitutionUpdates)) {
    const staffMember = args.staff.find((s) => s.id === floatingPCAId)
    const baseFTE =
      staffMember?.status === 'buffer' && (staffMember as any).buffer_fte !== undefined
        ? (staffMember as any).buffer_fte
        : 1.0

    let existingOverride = next[floatingPCAId] ?? { leaveType: null, fteRemaining: baseFTE }
    ;(updates || []).forEach((update) => {
      existingOverride = applySubstitutionSlotsToOverride({
        existingOverride,
        team: update.team,
        nonFloatingPCAId: update.nonFloatingPCAId,
        nonFloatingPCAName: update.nonFloatingPCAName,
        slots: update.slots,
      })
    })
    next[floatingPCAId] = existingOverride
  }

  return next
}

export function buildStep2SubstitutionDisplayOverrides(args: {
  baseOverrides: Record<string, any>
  resolvedSelections?: Record<string, SelectionEntry[]>
  staff: Staff[]
  allocations: PCAAllocation[]
}): Record<string, any> {
  const withExplicitSelections = applyResolvedSubstitutionSelectionsToOverrides({
    baseOverrides: args.baseOverrides,
    resolvedSelections: args.resolvedSelections,
    staff: args.staff,
  })

  if (args.resolvedSelections && Object.keys(args.resolvedSelections).length > 0) {
    return withExplicitSelections
  }

  const autoSubstitutionUpdates = detectAutoAssignedSubstitutions({
    allocations: args.allocations,
    staff: args.staff,
    overrides: withExplicitSelections,
  })

  return applyAutoAssignedSubstitutionsToOverrides({
    baseOverrides: withExplicitSelections,
    autoSubstitutionUpdates,
    staff: args.staff,
  })
}
