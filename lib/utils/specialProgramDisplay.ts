import { getAllocationSpecialProgramSlotsForTeam } from '@/lib/utils/scheduleReservationRuntime'
import { buildDisplayView } from '@/lib/utils/scheduleRuntimeProjection'
import type { SpecialProgram } from '@/types/allocation'
import type { Team } from '@/types/staff'

interface PcaAllocationLike {
  team?: Team | null
  slot1?: Team | null
  slot2?: Team | null
  slot3?: Team | null
  slot4?: Team | null
  special_program_ids?: string[] | null
}

export function getSpecialProgramSlotsForAllocationTeam(args: {
  allocation: PcaAllocationLike
  team: Team
  selectedDate: Date
  specialPrograms: SpecialProgram[]
  staffOverrides?: Record<string, unknown>
}): number[] {
  const { allocation, team, selectedDate, specialPrograms, staffOverrides } = args
  if (!allocation.special_program_ids || allocation.special_program_ids.length === 0) {
    return []
  }
  const displayView = buildDisplayView({
    selectedDate,
    specialPrograms,
    staffOverrides,
  })
  const specialProgramsById = displayView.getProgramsByAllocationTeam(allocation.team ?? team)
  const resolvedSlots = getAllocationSpecialProgramSlotsForTeam({
    allocation: allocation as any,
    team,
    specialProgramsById,
  })
  return resolvedSlots
}
