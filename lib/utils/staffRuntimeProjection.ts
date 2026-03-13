import { isOnDutyLeaveType } from '@/lib/utils/leaveType'
import { getAllSubstitutionSlots, hasAnySubstitution } from '@/lib/utils/substitutionFor'
import type { LeaveType, Staff, Team } from '@/types/staff'

type StaffRuntimeSlotOverrides = {
  slot1?: Team | null
  slot2?: Team | null
  slot3?: Team | null
  slot4?: Team | null
}

export type StaffRuntimeOverrideLike = {
  leaveType?: LeaveType | null
  fteRemaining?: number
  team?: Team | null
  fteSubtraction?: number
  availableSlots?: number[]
  invalidSlot?: number
  invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>
  amPmSelection?: 'AM' | 'PM'
  specialProgramAvailable?: boolean
  therapistNoAllocation?: boolean
  slotOverrides?: StaffRuntimeSlotOverrides
  substitutionFor?: unknown
  substitutionForBySlot?: unknown
  specialProgramOverrides?: Array<{
    pcaId?: string
    slots?: number[]
  }>
}

export type StaffRuntimeEntry = {
  staffId: string
  name: string
  rank: Staff['rank']
  baseTeam: Team | null
  effectiveTeam: Team | null
  leaveType: LeaveType | null
  fteRemaining: number
  isOnDuty: boolean
  isAvailable: boolean
  availableSlots?: number[]
  invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>
  effectiveInvalidSlot?: number
  floating: boolean
  floorPcaSelection: boolean
  specialProgramAvailable?: boolean
  amPmSelection?: 'AM' | 'PM'
  therapistNoAllocation?: boolean
  slotOverrides?: StaffRuntimeSlotOverrides
  substitutionSlots: number[]
  sourceFlags: {
    hasOverride: boolean
    teamFromOverride: boolean
    fteFromSubtraction: boolean
    invalidSlotDerivedFromArray: boolean
  }
}

const ALL_SLOTS = [1, 2, 3, 4] as const

export function deriveEffectiveInvalidSlot(
  override: StaffRuntimeOverrideLike | null | undefined
): { value?: number; derivedFromArray: boolean } {
  const fromLegacy = override?.invalidSlot
  if (typeof fromLegacy === 'number') {
    return { value: fromLegacy, derivedFromArray: false }
  }

  const fromArray = Array.isArray(override?.invalidSlots) && override!.invalidSlots!.length > 0
    ? override!.invalidSlots![0]?.slot
    : undefined

  if (typeof fromArray === 'number') {
    return { value: fromArray, derivedFromArray: true }
  }

  return { value: undefined, derivedFromArray: false }
}

export function normalizeAvailableSlotsWithInvalidAndSubstitution(args: {
  availableSlots?: number[]
  effectiveInvalidSlot?: number
  substitutionSlots?: number[]
  excludeSubstitutionSlots?: boolean
  fallbackToAllSlotsWhenExcludingSubstitution?: boolean
  specialProgramSlots?: number[]
  excludeSpecialProgramSlots?: boolean
  fallbackToAllSlotsWhenExcludingSpecialProgram?: boolean
}): number[] | undefined {
  let next = Array.isArray(args.availableSlots) ? [...args.availableSlots] : undefined

  if (args.excludeSubstitutionSlots && Array.isArray(args.substitutionSlots) && args.substitutionSlots.length > 0) {
    const baseSlots =
      next && next.length > 0
        ? next
        : args.fallbackToAllSlotsWhenExcludingSubstitution
          ? [...ALL_SLOTS]
          : []
    next = baseSlots.filter((slot) => !args.substitutionSlots!.includes(slot))
  }

  if (args.excludeSpecialProgramSlots && Array.isArray(args.specialProgramSlots) && args.specialProgramSlots.length > 0) {
    const baseSlots =
      next && next.length > 0
        ? next
        : args.fallbackToAllSlotsWhenExcludingSpecialProgram
          ? [...ALL_SLOTS]
          : []
    next = baseSlots.filter((slot) => !args.specialProgramSlots!.includes(slot))
  }

  if (typeof args.effectiveInvalidSlot === 'number' && Array.isArray(next)) {
    next = next.filter((slot) => slot !== args.effectiveInvalidSlot)
  }

  return next
}

export function buildStaffRuntimeById(args: {
  staff: Staff[]
  staffOverrides: Record<string, StaffRuntimeOverrideLike | undefined>
  replacedNonFloatingIds?: Set<string>
  excludeSubstitutionSlotsForFloating?: boolean
  excludeSpecialProgramSlotsForFloating?: boolean
  clampBufferFteRemaining?: boolean
}): Record<string, StaffRuntimeEntry> {
  const result: Record<string, StaffRuntimeEntry> = {}

  args.staff.forEach((member) => {
    const override = args.staffOverrides[member.id]
    const isBufferStaff = member.status === 'buffer'
    const baseFTE = isBufferStaff && typeof (member as any).buffer_fte === 'number' ? (member as any).buffer_fte : 1.0
    const fteFromSubtraction = typeof override?.fteSubtraction === 'number'
    const rawFteRemaining = fteFromSubtraction
      ? Math.max(0, baseFTE - (override?.fteSubtraction ?? 0))
      : typeof override?.fteRemaining === 'number'
        ? override.fteRemaining
        : baseFTE
    const fteRemaining =
      args.clampBufferFteRemaining && isBufferStaff ? Math.min(baseFTE, rawFteRemaining) : rawFteRemaining

    const substitutionSlots = getAllSubstitutionSlots(override as any)
    const specialProgramSlots = Array.isArray(override?.specialProgramOverrides)
      ? Array.from(
          new Set(
            override.specialProgramOverrides.flatMap((entry) =>
              Array.isArray(entry?.slots)
                ? entry.slots.filter((slot): slot is number => ALL_SLOTS.includes(slot as 1 | 2 | 3 | 4))
                : []
            )
          )
        ).sort((a, b) => a - b)
      : []
    const shouldExcludeSubstitutionSlots =
      !!args.excludeSubstitutionSlotsForFloating && !!member.floating && hasAnySubstitution(override as any)
    const shouldExcludeSpecialProgramSlots =
      !!args.excludeSpecialProgramSlotsForFloating && !!member.floating && specialProgramSlots.length > 0
    const invalidSlotMeta = deriveEffectiveInvalidSlot(override)
    const availableSlots = normalizeAvailableSlotsWithInvalidAndSubstitution({
      availableSlots: override?.availableSlots,
      effectiveInvalidSlot: invalidSlotMeta.value,
      substitutionSlots,
      excludeSubstitutionSlots: shouldExcludeSubstitutionSlots,
      fallbackToAllSlotsWhenExcludingSubstitution: true,
      specialProgramSlots,
      excludeSpecialProgramSlots: shouldExcludeSpecialProgramSlots,
      fallbackToAllSlotsWhenExcludingSpecialProgram: true,
    })
    const effectiveTeam = args.replacedNonFloatingIds?.has(member.id) ? null : ((override?.team ?? member.team) as Team | null)
    const leaveType = (override?.leaveType ?? null) as LeaveType | null

    result[member.id] = {
      staffId: member.id,
      name: member.name,
      rank: member.rank,
      baseTeam: member.team as Team | null,
      effectiveTeam,
      leaveType,
      fteRemaining,
      isOnDuty: isOnDutyLeaveType(leaveType),
      isAvailable: typeof override?.fteRemaining === 'number' ? override.fteRemaining > 0 : true,
      availableSlots,
      invalidSlots: override?.invalidSlots,
      effectiveInvalidSlot: invalidSlotMeta.value,
      floating: !!member.floating,
      floorPcaSelection: !!(member as any).floor_pca,
      specialProgramAvailable: override?.specialProgramAvailable,
      amPmSelection: override?.amPmSelection,
      therapistNoAllocation: override?.therapistNoAllocation,
      slotOverrides: override?.slotOverrides,
      substitutionSlots,
      sourceFlags: {
        hasOverride: !!override,
        teamFromOverride: typeof override?.team === 'string',
        fteFromSubtraction,
        invalidSlotDerivedFromArray: invalidSlotMeta.derivedFromArray,
      },
    }
  })

  return result
}
