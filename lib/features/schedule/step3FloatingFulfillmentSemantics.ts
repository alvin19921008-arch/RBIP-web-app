import { isAllocationSlotFromSpecialProgram } from '@/lib/utils/scheduleReservationRuntime'
import { buildDisplayViewForWeekday } from '@/lib/utils/scheduleRuntimeProjection'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { getSubstitutionSlotsForTeam } from '@/lib/utils/substitutionFor'
import type { SpecialProgram } from '@/types/allocation'
import type { PCAAllocation } from '@/types/schedule'
import type { Staff, Team, Weekday } from '@/types/staff'

export interface Step3FloatingSlotOwnership {
  staffId: string
  staffName: string
  slot: 1 | 2 | 3 | 4
}

export interface Step3FloatingFulfillmentSemantics {
  team: Team
  averagePcaPerTeam: number
  nonFloatingCoverageFte: number
  step2ReservedSpecialProgramCoverageFte: number
  substitutionCoverageFte: number
  trueStep3FloatingCoverageFte: number
  trueStep3FloatingFulfillmentFte: number
  postFulfillmentSurplusFte: number
  remainingNeedBeforeTrueStep3Fte: number
  trueStep3FloatingSlots: Step3FloatingSlotOwnership[]
}

function getInvalidSlotsForAllocation(
  allocation: PCAAllocation,
  override: { invalidSlot?: number; invalidSlots?: Array<{ slot: number }> } | undefined
): Set<1 | 2 | 3 | 4> {
  const invalid = new Set<1 | 2 | 3 | 4>()
  const fromArray = Array.isArray(override?.invalidSlots)
    ? override.invalidSlots
        .map((entry) => entry?.slot)
        .filter((slot): slot is 1 | 2 | 3 | 4 => slot === 1 || slot === 2 || slot === 3 || slot === 4)
    : []
  for (const slot of fromArray) invalid.add(slot)

  const legacy =
    typeof override?.invalidSlot === 'number'
      ? override.invalidSlot
      : typeof allocation.invalid_slot === 'number'
        ? allocation.invalid_slot
        : null
  if (legacy === 1 || legacy === 2 || legacy === 3 || legacy === 4) {
    invalid.add(legacy)
  }

  return invalid
}

export function deriveTeamStep3FloatingFulfillmentSemantics(args: {
  team: Team
  allocations: Array<PCAAllocation & { staff?: Staff }>
  allPcaStaff: Staff[]
  staffOverrides?: Record<string, any>
  specialPrograms?: SpecialProgram[]
  weekday?: Weekday
  averagePcaPerTeam?: number
}): Step3FloatingFulfillmentSemantics {
  const team = args.team
  const averagePcaPerTeam = args.averagePcaPerTeam ?? 0
  const staffById = new Map<string, Staff>()
  for (const staffMember of args.allPcaStaff ?? []) {
    staffById.set(staffMember.id, staffMember)
  }

  const displayView =
    args.weekday && (args.specialPrograms?.length ?? 0) > 0
      ? buildDisplayViewForWeekday({
          weekday: args.weekday,
          specialPrograms: args.specialPrograms ?? [],
          staffOverrides: args.staffOverrides,
        })
      : null

  let nonFloatingCoverageFte = 0
  let step2ReservedSpecialProgramCoverageFte = 0
  let substitutionCoverageFte = 0
  let trueStep3FloatingCoverageFte = 0
  const trueStep3FloatingSlots: Step3FloatingSlotOwnership[] = []

  for (const allocation of args.allocations ?? []) {
    const staffMember = allocation.staff ?? staffById.get(allocation.staff_id)
    const isFloating = !!staffMember?.floating
    const override = args.staffOverrides?.[allocation.staff_id]
    const substitutionSlots = new Set(
      getSubstitutionSlotsForTeam(override, team).filter(
        (slot): slot is 1 | 2 | 3 | 4 => slot === 1 || slot === 2 || slot === 3 || slot === 4
      )
    )
    const invalidSlots = getInvalidSlotsForAllocation(allocation, override)

    for (const slot of [1, 2, 3, 4] as const) {
      const owner =
        slot === 1
          ? allocation.slot1
          : slot === 2
            ? allocation.slot2
            : slot === 3
              ? allocation.slot3
              : allocation.slot4
      if (owner !== team) continue
      if (invalidSlots.has(slot)) continue

      const isReservedSpecialProgram =
        !!displayView &&
        isAllocationSlotFromSpecialProgram({
          allocation,
          slot,
          team,
          specialProgramsById: displayView.getProgramsByAllocationTeam(
            allocation.team as Team | null | undefined
          ),
        })

      if (isReservedSpecialProgram) {
        step2ReservedSpecialProgramCoverageFte += 0.25
        continue
      }

      if (isFloating && substitutionSlots.has(slot)) {
        substitutionCoverageFte += 0.25
        continue
      }

      if (isFloating) {
        trueStep3FloatingCoverageFte += 0.25
        trueStep3FloatingSlots.push({
          staffId: allocation.staff_id,
          staffName: staffMember?.name || allocation.staff_id,
          slot,
        })
        continue
      }

      nonFloatingCoverageFte += 0.25
    }
  }

  const remainingNeedBeforeTrueStep3Fte = Math.max(
    0,
    roundToNearestQuarterWithMidpoint(
      averagePcaPerTeam - nonFloatingCoverageFte - substitutionCoverageFte
    )
  )
  const trueStep3FloatingFulfillmentFte = Math.min(
    trueStep3FloatingCoverageFte,
    remainingNeedBeforeTrueStep3Fte
  )
  const postFulfillmentSurplusFte = Math.max(
    0,
    roundToNearestQuarterWithMidpoint(
      trueStep3FloatingCoverageFte - trueStep3FloatingFulfillmentFte
    )
  )

  return {
    team,
    averagePcaPerTeam,
    nonFloatingCoverageFte,
    step2ReservedSpecialProgramCoverageFte,
    substitutionCoverageFte,
    trueStep3FloatingCoverageFte,
    trueStep3FloatingFulfillmentFte,
    postFulfillmentSurplusFte,
    remainingNeedBeforeTrueStep3Fte,
    trueStep3FloatingSlots,
  }
}

export function formatStep3FulfillmentSemanticsCompactLine(
  semantics: Step3FloatingFulfillmentSemantics
): string {
  return [
    `Reserved ${semantics.step2ReservedSpecialProgramCoverageFte.toFixed(2)}`,
    `Substitution ${semantics.substitutionCoverageFte.toFixed(2)}`,
    `Fulfills ${semantics.trueStep3FloatingFulfillmentFte.toFixed(2)}`,
    `Surplus ${semantics.postFulfillmentSurplusFte.toFixed(2)}`,
  ].join(' · ')
}
