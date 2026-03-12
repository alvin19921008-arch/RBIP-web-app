import type { Team } from '@/types/staff'

interface TherapistAllocationLike {
  staff_id?: string
  team?: Team | null
  special_program_ids?: string[] | null
}

interface SpecialProgramOverrideLike {
  programId?: string
  therapistId?: string
}

interface OverrideEntryLike {
  specialProgramOverrides?: SpecialProgramOverrideLike[]
}

export function resolveSpecialProgramTargetTeam(args: {
  programId: string
  therapistAllocations: TherapistAllocationLike[]
  overrides?: Record<string, OverrideEntryLike>
}): Team | null {
  const { programId, therapistAllocations, overrides } = args

  const explicitTherapistId = Object.values(overrides ?? {})
    .flatMap((entry) => (Array.isArray(entry?.specialProgramOverrides) ? entry.specialProgramOverrides : []))
    .find((entry) => entry?.programId === programId && typeof entry?.therapistId === 'string')?.therapistId

  if (explicitTherapistId) {
    const explicitAllocation = therapistAllocations.find(
      (allocation) =>
        allocation?.staff_id === explicitTherapistId &&
        allocation?.team &&
        allocation.special_program_ids?.includes(programId)
    )
    if (explicitAllocation?.team) {
      return explicitAllocation.team
    }
  }

  const taggedAllocation = therapistAllocations.find(
    (allocation) => allocation?.team && allocation.special_program_ids?.includes(programId)
  )

  return (taggedAllocation?.team ?? null) as Team | null
}
