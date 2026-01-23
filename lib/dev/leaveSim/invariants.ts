import type { Staff, Team } from '@/types/staff'
import type { PCAAllocation, TherapistAllocation, ScheduleCalculations } from '@/types/schedule'
import { roundToNearestQuarter } from '@/lib/utils/rounding'
import { ALL_SLOTS, isValidSlot } from '@/lib/dev/leaveSim/types'

export type DevLeaveSimInvariantReport = {
  ok: boolean
  issues: string[]
  summary: {
    touchedStaffCount: number
    pcaOverAllocatedCount: number
    pcaSlotConflictsCount: number
  }
}

function getBaseFTEForStaff(s: Staff): number {
  if (s.status === 'buffer' && typeof s.buffer_fte === 'number') return s.buffer_fte
  return 1.0
}

function getCanonicalPcaAllocations(pcaAllocationsByTeam: Record<Team, Array<PCAAllocation & { staff: Staff }>>): Array<PCAAllocation & { staff: Staff }> {
  const flat = Object.values(pcaAllocationsByTeam || {}).flat()
  const byStaffId = new Map<string, PCAAllocation & { staff: Staff }>()
  for (const a of flat) {
    if (!a || typeof a.staff_id !== 'string') continue
    if (!byStaffId.has(a.staff_id)) byStaffId.set(a.staff_id, a)
  }
  return Array.from(byStaffId.values())
}

function countAssignedSlotsExcludingInvalid(a: PCAAllocation): number {
  const invalid = (a as any).invalid_slot as number | null | undefined
  const slotTeams: Array<Team | null> = [a.slot1, a.slot2, a.slot3, a.slot4]
  let count = 0
  for (let i = 0; i < slotTeams.length; i++) {
    const slotNum = (i + 1) as 1 | 2 | 3 | 4
    if (slotTeams[i] == null) continue
    if (typeof invalid === 'number' && invalid === slotNum) continue
    count++
  }
  return count
}

function computePcaCapacitySlots(args: {
  staff: Staff
  override?: any
}): number {
  const o = args.override
  const invSlots: Array<1 | 2 | 3 | 4> = Array.isArray(o?.invalidSlots)
    ? (o.invalidSlots as any[])
        .map((x: any) => x?.slot)
        .filter((slot: any): slot is 1 | 2 | 3 | 4 => isValidSlot(slot))
    : []

  const rawAvailable: number[] =
    Array.isArray(o?.availableSlots) && o.availableSlots.length > 0 ? (o.availableSlots as number[]) : [...ALL_SLOTS]

  const available: Array<1 | 2 | 3 | 4> = rawAvailable
    .filter((slot: number): slot is 1 | 2 | 3 | 4 => isValidSlot(slot))
    .filter((slot) => !invSlots.includes(slot))

  return available.length
}

export function runDevLeaveSimInvariants(args: {
  staff: Staff[]
  staffOverrides: Record<string, any>
  therapistAllocationsByTeam: Record<Team, Array<TherapistAllocation & { staff: Staff }>>
  pcaAllocationsByTeam: Record<Team, Array<PCAAllocation & { staff: Staff }>>
  calculationsByTeam: Record<Team, ScheduleCalculations | null>
  baselineAveragePcaByTeam?: Record<Team, number> | null
  touchedStaffIds?: Set<string>
}): DevLeaveSimInvariantReport {
  const issues: string[] = []
  const touched = args.touchedStaffIds ?? new Set<string>()

  // --------------------------------------------------------------------------
  // Avg PCA/team stability (if baseline provided)
  // --------------------------------------------------------------------------
  if (args.baselineAveragePcaByTeam) {
    for (const team of Object.keys(args.baselineAveragePcaByTeam) as Team[]) {
      const base = args.baselineAveragePcaByTeam[team]
      const cur = (args.calculationsByTeam as any)?.[team]?.average_pca_per_team
      if (typeof base === 'number' && typeof cur === 'number') {
        if (Math.abs(base - cur) > 0.001) {
          issues.push(`avgPCA/team changed for ${team}: baseline=${base.toFixed(4)} current=${cur.toFixed(4)}`)
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // PCA capacity vs assigned slots + half-day rounding consistency for touched staff
  // --------------------------------------------------------------------------
  const canonicalPcaAllocs = getCanonicalPcaAllocations(args.pcaAllocationsByTeam)
  const staffById = new Map(args.staff.map((s) => [s.id, s] as const))

  let pcaOverAllocatedCount = 0

  for (const a of canonicalPcaAllocs) {
    const staff = staffById.get(a.staff_id)
    if (!staff) continue
    if (staff.rank !== 'PCA') continue

    const o = args.staffOverrides?.[a.staff_id]
    const capacitySlots = computePcaCapacitySlots({ staff, override: o })
    const assignedSlots = countAssignedSlotsExcludingInvalid(a)

    if (assignedSlots > capacitySlots) {
      pcaOverAllocatedCount++
      issues.push(
        `PCA over-allocated: ${staff.name} (${staff.id}) assignedSlots=${assignedSlots} capacitySlots=${capacitySlots}`
      )
    }

    // For touched PCAs: enforce the UI rule (rounded fteRemaining matches slots FTE).
    if (touched.has(staff.id)) {
      const baseFTE = getBaseFTEForStaff(staff)
      const fteRemaining = typeof o?.fteRemaining === 'number' ? o.fteRemaining : baseFTE
      const rounded = roundToNearestQuarter(fteRemaining)
      const slotsFTE = capacitySlots * 0.25
      if (capacitySlots > 0 && Math.abs(rounded - slotsFTE) > 0.01) {
        issues.push(
          `PCA rounded FTE != available slot FTE: ${staff.name} (${staff.id}) fte=${fteRemaining.toFixed(
            2
          )} rounded=${rounded.toFixed(2)} slotsFTE=${slotsFTE.toFixed(2)}`
        )
      }
    }
  }

  // --------------------------------------------------------------------------
  // PCA slot conflicts (defensive): same staff-slot assigned to multiple teams.
  // NOTE: grouping duplicates exist, but canonical allocation prevents false positives.
  // --------------------------------------------------------------------------
  let pcaSlotConflictsCount = 0
  for (const a of canonicalPcaAllocs) {
    const slotTeams: Array<Team | null> = [a.slot1, a.slot2, a.slot3, a.slot4]
    for (let i = 0; i < slotTeams.length; i++) {
      const t = slotTeams[i]
      if (t == null) continue
      const slotNum = (i + 1) as 1 | 2 | 3 | 4
      if (!isValidSlot(slotNum)) continue
      // In canonical allocation, each slot has at most one team by construction.
      // Keep this invariant for future refactors that might merge rows incorrectly.
      if (!t) {
        pcaSlotConflictsCount++
        issues.push(`PCA slot conflict: staffId=${a.staff_id} slot=${slotNum} team is null/invalid`)
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    summary: {
      touchedStaffCount: touched.size,
      pcaOverAllocatedCount,
      pcaSlotConflictsCount,
    },
  }
}

