import { resolveSpecialProgramRuntimeModel } from '@/lib/utils/specialProgramRuntimeModel'
import type { SpecialProgram } from '@/types/allocation'
import type { TherapistAllocation } from '@/types/schedule'
import type { Staff, Team, Weekday } from '@/types/staff'

type StaffTeamOverrideLike = {
  team?: Team | null
}

type SpecialProgramOverrideEntryLike = {
  programId: string
  enabled?: boolean
  therapistId?: string
  pcaId?: string
  slots?: number[]
  requiredSlots?: number[]
  therapistFTESubtraction?: number
  pcaFTESubtraction?: number
  drmAddOn?: number
}

type StaffSpecialProgramOverrideLike = {
  specialProgramOverrides?: SpecialProgramOverrideEntryLike[]
}

export function buildSpecialProgramTargetTeamById(args: {
  programs: SpecialProgram[]
  therapistAllocations: TherapistAllocation[]
  day: Weekday
  staff: Staff[]
  overrides: Record<string, StaffTeamOverrideLike & StaffSpecialProgramOverrideLike>
}): Partial<Record<string, Team>> {
  const { programs, therapistAllocations, day, staff, overrides } = args
  const staffLookup = staff
    .map((member) => ({
      id: member.id,
      rank: member.rank,
      team: (overrides[member.id]?.team ?? member.team) as Team | null | undefined,
    }))
    .filter((member): member is { id: string; rank: Staff['rank']; team: Team } => !!member.team)

  const targetTeamById: Partial<Record<string, Team>> = {}
  programs.forEach((program) => {
    const runtimeModel = resolveSpecialProgramRuntimeModel({
      program,
      weekday: day,
      staffOverrides: overrides as Record<string, unknown>,
      allStaff: staffLookup,
    })
    if (!runtimeModel.isActiveOnWeekday) {
      return
    }

    const explicitOverrideTeam = runtimeModel.explicitOverrideTherapistId
      ? (therapistAllocations.find(
          (allocation) =>
            allocation?.staff_id === runtimeModel.explicitOverrideTherapistId &&
            allocation?.team &&
            allocation.special_program_ids?.includes(program.id)
        )?.team ?? null)
      : null
    if (explicitOverrideTeam) {
      targetTeamById[program.id] = explicitOverrideTeam
      return
    }

    const taggedAllocationTeam =
      therapistAllocations.find((allocation) => allocation?.team && allocation.special_program_ids?.includes(program.id))?.team ??
      null
    if (taggedAllocationTeam) {
      targetTeamById[program.id] = taggedAllocationTeam
      return
    }

    const fallbackTeam = runtimeModel.configuredFallbackTargetTeam
    if (fallbackTeam) {
      targetTeamById[program.id] = fallbackTeam
    }
  })

  return targetTeamById
}

export function buildSpecialProgramControllerRuntimeState(args: {
  specialPrograms: SpecialProgram[]
  therapistAllocations: TherapistAllocation[]
  day: Weekday
  staff: Staff[]
  overrides: Record<string, StaffTeamOverrideLike & StaffSpecialProgramOverrideLike>
}): {
  specialPrograms: SpecialProgram[]
  specialProgramTargetTeamById: Partial<Record<string, Team>>
} {
  const specialPrograms = applySpecialProgramOverrides({
    specialPrograms: args.specialPrograms,
    overrides: args.overrides,
    weekday: args.day,
  })

  const specialProgramTargetTeamById = buildSpecialProgramTargetTeamById({
    programs: specialPrograms,
    therapistAllocations: args.therapistAllocations,
    day: args.day,
    staff: args.staff,
    overrides: args.overrides,
  })

  return {
    specialPrograms,
    specialProgramTargetTeamById,
  }
}

export function applySpecialProgramOverrides(args: {
  specialPrograms: SpecialProgram[]
  overrides: Record<string, StaffSpecialProgramOverrideLike>
  weekday: Weekday
}): SpecialProgram[] {
  const { specialPrograms, overrides, weekday } = args

  return (specialPrograms || []).map((program: any) => {
    const runtimeModel = resolveSpecialProgramRuntimeModel({
      program,
      weekday,
      staffOverrides: overrides as Record<string, unknown>,
    })
    const programOverrides = runtimeModel.therapistOverrides
    const pcaOverrides = runtimeModel.acceptsPcaCoverOverrides ? runtimeModel.pcaOverrides : []
    let requiredSlotsOverride: number[] | undefined =
      runtimeModel.hasExplicitRequiredSlotsOverride ? runtimeModel.effectiveRequiredSlots : undefined

    if (!runtimeModel.isActiveOnWeekday) {
      return {
        ...program,
        weekdays: Array.isArray(program.weekdays)
          ? program.weekdays.filter((day: Weekday) => day !== weekday)
          : program.weekdays,
      }
    }

    if (programOverrides.length === 0 && pcaOverrides.length === 0 && !requiredSlotsOverride) return program

    const modifiedProgram: any = { ...program }
    modifiedProgram.fte_subtraction = { ...(modifiedProgram.fte_subtraction ?? {}) }

    programOverrides.forEach((overrideEntry) => {
      if (!overrideEntry.therapistId) return
      if (!modifiedProgram.staff_ids.includes(overrideEntry.therapistId)) {
        modifiedProgram.staff_ids = [...modifiedProgram.staff_ids, overrideEntry.therapistId]
      }
      if (!modifiedProgram.fte_subtraction[overrideEntry.therapistId]) {
        modifiedProgram.fte_subtraction[overrideEntry.therapistId] = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 }
      }
      if (overrideEntry.therapistFTESubtraction !== undefined) {
        modifiedProgram.fte_subtraction[overrideEntry.therapistId][weekday] = overrideEntry.therapistFTESubtraction
      }
    })

    if (!requiredSlotsOverride) {
      const slotsFromPcaCovers = Array.from(new Set(pcaOverrides.flatMap((entry) => entry.slots))).sort((a, b) => a - b)
      if (slotsFromPcaCovers.length > 0) {
        requiredSlotsOverride = slotsFromPcaCovers
      }
    }

    if (program.name !== 'DRM' && requiredSlotsOverride && requiredSlotsOverride.length > 0) {
      modifiedProgram.slots = {
        ...(modifiedProgram.slots ?? {}),
        [weekday]: requiredSlotsOverride,
      }
    }

    if (pcaOverrides.length > 0) {
      const prioritizedPcaIds = pcaOverrides.map((entry) => entry.pcaId)
      const existing = modifiedProgram.pca_preference_order as string[] | undefined
      modifiedProgram.pca_preference_order = [
        ...prioritizedPcaIds,
        ...((Array.isArray(existing) ? existing : []).filter((id) => !prioritizedPcaIds.includes(id))),
      ]

      const effectiveRequiredSlots = requiredSlotsOverride ?? []
      const manualPcaCovers = pcaOverrides
        .map((entry) => ({
          pcaId: entry.pcaId,
          slots: (entry.slots.length > 0 ? entry.slots : effectiveRequiredSlots)
            .filter((slot) => [1, 2, 3, 4].includes(slot))
            .sort((a, b) => a - b),
        }))
        .filter((entry) => entry.slots.length > 0)
      if (manualPcaCovers.length > 0) {
        modifiedProgram.__manualPcaCovers = manualPcaCovers
      }
    }

    return modifiedProgram
  })
}
