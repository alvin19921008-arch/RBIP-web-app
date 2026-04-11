import { buildDisplayViewForWeekday } from '@/lib/utils/scheduleRuntimeProjection'
import { isAllocationSlotFromSpecialProgram } from '@/lib/utils/scheduleReservationRuntime'
import { buildStaffRuntimeById } from '@/lib/utils/staffRuntimeProjection'
import { getMainTeam } from '@/lib/utils/teamMerge'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { createEmptyTeamRecord, createEmptyTeamRecordFactory } from '@/lib/utils/types'
import { deriveTeamStep3FloatingFulfillmentSemantics } from '@/lib/features/schedule/step3FloatingFulfillmentSemantics'
import type { SpecialProgram } from '@/types/allocation'
import type { PCAAllocation, ScheduleCalculations } from '@/types/schedule'
import type { Staff, Team } from '@/types/staff'
import { getWeekday } from '@/lib/features/schedule/date'

export type ExtraCoverageByStaffId = Record<string, Partial<Record<1 | 2 | 3 | 4, true>>>

export function deriveExtraCoverageByStaffId(args: {
  selectedDate: Date
  pcaAllocationsByTeam: Record<Team, Array<PCAAllocation & { staff?: Staff }>>
  staff: Staff[]
  specialPrograms: SpecialProgram[]
  staffOverrides: Record<string, any>
  visibleTeams: Team[]
  teamContributorsByMain: Partial<Record<Team, Team[]>>
  calculations: Record<Team, ScheduleCalculations | null>
  mergedInto: Partial<Record<Team, Team>>
}): ExtraCoverageByStaffId {
  const canonical = (value: Team | null | undefined): Team | null => {
    if (!value) return null
    return getMainTeam(value, args.mergedInto)
  }

  const weekday = getWeekday(args.selectedDate)
  const displayView = buildDisplayViewForWeekday({
    weekday,
    specialPrograms: args.specialPrograms as any,
    staffOverrides: args.staffOverrides as any,
  })

  const staffById = new Map(args.staff.map((staffMember) => [staffMember.id, staffMember]))
  const runtimeById = buildStaffRuntimeById({
    staff: args.staff,
    staffOverrides: args.staffOverrides as any,
  })
  const uniqueAllocations = new Map<string, PCAAllocation & { staff?: Staff }>()
  ;(Object.keys(args.pcaAllocationsByTeam) as Team[]).forEach((team) => {
    ;(args.pcaAllocationsByTeam[team] || []).forEach((allocation) => {
      if (!uniqueAllocations.has(allocation.staff_id)) {
        uniqueAllocations.set(allocation.staff_id, allocation)
      }
    })
  })

  const requiredByMain = createEmptyTeamRecord<number>(0)
  args.visibleTeams.forEach((mainTeam) => {
    const contributors = args.teamContributorsByMain[mainTeam] || [mainTeam]
    requiredByMain[mainTeam] = contributors.reduce(
      (sum, team) => sum + (args.calculations[team]?.average_pca_per_team || 0),
      0
    )
  })

  const normalizedAllocationsByMain = createEmptyTeamRecordFactory<Array<PCAAllocation & { staff?: Staff }>>(
    () => []
  )

  for (const allocation of uniqueAllocations.values()) {
    const runtime = runtimeById[allocation.staff_id]
    const invalidSlot = (allocation as any)?.invalid_slot as 1 | 2 | 3 | 4 | null | undefined
    const slotAssigned = typeof (allocation as any)?.slot_assigned === 'number' ? (allocation as any).slot_assigned : null
    const maxActiveSlots =
      slotAssigned != null
        ? Math.max(0, Math.min(4, Math.round(slotAssigned / 0.25)))
        : null
    const staffMember = staffById.get(allocation.staff_id) || allocation.staff
    const isFloatingPca = staffMember?.rank === 'PCA' && !!staffMember?.floating
    const staffName = staffMember?.name || allocation.staff_id
    const runtimeAvailableSlots = Array.isArray(runtime?.availableSlots)
      ? new Set(runtime.availableSlots.filter((slot): slot is 1 | 2 | 3 | 4 => slot === 1 || slot === 2 || slot === 3 || slot === 4))
      : null
    let activeSlotsSeen = 0

    for (const slot of [1, 2, 3, 4] as const) {
      if (maxActiveSlots !== null && activeSlotsSeen >= maxActiveSlots) continue
      if (invalidSlot === slot) continue
      if (runtimeAvailableSlots && !runtimeAvailableSlots.has(slot)) continue
      const rawTeam =
        slot === 1
          ? allocation.slot1
          : slot === 2
            ? allocation.slot2
            : slot === 3
              ? allocation.slot3
              : allocation.slot4
      const mainTeam = canonical(rawTeam as Team | null)
      if (!mainTeam) continue

      const specialProgramsById = displayView.getProgramsByAllocationTeam(allocation.team as Team | null | undefined)
      const isSpecial = isAllocationSlotFromSpecialProgram({
        allocation,
        slot,
        team: rawTeam as Team,
        specialProgramsById,
      })
      if (isSpecial) continue

      activeSlotsSeen += 1
      let normalizedAllocation = normalizedAllocationsByMain[mainTeam].find(
        (candidate) => candidate.staff_id === allocation.staff_id
      )
      if (!normalizedAllocation) {
        normalizedAllocation = {
          ...allocation,
          slot1: null,
          slot2: null,
          slot3: null,
          slot4: null,
          staff: staffMember,
        }
        normalizedAllocationsByMain[mainTeam].push(normalizedAllocation)
      }
      if (slot === 1) normalizedAllocation.slot1 = mainTeam
      else if (slot === 2) normalizedAllocation.slot2 = mainTeam
      else if (slot === 3) normalizedAllocation.slot3 = mainTeam
      else normalizedAllocation.slot4 = mainTeam
      void isFloatingPca
      void staffName
    }
  }

  const nextExtraByStaff: ExtraCoverageByStaffId = {}
  args.visibleTeams.forEach((mainTeam) => {
    const semantics = deriveTeamStep3FloatingFulfillmentSemantics({
      team: mainTeam,
      allocations: normalizedAllocationsByMain[mainTeam] || [],
      allPcaStaff: args.staff,
      staffOverrides: args.staffOverrides,
      specialPrograms: args.specialPrograms,
      weekday,
      averagePcaPerTeam: requiredByMain[mainTeam] || 0,
    })
    const extraSlotsNeeded = Math.max(
      0,
      Math.round(roundToNearestQuarterWithMidpoint(semantics.postFulfillmentSurplusFte) * 4)
    )
    if (extraSlotsNeeded === 0) return

    const candidates = [...semantics.trueStep3FloatingSlots].sort((a, b) => {
      if (a.slot !== b.slot) return b.slot - a.slot
      const nameCmp = a.staffName.localeCompare(b.staffName)
      if (nameCmp !== 0) return nameCmp
      return a.staffId.localeCompare(b.staffId)
    })
    if (candidates.length === 0) return

    candidates.slice(0, extraSlotsNeeded).forEach((candidate) => {
      const prev = nextExtraByStaff[candidate.staffId] || {}
      prev[candidate.slot] = true
      nextExtraByStaff[candidate.staffId] = prev
    })
  })

  return nextExtraByStaff
}
