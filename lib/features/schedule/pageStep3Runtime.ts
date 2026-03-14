import type { PCAData } from '@/lib/algorithms/pcaAllocation'
import { computeStep3BootstrapState } from '@/lib/features/schedule/step3Bootstrap'
import { buildPcaAllocatorView, buildScheduleRuntimeProjection } from '@/lib/utils/scheduleRuntimeProjection'
import type { SpecialProgram } from '@/types/allocation'
import type { PCAAllocation } from '@/types/schedule'
import type { Staff, Team } from '@/types/staff'

export function buildPageStep3RuntimeState(args: {
  selectedDate: Date
  staff: Staff[]
  staffOverrides: Record<string, any>
  pcaAllocations: Record<Team, Array<PCAAllocation & { staff?: Staff }>>
  specialPrograms: SpecialProgram[]
}): {
  pcaData: PCAData[]
  existingAllocations: PCAAllocation[]
} {
  const runtimeProjection = buildScheduleRuntimeProjection({
    selectedDate: args.selectedDate,
    staff: args.staff,
    staffOverrides: args.staffOverrides,
    excludeSubstitutionSlotsForFloating: true,
    excludeSpecialProgramSlotsForFloating: true,
    clampBufferFteRemaining: true,
  })

  const { existingAllocations } = computeStep3BootstrapState({
    pcaAllocations: args.pcaAllocations,
    staff: args.staff,
    specialPrograms: args.specialPrograms,
    weekday: runtimeProjection.weekday,
    staffOverrides: args.staffOverrides,
  })

  const pcaData = buildPcaAllocatorView({
    projection: runtimeProjection,
    fallbackToBaseTeamWhenEffectiveTeamMissing: true,
  })

  return {
    pcaData,
    existingAllocations,
  }
}
