import { createEmptyTeamRecord } from '@/lib/utils/types'
import {
  buildReservationRuntimeProgramsById,
  isAllocationSlotFromSpecialProgram,
} from '@/lib/utils/scheduleReservationRuntime'
import type { SpecialProgram } from '@/types/allocation'
import type { PCAAllocation } from '@/types/schedule'
import type { Staff, Team, Weekday } from '@/types/staff'

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
  const existingAllocations: PCAAllocation[] = []
  const addedStaffIds = new Set<string>()

  const specialProgramsByTeamCache = new Map<string, ReturnType<typeof buildReservationRuntimeProgramsById>>()
  const getSpecialProgramsByAllocationTeam = (allocationTeam: Team | null | undefined) => {
    const cacheKey = allocationTeam ?? '__null__'
    const cached = specialProgramsByTeamCache.get(cacheKey)
    if (cached) return cached
    const built = buildReservationRuntimeProgramsById({
      specialPrograms: args.specialPrograms,
      weekday: args.weekday,
      staffOverrides: args.staffOverrides,
      allocationTargetTeam: allocationTeam ?? null,
    })
    specialProgramsByTeamCache.set(cacheKey, built)
    return built
  }

  Object.entries(args.pcaAllocations).forEach(([team, allocs]) => {
    ;(allocs || []).forEach((alloc: any) => {
      let slotsInTeam = 0
      const specialProgramsById = getSpecialProgramsByAllocationTeam(alloc.team as Team | null | undefined)
      if (
        alloc.slot1 === team &&
        !isAllocationSlotFromSpecialProgram({
          allocation: alloc,
          slot: 1,
          team: team as Team,
          specialProgramsById,
        })
      ) slotsInTeam++
      if (
        alloc.slot2 === team &&
        !isAllocationSlotFromSpecialProgram({
          allocation: alloc,
          slot: 2,
          team: team as Team,
          specialProgramsById,
        })
      ) slotsInTeam++
      if (
        alloc.slot3 === team &&
        !isAllocationSlotFromSpecialProgram({
          allocation: alloc,
          slot: 3,
          team: team as Team,
          specialProgramsById,
        })
      ) slotsInTeam++
      if (
        alloc.slot4 === team &&
        !isAllocationSlotFromSpecialProgram({
          allocation: alloc,
          slot: 4,
          team: team as Team,
          specialProgramsById,
        })
      ) slotsInTeam++

      const invalidSlot = (alloc as any).invalid_slot
      if (invalidSlot) {
        const slotField = `slot${invalidSlot}` as keyof PCAAllocation
        if (
          (alloc as any)[slotField] === team &&
          !isAllocationSlotFromSpecialProgram({
            allocation: alloc,
            slot: invalidSlot,
            team: team as Team,
            specialProgramsById,
          })
        ) {
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

  return {
    existingTeamPCAAssigned: teamPCAAssigned,
    existingAllocations,
  }
}
