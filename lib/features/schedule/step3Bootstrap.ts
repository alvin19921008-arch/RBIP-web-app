import type { PCAData } from '@/lib/algorithms/pcaAllocation'
import { roundDownToQuarter, roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { createEmptyTeamRecord } from '@/lib/utils/types'
import {
  computeSpecialProgramAssignedFteByTeam,
} from '@/lib/utils/scheduleReservationRuntime'
import type { SpecialProgram } from '@/types/allocation'
import type { PCAAllocation } from '@/types/schedule'
import type { Staff, Team, Weekday } from '@/types/staff'

const TEAM_ORDER: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

export type Step3BootstrapSummary = {
  teamTargets: Record<Team, number>
  existingAssignedByTeam: Record<Team, number>
  pendingByTeam: Record<Team, number>
  reservedSpecialProgramPcaFte: number
  availableFloatingSlots: number
  neededFloatingSlots: number
  slackFloatingSlots: number
}

export function computeStep3BootstrapState(args: {
  pcaAllocations: Record<Team, Array<PCAAllocation & { staff?: Staff }>>
  staff: Staff[]
  specialPrograms: SpecialProgram[]
  weekday: Weekday
  staffOverrides?: Record<string, unknown>
}): {
  existingTeamPCAAssigned: Record<Team, number>
  existingAllocations: PCAAllocation[]
} {
  const teamPCAAssigned = createEmptyTeamRecord<number>(0)
  const uniqueAllocations = Array.from(new Set(Object.values(args.pcaAllocations).flat()))
  const specialProgramAssignedByTeam = computeSpecialProgramAssignedFteByTeam({
    allocations: uniqueAllocations,
    specialPrograms: args.specialPrograms,
    weekday: args.weekday,
    staffOverrides: args.staffOverrides,
  })
  const existingAllocations: PCAAllocation[] = []
  const addedStaffIds = new Set<string>()

  Object.entries(args.pcaAllocations).forEach(([team, allocs]) => {
    ;(allocs || []).forEach((alloc: any) => {
      let slotsInTeam = 0
      if (alloc.slot1 === team) slotsInTeam++
      if (alloc.slot2 === team) slotsInTeam++
      if (alloc.slot3 === team) slotsInTeam++
      if (alloc.slot4 === team) slotsInTeam++

      const invalidSlot = (alloc as any).invalid_slot as 1 | 2 | 3 | 4 | null | undefined
      if (invalidSlot === 1 || invalidSlot === 2 || invalidSlot === 3 || invalidSlot === 4) {
        const slotField = `slot${invalidSlot}` as keyof PCAAllocation
        if ((alloc as any)[slotField] === team) {
          slotsInTeam = Math.max(0, slotsInTeam - 1)
        }
      }

      teamPCAAssigned[team as Team] += slotsInTeam * 0.25

      const staffMember = args.staff.find((s) => s.id === alloc.staff_id)
      if (!staffMember) return
      if (addedStaffIds.has(alloc.staff_id)) return

      const hasSlots = alloc.slot1 != null || alloc.slot2 != null || alloc.slot3 != null || alloc.slot4 != null
      if (!staffMember.floating || hasSlots) {
        existingAllocations.push(alloc)
        addedStaffIds.add(alloc.staff_id)
      }
    })
  })

  for (const team of TEAM_ORDER) {
    teamPCAAssigned[team] = Math.max(
      0,
      (teamPCAAssigned[team] || 0) - (specialProgramAssignedByTeam[team] || 0)
    )
  }

  return {
    existingTeamPCAAssigned: teamPCAAssigned,
    existingAllocations,
  }
}

export function computeStep3BootstrapSummary(args: {
  teams: Team[]
  teamTargets: Record<Team, number>
  existingTeamPCAAssigned: Record<Team, number>
  floatingPCAs: PCAData[]
  existingAllocations: PCAAllocation[]
  staffOverrides?: Record<string, unknown>
  reservedSpecialProgramPcaFte?: number
}): Step3BootstrapSummary {
  const pendingByTeam = createEmptyTeamRecord<number>(0)
  const teamTargets = createEmptyTeamRecord<number>(0)
  const existingAssignedByTeam = createEmptyTeamRecord<number>(0)

  for (const team of args.teams) {
    const target = args.teamTargets[team] ?? 0
    const assigned = args.existingTeamPCAAssigned[team] ?? 0
    teamTargets[team] = target
    existingAssignedByTeam[team] = assigned
    pendingByTeam[team] = Math.max(0, target - assigned)
  }

  let neededFloatingSlots = 0
  for (const team of args.teams) {
    neededFloatingSlots += Math.max(0, Math.round(roundToNearestQuarterWithMidpoint(pendingByTeam[team]) / 0.25))
  }

  const usedSlotsByPcaId = new Map<string, Set<1 | 2 | 3 | 4>>()
  const markUsed = (id: string, slot: 1 | 2 | 3 | 4) => {
    const used = usedSlotsByPcaId.get(id) ?? new Set<1 | 2 | 3 | 4>()
    used.add(slot)
    usedSlotsByPcaId.set(id, used)
  }

  for (const alloc of args.existingAllocations) {
    if (alloc.slot1) markUsed(alloc.staff_id, 1)
    if (alloc.slot2) markUsed(alloc.staff_id, 2)
    if (alloc.slot3) markUsed(alloc.staff_id, 3)
    if (alloc.slot4) markUsed(alloc.staff_id, 4)
    const invalidSlot = (alloc as any)?.invalid_slot as 1 | 2 | 3 | 4 | null | undefined
    if (invalidSlot === 1 || invalidSlot === 2 || invalidSlot === 3 || invalidSlot === 4) {
      markUsed(alloc.staff_id, invalidSlot)
    }
  }

  for (const pca of args.floatingPCAs) {
    const override = (args.staffOverrides as Record<string, any> | undefined)?.[pca.id]
    const manual = override?.bufferManualSlotOverrides ?? override?.slotOverrides
    if (!manual) continue
    if (manual.slot1) markUsed(pca.id, 1)
    if (manual.slot2) markUsed(pca.id, 2)
    if (manual.slot3) markUsed(pca.id, 3)
    if (manual.slot4) markUsed(pca.id, 4)
  }

  let availableFloatingSlots = 0
  for (const pca of args.floatingPCAs) {
    const fteSlots = Math.max(0, Math.round(roundDownToQuarter(pca.fte_pca ?? 0) / 0.25))
    let candidateSlots: number[] =
      Array.isArray(pca.availableSlots) && pca.availableSlots.length > 0 ? pca.availableSlots : [1, 2, 3, 4]
    const invalidSlot = (pca as any)?.invalidSlot as number | null | undefined
    if (invalidSlot === 1 || invalidSlot === 2 || invalidSlot === 3 || invalidSlot === 4) {
      candidateSlots = candidateSlots.filter((slot) => slot !== invalidSlot)
    }
    const used = usedSlotsByPcaId.get(pca.id)
    const remainingSlotCapacity = used ? candidateSlots.filter((slot) => !used.has(slot as 1 | 2 | 3 | 4)).length : candidateSlots.length
    availableFloatingSlots += Math.min(fteSlots, remainingSlotCapacity)
  }

  return {
    teamTargets,
    existingAssignedByTeam,
    pendingByTeam,
    reservedSpecialProgramPcaFte: args.reservedSpecialProgramPcaFte ?? 0,
    availableFloatingSlots,
    neededFloatingSlots,
    slackFloatingSlots: availableFloatingSlots - neededFloatingSlots,
  }
}

/** Returns structured lines for toast: main (short), details (second line). */
export function describeStep3BootstrapDelta(
  previous: Step3BootstrapSummary | null | undefined,
  next: Step3BootstrapSummary | null | undefined
): { main: string; details: string } | null {
  if (!previous || !next) return null

  const teamDeltas = TEAM_ORDER.flatMap((team) => {
    const delta =
      roundToNearestQuarterWithMidpoint((next.teamTargets[team] ?? 0) - (previous.teamTargets[team] ?? 0))
    if (Math.abs(delta) < 0.25) return []
    const slotCount = Math.round(Math.abs(delta) / 0.25)
    const sign = delta > 0 ? '+' : '-'
    return [`${team} ${sign}${slotCount} PCA slot${slotCount === 1 ? '' : 's'}`]
  })

  if (teamDeltas.length === 0) {
    return null
  }

  return {
    main: 'Step 3 target updated.',
    details: teamDeltas.join(', '),
  }
}

function trimTrailingZeros(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}
