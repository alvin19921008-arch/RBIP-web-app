import { TEAMS } from '@/lib/utils/types'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { type Team, type Staff } from '@/types/staff'
import { type PCAAllocation } from '@/types/schedule'
import {
  getSubstitutionSlotsForTeam,
  hasAnySubstitution,
} from '@/lib/utils/substitutionFor'

type OverridesByStaffId = Record<string, any>

type AveragePcaByTeam = Record<Team, number>

function createEmptyByTeam<T>(): Record<Team, T[]> {
  return TEAMS.reduce((acc, team) => {
    acc[team] = []
    return acc
  }, {} as Record<Team, T[]>)
}

function shouldPreserveFloatingAvailableSlotsForStep2Reset(override: any): boolean {
  if (!override || typeof override !== 'object') return false

  // If the user (or dev tools) set leave/partial-availability signals, preserve availableSlots:
  // - We want Step 2 to respect "real-world" availability constraints (half-day leave, medical follow-up, etc.).
  // - Only clear availableSlots when it was algorithm-derived noise from previous runs.
  const leaveType = (override as any).leaveType
  const hasLeaveType = leaveType !== null && leaveType !== undefined && String(leaveType).length > 0

  const fteRemaining = typeof (override as any).fteRemaining === 'number' ? (override as any).fteRemaining : undefined
  const fteSubtraction =
    typeof (override as any).fteSubtraction === 'number' ? (override as any).fteSubtraction : undefined
  const hasLeaveFteSignal =
    (typeof fteSubtraction === 'number' && Math.abs(fteSubtraction) > 1e-6) ||
    (typeof fteRemaining === 'number' && fteRemaining < 1 - 1e-6)

  const invalidSlots = (override as any).invalidSlots
  const hasInvalidSlots = Array.isArray(invalidSlots) && invalidSlots.length > 0

  const hasLegacyInvalidSlotSignal = (override as any).invalidSlot !== null && (override as any).invalidSlot !== undefined

  return hasLeaveType || hasLeaveFteSignal || hasInvalidSlots || hasLegacyInvalidSlotSignal
}

export function resetStep2OverridesForAlgoEntry(args: {
  staffOverrides: OverridesByStaffId
  /** Include buffer staff here so we can preserve their availability. */
  allStaff: Staff[]
}): OverridesByStaffId {
  const cleaned = { ...(args.staffOverrides ?? {}) }

  // Clear availableSlots for floating PCAs ONLY when it isn't leave-driven.
  // This app is used rolling-forward; users may copy yesterday's leave matrix into today.
  // We must preserve leave-derived partial availability (e.g. half-day leave slots).
  for (const s of args.allStaff) {
    if (s.rank !== 'PCA' || !s.floating) continue
    const o = cleaned[s.id]
    if (!o) continue
    // Preserve buffer PCA availability (it’s used later in Step 3)
    if (s.status === 'buffer') continue
    if (shouldPreserveFloatingAvailableSlotsForStep2Reset(o)) continue
    const { availableSlots, ...rest } = o
    cleaned[s.id] = rest
  }

  // Remove empty objects to keep overrides compact.
  Object.keys(cleaned).forEach((id) => {
    const o = cleaned[id]
    if (!o || typeof o !== 'object') {
      delete cleaned[id]
      return
    }
    if (Object.keys(o).length === 0) delete cleaned[id]
  })

  return cleaned
}

export function computeStep3ResetForReentry(args: {
  pcaAllocations: Record<Team, Array<PCAAllocation & { staff: Staff }>>
  staff: Staff[]
  bufferStaff: Staff[]
  staffOverrides: OverridesByStaffId
  averagePcaByTeam: AveragePcaByTeam
  /**
   * Optional stable prefix for generated manual buffer allocation IDs (e.g. YYYY-MM-DD).
   * Purely for display/debug; does not affect saved DB data.
   */
  allocationIdPrefix?: string
  /** Optional schedule id to attach to generated manual allocations (display/debug only). */
  scheduleId?: string
}): {
  cleanedPcaAllocations: Record<Team, Array<PCAAllocation & { staff: Staff }>>
  cleanedStaffOverrides: OverridesByStaffId
  pendingPCAFTEPerTeam: Record<Team, number>
} {
  const allStaff = [...(args.staff ?? []), ...(args.bufferStaff ?? [])]
  const staffById = new Map<string, Staff>()
  allStaff.forEach((s) => staffById.set(s.id, s))

  const bufferFloatingIds = new Set(
    allStaff.filter((s) => s.rank === 'PCA' && s.floating && s.status === 'buffer').map((s) => s.id)
  )

  // 1) Clean allocations: keep non-floating + special-program floating + substitutions + buffer manual floating
  const cleanedPcaAllocations = createEmptyByTeam<PCAAllocation & { staff: Staff }>()
  TEAMS.forEach((team) => {
    cleanedPcaAllocations[team] = (args.pcaAllocations?.[team] ?? []).filter((alloc) => {
      const staffMember = staffById.get(alloc.staff_id)
      if (!staffMember) return false
      if (!staffMember.floating) return true

      // Preserve buffer floating PCA (manual assignments before/within Step 3.0/3.1)
      if (bufferFloatingIds.has(staffMember.id)) return true

      // Preserve Step 2 special program allocations
      if (Array.isArray(alloc.special_program_ids) && alloc.special_program_ids.length > 0) return true

      // Preserve Step 2.1 substitution allocations
      const substitutionSlots = getSubstitutionSlotsForTeam(args.staffOverrides?.[alloc.staff_id], team as Team)
      if (substitutionSlots.length > 0) return true

      return false
    })
  })

  // 1b) Ensure manual buffer allocations exist (even if allocation objects were cleared elsewhere)
  // by rebuilding from bufferManualSlotOverrides / slotOverrides.
  for (const staffId of bufferFloatingIds) {
    const o: any = args.staffOverrides?.[staffId]
    const manual = o?.bufferManualSlotOverrides ?? o?.slotOverrides
    if (!manual) continue

    const staffMember = staffById.get(staffId)
    if (!staffMember) continue

    const slot1 = manual.slot1 ?? null
    const slot2 = manual.slot2 ?? null
    const slot3 = manual.slot3 ?? null
    const slot4 = manual.slot4 ?? null
    const teamsWithSlots = new Set<Team>()
    if (slot1) teamsWithSlots.add(slot1)
    if (slot2) teamsWithSlots.add(slot2)
    if (slot3) teamsWithSlots.add(slot3)
    if (slot4) teamsWithSlots.add(slot4)
    if (teamsWithSlots.size === 0) continue

    const bufferFTEraw = (staffMember as any).buffer_fte
    const bufferFTE =
      typeof bufferFTEraw === 'number' ? bufferFTEraw : bufferFTEraw != null ? parseFloat(String(bufferFTEraw)) : NaN
    const capacityFTE = typeof o?.fteRemaining === 'number' ? o.fteRemaining : Number.isFinite(bufferFTE) ? bufferFTE : 1.0
    const slotCount = [slot1, slot2, slot3, slot4].filter(Boolean).length

    const idPrefix = args.allocationIdPrefix ? `${args.allocationIdPrefix}:` : ''
    const baseAlloc: any = {
      id: `manual-buffer:${idPrefix}${staffId}`,
      schedule_id: args.scheduleId ?? '',
      staff_id: staffId,
      team: null,
      fte_pca: capacityFTE,
      fte_remaining: capacityFTE,
      slot_assigned: slotCount * 0.25,
      slot_whole: null,
      slot1,
      slot2,
      slot3,
      slot4,
      leave_type: null,
      special_program_ids: null,
      invalid_slot: undefined,
      fte_subtraction: 0,
      staff: staffMember,
    }

    for (const team of teamsWithSlots) {
      const existing = cleanedPcaAllocations[team].some((a) => a.staff_id === staffId)
      if (existing) continue
      cleanedPcaAllocations[team] = [...cleanedPcaAllocations[team], { ...baseAlloc, team }]
    }
  }

  // 2) Clean overrides: clear slotOverrides for floating PCAs except buffer manual + preserve substitutionFor/etc
  const cleanedStaffOverrides: OverridesByStaffId = { ...(args.staffOverrides ?? {}) }

  const floatingPcaIds = new Set(allStaff.filter((s) => s.rank === 'PCA' && s.floating).map((s) => s.id))
  floatingPcaIds.forEach((pcaId) => {
    const cur = cleanedStaffOverrides[pcaId]
    if (!cur || typeof cur !== 'object') return

    const staffMember = staffById.get(pcaId)
    if (staffMember && bufferFloatingIds.has(pcaId)) {
      const manual = (cur as any).bufferManualSlotOverrides ?? (cur as any).slotOverrides
      if (manual) {
        cleanedStaffOverrides[pcaId] = {
          ...(cur as any),
          bufferManualSlotOverrides: manual,
          slotOverrides: manual,
        }
      }
      return
    }

    const { slotOverrides, ...rest } = cur
    const hasSubstitutionFor = hasAnySubstitution(rest)
    const hasOtherKeys = Object.keys(rest).length > 0
    if (hasSubstitutionFor || hasOtherKeys) {
      cleanedStaffOverrides[pcaId] = rest
    } else {
      delete cleanedStaffOverrides[pcaId]
    }
  })

  // 3) Recompute pending from cleaned allocations:
  // pending = avg - nonFloating - preservedFloating - bufferFloating, then round to quarter.
  const nonFloatingAssigned: Record<Team, number> = createEmptyByTeam<number>() as any
  const preservedFloatingAssigned: Record<Team, number> = createEmptyByTeam<number>() as any
  const bufferFloatingAssigned: Record<Team, number> = createEmptyByTeam<number>() as any
  TEAMS.forEach((t) => {
    nonFloatingAssigned[t] = 0
    preservedFloatingAssigned[t] = 0
    bufferFloatingAssigned[t] = 0
  })

  Object.entries(cleanedPcaAllocations).forEach(([team, allocs]) => {
    allocs.forEach((alloc) => {
      const staffMember = staffById.get(alloc.staff_id)
      if (!staffMember) return

      const hasSpecial = Array.isArray(alloc.special_program_ids) && alloc.special_program_ids.length > 0
      const substitutionSlots = getSubstitutionSlotsForTeam(args.staffOverrides?.[alloc.staff_id], team as Team)
      const isSubForThisTeam = substitutionSlots.length > 0

      let slotsInTeam = 0
      if (hasSpecial) {
        // Special-program slots should not reduce pending (legacy).
        // If this staff also has substitution slots, count ONLY those substitution slots.
        const slotFieldMatches = (slot: number) => {
          const slotField = `slot${slot}` as keyof PCAAllocation
          return (alloc as any)[slotField] === team
        }
        slotsInTeam = (substitutionSlots || []).filter((slot) => slotFieldMatches(slot)).length
      } else {
        if (alloc.slot1 === team) slotsInTeam++
        if (alloc.slot2 === team) slotsInTeam++
        if (alloc.slot3 === team) slotsInTeam++
        if (alloc.slot4 === team) slotsInTeam++

        const invalidSlot = (alloc as any).invalid_slot as number | undefined
        if (invalidSlot) {
          const slotField = `slot${invalidSlot}` as keyof PCAAllocation
          if ((alloc as any)[slotField] === team) slotsInTeam = Math.max(0, slotsInTeam - 1)
        }
      }

      const fte = slotsInTeam * 0.25
      if (!staffMember.floating) {
        nonFloatingAssigned[team as Team] += fte
        return
      }

      if (bufferFloatingIds.has(staffMember.id)) {
        bufferFloatingAssigned[team as Team] += fte
        return
      }

      // Legacy behavior: special-program slots should NOT reduce Step 3 pending needs.
      // Only count substitution slots as "already assigned" against pending.
      if (isSubForThisTeam) {
        preservedFloatingAssigned[team as Team] += fte
      }
    })
  })

  const pendingPCAFTEPerTeam = createEmptyByTeam<number>() as any as Record<Team, number>
  TEAMS.forEach((team) => {
    const avg = args.averagePcaByTeam?.[team] ?? 0
    const rawPending = Math.max(
      0,
      avg - (nonFloatingAssigned[team] || 0) - (preservedFloatingAssigned[team] || 0) - (bufferFloatingAssigned[team] || 0)
    )
    pendingPCAFTEPerTeam[team] = roundToNearestQuarterWithMidpoint(rawPending)
  })

  return { cleanedPcaAllocations, cleanedStaffOverrides, pendingPCAFTEPerTeam }
}

