import { useMemo, useRef } from 'react'
import type { BedAllocation, BedRelievingNotesByToTeam, PCAAllocation, ScheduleCalculations, TherapistAllocation } from '@/types/schedule'
import type { Staff, Team } from '@/types/staff'
import type { SpecialProgram } from '@/types/allocation'
import { combineScheduleCalculations } from '@/lib/features/schedule/scheduleCalculationsCombine'
import { buildDisplayPcaAllocationsByTeam } from '@/lib/features/schedule/pcaDisplayProjection'
import { projectBedRelievingNotesForDisplay } from '@/lib/features/schedule/bedRelievingDisplayProjection'
import {
  mergeExtraCoverageIntoStaffOverridesForDisplay,
  stripExtraCoverageOverrides,
} from '@/lib/features/schedule/extraCoverageVisibility'
import { deriveExtraCoverageByStaffId } from '@/lib/features/schedule/extraCoverageRuntime'
import { createEmptyTeamRecord, createEmptyTeamRecordFactory } from '@/lib/utils/types'
import { getMainTeam } from '@/lib/utils/teamMerge'
import { getAllocationSpecialProgramSlotsForTeam } from '@/lib/utils/scheduleReservationRuntime'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { TEAMS } from '@/lib/features/schedule/constants'
import type { StaffRuntimeOverrideLike } from '@/lib/utils/staffRuntimeProjection'
import type {
  BedCountsOverridesByTeam,
  StaffOverrideState,
} from '@/lib/features/schedule/controller/scheduleControllerTypes'
import type { UseStep3DialogProjectionResult } from '@/features/schedule/ui/hooks/useStep3DialogProjection'

type TeamRecord<T> = Record<Team, T>
type TherapistAllocationForDisplay = TherapistAllocation & { staff: Staff }
type PcaAllocationForDisplay = PCAAllocation & { staff: Staff }
type PcaAllocationForUi = PCAAllocation & { staff?: Staff }
type StaffOverridesById = Partial<Record<string, StaffOverrideState>>
type StaffOverrideSliceByTeam = TeamRecord<Record<string, StaffOverrideState>>
type Step3OrderPositionByTeam = Record<Team, number | undefined>

type BedCountsShsStudentMergedByTeam = Partial<
  Record<Team, { shsBedCounts: number; studentPlacementBedCounts: number }>
>

type PcaBalanceSanity = {
  teamBalances: Array<{ team: Team; assigned: number; target: number; balance: number }>
  positiveSum: number
  negativeAbsSum: number
  netDiff: number
  perTeamText: string
}

type OverridesSliceCacheEntry = {
  idsKey: string
  slice: Record<string, StaffOverrideState>
}

export type UseScheduleDisplayProjectionsArgs = {
  selectedDate: Date
  visibleTeams: Team[]
  teamContributorsByMain: Partial<Record<Team, Team[]>>
  mergedInto: Partial<Record<Team, Team>>
  therapistAllocations: TeamRecord<TherapistAllocationForDisplay[]>
  pcaAllocationsForUi: TeamRecord<PcaAllocationForUi[]>
  bedAllocations: BedAllocation[]
  calculations: TeamRecord<ScheduleCalculations | null>
  staff: Staff[]
  bufferStaff: Staff[]
  staffOverrides: StaffOverridesById
  bedCountsOverridesByTeam: BedCountsOverridesByTeam | null | undefined
  bedRelievingNotesByToTeam: BedRelievingNotesByToTeam | null | undefined
  teamAllocationOrder: Team[] | null
  currentStep: string
  initializedSteps: Set<string>
  displayViewForCurrentWeekday: UseStep3DialogProjectionResult['displayViewForCurrentWeekday']
  specialPrograms: SpecialProgram[] | null | undefined
}

export type ScheduleDisplayProjectionsResult = {
  therapistAllocationsForDisplay: TeamRecord<TherapistAllocationForDisplay[]>
  pcaDisplayAllocationsByTeam: TeamRecord<PcaAllocationForDisplay[]>
  pcaAllocationsForDisplay: TeamRecord<PcaAllocationForDisplay[]>
  calculationsForDisplay: TeamRecord<ScheduleCalculations | null>
  bedCountsOverridesByTeamForDisplay: BedCountsShsStudentMergedByTeam
  bedRelievingNotesByToTeamForDisplay: BedRelievingNotesByToTeam
  bedAllocationsForDisplay: BedAllocation[]
  allPCAAllocationsFlat: PcaAllocationForDisplay[]
  step3OrderPositionByTeam: Step3OrderPositionByTeam
  floatingPoolRemainingFte: number
  therapistOverridesByTeam: StaffOverrideSliceByTeam
  extraCoverageByStaffIdForDisplay: Record<string, Partial<Record<1 | 2 | 3 | 4, true>>>
  staffOverridesForPcaDisplay: StaffOverridesById
  pcaOverridesByTeam: StaffOverrideSliceByTeam
  pcaBalanceSanity: PcaBalanceSanity
}

function getSlotsForTeam(allocation: PCAAllocation, team: Team): number[] {
  const slots: number[] = []
  if (allocation.slot1 === team) slots.push(1)
  if (allocation.slot2 === team) slots.push(2)
  if (allocation.slot3 === team) slots.push(3)
  if (allocation.slot4 === team) slots.push(4)
  return slots
}

export function useScheduleDisplayProjections(
  args: UseScheduleDisplayProjectionsArgs
): ScheduleDisplayProjectionsResult {
  const {
    selectedDate,
    visibleTeams,
    teamContributorsByMain,
    mergedInto,
    therapistAllocations,
    pcaAllocationsForUi,
    bedAllocations,
    calculations,
    staff,
    bufferStaff,
    staffOverrides,
    bedCountsOverridesByTeam,
    bedRelievingNotesByToTeam,
    teamAllocationOrder,
    currentStep,
    initializedSteps,
    displayViewForCurrentWeekday,
    specialPrograms,
  } = args

  const therapistAllocationsForDisplay = useMemo(() => {
    const out = createEmptyTeamRecordFactory<TherapistAllocationForDisplay[]>(() => [])
    visibleTeams.forEach((mainTeam) => {
      const contributors = teamContributorsByMain[mainTeam] || [mainTeam]
      out[mainTeam] = contributors.flatMap((team) => therapistAllocations[team] || [])
    })
    return out
  }, [visibleTeams, teamContributorsByMain, therapistAllocations])

  const pcaDisplayAllocationsByTeam = useMemo(
    () =>
      buildDisplayPcaAllocationsByTeam({
        selectedDate,
        staff: [...staff, ...bufferStaff],
        staffOverrides: staffOverrides as Record<string, StaffRuntimeOverrideLike | undefined>,
        pcaAllocationsByTeam: pcaAllocationsForUi,
      }),
    [selectedDate, staff, bufferStaff, staffOverrides, pcaAllocationsForUi]
  )

  const pcaAllocationsForDisplay = useMemo(() => {
    const out = createEmptyTeamRecordFactory<PcaAllocationForDisplay[]>(() => [])
    visibleTeams.forEach((mainTeam) => {
      const contributors = teamContributorsByMain[mainTeam] || [mainTeam]
      const mergedRows = contributors
        .flatMap((team) => pcaDisplayAllocationsByTeam[team] || [])
        .map((allocation) => {
          const canonical = (value: Team | null | undefined): Team | null | undefined =>
            TEAMS.includes(value as Team) ? getMainTeam(value as Team, mergedInto) : value
          return {
            ...allocation,
            team: canonical(allocation.team),
            slot1: canonical(allocation.slot1),
            slot2: canonical(allocation.slot2),
            slot3: canonical(allocation.slot3),
            slot4: canonical(allocation.slot4),
          } as PcaAllocationForDisplay
        })
      const seen = new Set<string>()
      out[mainTeam] = mergedRows.filter((allocation) => {
        const contributesToMain =
          allocation.team === mainTeam ||
          allocation.slot1 === mainTeam ||
          allocation.slot2 === mainTeam ||
          allocation.slot3 === mainTeam ||
          allocation.slot4 === mainTeam
        if (!contributesToMain) return false

        const key =
          (allocation.id && String(allocation.id)) ||
          `${String(allocation.staff_id ?? '')}:${String(allocation.team ?? '')}:${String(allocation.slot1 ?? '')}:${String(allocation.slot2 ?? '')}:${String(allocation.slot3 ?? '')}:${String(allocation.slot4 ?? '')}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    })
    return out
  }, [visibleTeams, teamContributorsByMain, pcaDisplayAllocationsByTeam, mergedInto])

  const calculationsForDisplay = useMemo(() => {
    const out = createEmptyTeamRecord<ScheduleCalculations | null>(null)
    visibleTeams.forEach((mainTeam) => {
      const contributors = teamContributorsByMain[mainTeam] || [mainTeam]
      out[mainTeam] = combineScheduleCalculations(contributors.map((team) => calculations[team]))
    })
    return out
  }, [visibleTeams, teamContributorsByMain, calculations])

  const bedCountsOverridesByTeamForDisplay = useMemo(() => {
    const out: BedCountsShsStudentMergedByTeam = {}
    visibleTeams.forEach((mainTeam) => {
      const contributors = teamContributorsByMain[mainTeam] || [mainTeam]
      let shsTotal = 0
      let studentTotal = 0
      let hasAny = false
      contributors.forEach((team) => {
        const override = bedCountsOverridesByTeam?.[team] ?? null
        if (override && typeof override.shsBedCounts === 'number') {
          shsTotal += override.shsBedCounts
          hasAny = true
        }
        if (override && typeof override.studentPlacementBedCounts === 'number') {
          studentTotal += override.studentPlacementBedCounts
          hasAny = true
        }
      })
      if (hasAny) {
        out[mainTeam] = {
          shsBedCounts: shsTotal,
          studentPlacementBedCounts: studentTotal,
        }
      }
    })
    return out
  }, [visibleTeams, teamContributorsByMain, bedCountsOverridesByTeam])

  const bedRelievingNotesByToTeamForDisplay = useMemo(() => {
    return projectBedRelievingNotesForDisplay({
      bedRelievingNotesByToTeam,
      mergedInto,
    })
  }, [bedRelievingNotesByToTeam, mergedInto])

  const bedAllocationsForDisplay = useMemo(() => {
    const mapped = (bedAllocations || []).map((allocation) => ({
      ...allocation,
      from_team: getMainTeam(allocation.from_team, mergedInto),
      to_team: getMainTeam(allocation.to_team, mergedInto),
    }))
    return mapped.filter((allocation) => allocation.from_team !== allocation.to_team)
  }, [bedAllocations, mergedInto])

  const allPCAAllocationsFlat = useMemo(
    () => visibleTeams.flatMap((team) => pcaAllocationsForDisplay[team] || []),
    [visibleTeams, pcaAllocationsForDisplay]
  )

  const step3OrderPositionByTeam = useMemo(() => {
    const map = createEmptyTeamRecord<number | undefined>(undefined)
    if (!teamAllocationOrder || teamAllocationOrder.length === 0) return map
    teamAllocationOrder.forEach((team, index) => {
      map[team] = index + 1
    })
    return map
  }, [teamAllocationOrder])

  const floatingPoolRemainingFte = useMemo(() => {
    const byId = new Map<string, number>()
    for (const allocation of allPCAAllocationsFlat) {
      const staffRow = allocation.staff
      if (!staffRow?.floating) continue
      const id = String(allocation.staff_id ?? '')
      if (!id) continue
      const remaining = typeof allocation.fte_remaining === 'number' ? allocation.fte_remaining : 0
      byId.set(id, Math.max(byId.get(id) ?? 0, remaining))
    }
    let sum = 0
    byId.forEach((value) => {
      sum += Math.max(0, value)
    })
    return sum
  }, [allPCAAllocationsFlat])

  const overridesSliceCacheRef = useRef<{
    therapist: Partial<Record<Team, OverridesSliceCacheEntry>>
    pca: Partial<Record<Team, OverridesSliceCacheEntry>>
  }>({ therapist: {}, pca: {} })

  const therapistOverridesByTeam = useMemo(() => {
    const prev = overridesSliceCacheRef.current.therapist
    const next = createEmptyTeamRecord<Record<string, StaffOverrideState>>({})

    for (const team of TEAMS) {
      const sourceAllocations = visibleTeams.includes(team)
        ? therapistAllocationsForDisplay[team]
        : therapistAllocations[team]
      const ids = Array.from(new Set((sourceAllocations || []).map((allocation) => allocation.staff_id).filter(Boolean))).sort()
      const idsKey = ids.join('|')

      const cached = prev[team]
      let canReuse = !!cached && cached.idsKey === idsKey
      if (canReuse && cached) {
        for (const id of ids) {
          if (cached.slice[id] !== staffOverrides[id]) {
            canReuse = false
            break
          }
        }
      }

      if (canReuse && cached) {
        next[team] = cached.slice
      } else {
        const slice: Record<string, StaffOverrideState> = {}
        for (const id of ids) {
          const override = staffOverrides[id]
          if (override !== undefined) slice[id] = override
        }
        prev[team] = { idsKey, slice }
        next[team] = slice
      }
    }

    overridesSliceCacheRef.current.therapist = prev
    return next
  }, [visibleTeams, therapistAllocationsForDisplay, therapistAllocations, staffOverrides])

  const extraCoverageByStaffIdForDisplay = useMemo(
    () =>
      deriveExtraCoverageByStaffId({
        selectedDate,
        pcaAllocationsByTeam: pcaAllocationsForUi,
        staff,
        specialPrograms: specialPrograms || [],
        staffOverrides: stripExtraCoverageOverrides(staffOverrides),
        visibleTeams,
        teamContributorsByMain,
        calculations: calculations as Record<Team, ScheduleCalculations | null>,
        mergedInto,
      }),
    [
      selectedDate,
      pcaAllocationsForUi,
      staff,
      specialPrograms,
      staffOverrides,
      visibleTeams,
      teamContributorsByMain,
      calculations,
      mergedInto,
    ]
  )

  const staffOverridesForPcaDisplay = useMemo(
    () =>
      mergeExtraCoverageIntoStaffOverridesForDisplay({
        staffOverrides,
        extraCoverageByStaffId: extraCoverageByStaffIdForDisplay,
        currentStep,
        initializedSteps,
      }),
    [staffOverrides, extraCoverageByStaffIdForDisplay, currentStep, initializedSteps]
  )

  const pcaOverridesByTeam = useMemo(() => {
    const prev = overridesSliceCacheRef.current.pca
    const next = createEmptyTeamRecord<Record<string, StaffOverrideState>>({})

    for (const team of TEAMS) {
      const contributors = new Set<Team>(teamContributorsByMain[team] || [team])
      const sourceAllocations = visibleTeams.includes(team)
        ? pcaAllocationsForDisplay[team]
        : pcaAllocationsForUi[team]
      const ids = Array.from(new Set((sourceAllocations || []).map((allocation) => allocation.staff_id).filter(Boolean))).sort()
      const idsKey = ids.join('|')

      const cached = prev[team]
      let canReuse = !!cached && cached.idsKey === idsKey
      if (canReuse && cached) {
        for (const id of ids) {
          if (cached.slice[id] !== staffOverridesForPcaDisplay[id]) {
            canReuse = false
            break
          }
        }
      }

      if (canReuse && cached) {
        next[team] = cached.slice
      } else {
        const slice: Record<string, StaffOverrideState> = {}
        for (const id of ids) {
          const rawOverride = staffOverridesForPcaDisplay[id]
          if (!rawOverride) continue

          if (!visibleTeams.includes(team)) {
            slice[id] = rawOverride
            continue
          }

          const bySlot = rawOverride.substitutionForBySlot
          const mappedBySlot = bySlot
            ? Object.fromEntries(
                Object.entries(bySlot).map(([slotKey, value]) => {
                  if (!value || !contributors.has(value.team)) return [slotKey, value]
                  return [slotKey, { ...value, team }]
                })
              )
            : bySlot

          const substitutionFor = rawOverride.substitutionFor
          const mappedSubstitutionFor =
            substitutionFor && contributors.has(substitutionFor.team)
              ? { ...substitutionFor, team }
              : substitutionFor

          slice[id] =
            mappedBySlot !== bySlot || mappedSubstitutionFor !== substitutionFor
              ? { ...rawOverride, substitutionForBySlot: mappedBySlot, substitutionFor: mappedSubstitutionFor }
              : rawOverride
        }
        prev[team] = { idsKey, slice }
        next[team] = slice
      }
    }

    overridesSliceCacheRef.current.pca = prev
    return next
  }, [
    visibleTeams,
    pcaAllocationsForDisplay,
    pcaAllocationsForUi,
    staffOverridesForPcaDisplay,
    teamContributorsByMain,
  ])

  const pcaBalanceSanity = useMemo(() => {
    const teamBalances: Array<{ team: Team; assigned: number; target: number; balance: number }> = []
    let positiveSum = 0
    let negativeAbsSum = 0

    for (const team of visibleTeams) {
      const allocationsForTeam = pcaAllocationsForDisplay[team] || []
      let assignedRaw = 0

      allocationsForTeam.forEach((allocation) => {
        const slotsForTeam = getSlotsForTeam(allocation, team)
        if (slotsForTeam.length === 0) return

        const override = staffOverrides[allocation.staff_id]
        const invalidSlotFromArray =
          Array.isArray(override?.invalidSlots) && override.invalidSlots.length > 0
            ? override.invalidSlots[0]?.slot
            : undefined
        const invalidSlot =
          typeof allocation.invalid_slot === 'number'
            ? allocation.invalid_slot
            : typeof override?.invalidSlot === 'number'
              ? override.invalidSlot
              : invalidSlotFromArray

        const validSlotsForTeam = invalidSlot ? slotsForTeam.filter((slot) => slot !== invalidSlot) : slotsForTeam
        const specialProgramSlots =
          Array.isArray(allocation.special_program_ids) &&
          allocation.special_program_ids.length > 0
            ? getAllocationSpecialProgramSlotsForTeam({
                allocation,
                team,
                specialProgramsById: displayViewForCurrentWeekday.getProgramsByAllocationTeam(
                  allocation.team as Team | null | undefined
                ),
              })
            : []
        const regularSlotsForTeam = validSlotsForTeam.filter((slot) => !specialProgramSlots.includes(slot))
        assignedRaw += regularSlotsForTeam.length * 0.25
      })

      const assigned = roundToNearestQuarterWithMidpoint(assignedRaw)
      const target = calculationsForDisplay[team]?.average_pca_per_team ?? 0
      const balance = assigned - target
      if (balance > 0) positiveSum += balance
      if (balance < 0) negativeAbsSum += Math.abs(balance)

      teamBalances.push({ team, assigned, target, balance })
    }

    const netDiff = positiveSum - negativeAbsSum
    const perTeamText = teamBalances
      .map((row) => `${row.team} ${row.balance >= 0 ? '+' : ''}${row.balance.toFixed(2)}`)
      .join(' | ')

    return {
      teamBalances,
      positiveSum,
      negativeAbsSum,
      netDiff,
      perTeamText,
    }
  }, [
    visibleTeams,
    calculationsForDisplay,
    pcaAllocationsForDisplay,
    staffOverrides,
    specialPrograms,
    selectedDate,
    displayViewForCurrentWeekday,
  ])

  return {
    therapistAllocationsForDisplay,
    pcaDisplayAllocationsByTeam,
    pcaAllocationsForDisplay,
    calculationsForDisplay,
    bedCountsOverridesByTeamForDisplay,
    bedRelievingNotesByToTeamForDisplay,
    bedAllocationsForDisplay,
    allPCAAllocationsFlat,
    step3OrderPositionByTeam,
    floatingPoolRemainingFte,
    therapistOverridesByTeam,
    extraCoverageByStaffIdForDisplay,
    staffOverridesForPcaDisplay,
    pcaOverridesByTeam,
    pcaBalanceSanity,
  }
}
