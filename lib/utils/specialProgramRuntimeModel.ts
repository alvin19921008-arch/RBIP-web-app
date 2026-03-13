import { getEffectiveSpecialProgramWeekdaySlots, getPrimaryConfiguredTherapistForWeekday } from '@/lib/utils/specialProgramConfigRows'
import { getSpecialProgramRuntimeOverrideSummary } from '@/lib/utils/specialProgramRuntimeOverrides'
import type { SpecialProgram } from '@/types/allocation'
import type { Staff, Team, Weekday } from '@/types/staff'

type RowSlot = 1 | 2 | 3 | 4

export type SpecialProgramRuntimeModel = {
  isActiveOnWeekday: boolean
  hasExplicitRequiredSlotsOverride: boolean
  acceptsPcaCoverOverrides: boolean
  usesSharedAllocationIdentity: boolean
  bypassesPrimaryTargetPendingGate: boolean
  allocatorDefaultTargetTeam: Team | null
  effectiveRequiredSlots: RowSlot[]
  slotTeamBySlot: Partial<Record<RowSlot, Team>>
  explicitOverrideTherapistId: string | null
  therapistOverrides: Array<{
    therapistId: string
    therapistFTESubtraction?: number
  }>
  pcaOverrides: Array<{
    pcaId: string
    slots: number[]
  }>
  configuredPrimaryTherapistId: string | null
  configuredFallbackTargetTeam: Team | null
  targetTeam: Team | null
}

function toRowSlots(slots: number[]): RowSlot[] {
  return slots.filter((slot): slot is RowSlot => slot === 1 || slot === 2 || slot === 3 || slot === 4)
}

function resolveSlotTeam(args: { programName: string; slot: RowSlot; targetTeam: Team | null }): Team | null {
  if (args.programName === 'Robotic') {
    if (args.slot === 1 || args.slot === 2) return 'SMM'
    return 'SFM'
  }

  return args.targetTeam
}

export function resolveSpecialProgramRuntimeModel(args: {
  program: SpecialProgram
  weekday?: Weekday
  staffOverrides?: Record<string, unknown>
  allStaff?: Array<Pick<Staff, 'id' | 'rank' | 'team'>>
  targetTeam?: Team | null
}): SpecialProgramRuntimeModel {
  const runtimeOverride = getSpecialProgramRuntimeOverrideSummary({
    staffOverrides: args.staffOverrides,
    programId: String(args.program.id),
  })

  const resolvedWeekday =
    args.weekday ??
    (Array.isArray(args.program.weekdays) && args.program.weekdays.length === 1 ? args.program.weekdays[0] : undefined)

  const isScheduledForWeekday = resolvedWeekday
    ? Array.isArray(args.program.weekdays) && args.program.weekdays.includes(resolvedWeekday)
    : true

  const isActiveOnWeekday = !runtimeOverride.explicitlyDisabled && isScheduledForWeekday
  const configuredPrimaryTherapist = isActiveOnWeekday && resolvedWeekday && Array.isArray(args.allStaff)
    ? getPrimaryConfiguredTherapistForWeekday({
        program: args.program,
        day: resolvedWeekday,
        allStaff: args.allStaff,
      })
    : null
  const configuredFallbackTargetTeam =
    configuredPrimaryTherapist && Array.isArray(args.allStaff)
      ? ((args.allStaff.find((entry) => entry.id === configuredPrimaryTherapist.staffId)?.team ?? null) as Team | null)
      : null
  const effectiveRequiredSlots = !isActiveOnWeekday
    ? []
    : runtimeOverride.requiredSlots.length > 0
      ? toRowSlots(runtimeOverride.requiredSlots)
      : resolvedWeekday
        ? toRowSlots(
            getEffectiveSpecialProgramWeekdaySlots({
              program: args.program,
              day: resolvedWeekday,
              preferDirectWeekdaySlots: true,
            })
          )
        : []

  const slotTeamBySlot: Partial<Record<RowSlot, Team>> = {}
  for (const slot of effectiveRequiredSlots) {
    const team = resolveSlotTeam({
      programName: args.program.name,
      slot,
      targetTeam: args.targetTeam ?? null,
    })
    if (team) {
      slotTeamBySlot[slot] = team
    }
  }

  const allocatorDefaultTargetTeam =
    args.targetTeam ??
    configuredFallbackTargetTeam ??
    (args.program.name === 'CRP'
      ? 'CPPC'
      : effectiveRequiredSlots.length > 0
        ? (slotTeamBySlot[effectiveRequiredSlots[0]] ?? null)
        : null)

  return {
    isActiveOnWeekday,
    hasExplicitRequiredSlotsOverride: runtimeOverride.requiredSlots.length > 0,
    acceptsPcaCoverOverrides: args.program.name !== 'DRM',
    usesSharedAllocationIdentity: args.program.name === 'Robotic' || args.program.name === 'CRP',
    bypassesPrimaryTargetPendingGate: args.program.name === 'Robotic',
    allocatorDefaultTargetTeam,
    effectiveRequiredSlots,
    slotTeamBySlot,
    explicitOverrideTherapistId: runtimeOverride.therapistOverrides.find((entry) => entry.therapistId)?.therapistId ?? null,
    therapistOverrides: runtimeOverride.therapistOverrides,
    pcaOverrides: runtimeOverride.pcaOverrides,
    configuredPrimaryTherapistId: configuredPrimaryTherapist?.staffId ?? null,
    configuredFallbackTargetTeam,
    targetTeam: args.targetTeam ?? null,
  }
}
