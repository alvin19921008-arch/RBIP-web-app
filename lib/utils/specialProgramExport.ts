import { getAllocationSpecialProgramNamesBySlot } from '@/lib/utils/scheduleReservationRuntime'
import { buildDisplayViewForWeekday } from '@/lib/utils/scheduleRuntimeProjection'
import type { SpecialProgram } from '@/types/allocation'
import type { PCAAllocation } from '@/types/schedule'

type RowSlot = 1 | 2 | 3 | 4

export function getSpecialProgramNameBySlotForAllocation(args: {
  allocation: PCAAllocation
  specialPrograms: SpecialProgram[]
  weekday: 'mon' | 'tue' | 'wed' | 'thu' | 'fri'
  staffOverrides?: Record<string, unknown>
}): Partial<Record<RowSlot, string>> {
  const labels: Partial<Record<RowSlot, string>> = {}
  if (!Array.isArray(args.allocation.special_program_ids) || args.allocation.special_program_ids.length === 0) {
    return labels
  }
  const displayView = buildDisplayViewForWeekday({
    weekday: args.weekday,
    specialPrograms: args.specialPrograms,
    staffOverrides: args.staffOverrides,
  })
  const specialProgramsById = displayView.getProgramsByAllocationTeam(args.allocation.team)
  return getAllocationSpecialProgramNamesBySlot({
    allocation: args.allocation,
    specialProgramsById,
  })
}
