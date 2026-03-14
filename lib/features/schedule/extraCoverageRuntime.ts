import { buildDisplayViewForWeekday } from '@/lib/utils/scheduleRuntimeProjection'
import { isAllocationSlotFromSpecialProgram } from '@/lib/utils/scheduleReservationRuntime'
import { getMainTeam } from '@/lib/utils/teamMerge'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { createEmptyTeamRecord, createEmptyTeamRecordFactory } from '@/lib/utils/types'
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

  const assignedNonSpecialByMain = createEmptyTeamRecord<number>(0)
  const floatingCandidatesByMain = createEmptyTeamRecordFactory<
    Array<{ staffId: string; slot: 1 | 2 | 3 | 4; staffName: string }>
  >(() => [])

  for (const allocation of uniqueAllocations.values()) {
    const specialProgramsById = displayView.getProgramsByAllocationTeam(allocation.team as Team | null | undefined)
    const invalidSlot = (allocation as any)?.invalid_slot as 1 | 2 | 3 | 4 | null | undefined
    const staffMember = staffById.get(allocation.staff_id) || allocation.staff
    const isFloatingPca = staffMember?.rank === 'PCA' && !!staffMember?.floating
    const staffName = staffMember?.name || allocation.staff_id

    for (const slot of [1, 2, 3, 4] as const) {
      if (invalidSlot === slot) continue
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

      const isSpecial = isAllocationSlotFromSpecialProgram({
        allocation,
        slot,
        team: rawTeam as Team,
        specialProgramsById,
      })
      if (isSpecial) continue

      assignedNonSpecialByMain[mainTeam] = (assignedNonSpecialByMain[mainTeam] || 0) + 0.25
      if (isFloatingPca) {
        floatingCandidatesByMain[mainTeam] = [
          ...(floatingCandidatesByMain[mainTeam] || []),
          { staffId: allocation.staff_id, slot, staffName },
        ]
      }
    }
  }

  const nextExtraByStaff: ExtraCoverageByStaffId = {}
  args.visibleTeams.forEach((mainTeam) => {
    const required = requiredByMain[mainTeam] || 0
    const assigned = assignedNonSpecialByMain[mainTeam] || 0
    const surplusFte = Math.max(0, roundToNearestQuarterWithMidpoint(assigned - required))
    const extraSlotsNeeded = Math.max(0, Math.round(surplusFte * 4))
    if (extraSlotsNeeded === 0) return

    const candidates = [...(floatingCandidatesByMain[mainTeam] || [])].sort((a, b) => {
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
