/**
 * Step 3 dialog / fingerprint / bootstrap projection (Schedule page).
 *
 * ## Effect, memo, and ref-sync ordering (spec §6.2 Step 3, §7 items 1/3/4, risk R1)
 *
 * **Render phase — `useMemo` chain (must stay in this relative order):**
 * 1. `reservedSpecialProgramPcaFteForStep3` — weekday + overrides capacity.
 * 2. `displayViewForCurrentWeekday` — SP display/runtime view for slot classification.
 * 3. `existingAllocationsForStep3Dialog` — canonical team merge on raw allocations.
 * 4. `existingAssignedValidForStep3Dialog` → `specialProgramAssignedForStep3Dialog` →
 *    `targetAverageForStep3Dialog` → `existingAssignedForCapForStep3Dialog` — dialog caps/targets.
 * 5. `step3NonFloatingFteBreakdownForDialog` — non-floating FTE breakdown input to bootstrap.
 * 6. `staffByIdForStepDependencies` — stable staff map for fingerprinting.
 * 7. `step3DependencyFingerprint` — Step 2 → Step 3 invalidation input snapshot.
 * 8. `step4DependencyFingerprint` — adjacent fingerprint memo (declared next so Step 4 ref sync
 *    follows the same commit as Step 3; keeps prior monolith declaration order).
 * 9. `step3BootstrapSummary` / `step3BootstrapSummaryV2` / `step3ProjectionV2` — **single** projection path;
 *    dashboard Avg PCA/team reads `displayTargetByTeam` only via `getStep3AveragePcaDisplayTargets`.
 * 10. `step3DashboardAvgPcaDisplayByTeam` → `pendingPCAFTEForStep3Dialog` — derived dialog pending.
 *
 * **Layout commit — `useLayoutEffect` (runs after DOM mutation, before paint; order matters):**
 * 11. Sync `latestStep3DependencyFingerprintRef` from `step3DependencyFingerprint` (JSON string).
 * 12. Sync `latestStep4DependencyFingerprintRef` from `step4DependencyFingerprint`.
 *    Step 2 `flushSync` finalize paths assume these refs match the **post-edit** memos in the same
 *    commit as the layout effects above (do not move ref sync to `useEffect`).
 *
 * Parent `SchedulePageContent` continues with Step 2 buffered-toast and other memos **after** this
 * hook returns; do not insert unrelated memos/effects between this hook and its caller’s next hooks
 * if those hooks consumed Step 3 fingerprint refs mid-commit.
 */

import { useLayoutEffect, useMemo, type MutableRefObject } from 'react'
import type { Team, Staff, Weekday } from '@/types/staff'
import type { PCAAllocation, ScheduleCalculations, TherapistAllocation } from '@/types/schedule'
import type { PCAData } from '@/lib/algorithms/pcaAllocation'
import type { SpecialProgram } from '@/types/allocation'
import { computeReservedSpecialProgramPcaFte } from '@/lib/utils/specialProgramPcaCapacity'
import { buildDisplayViewForWeekday } from '@/lib/utils/scheduleRuntimeProjection'
import { getWeekday } from '@/lib/features/schedule/date'
import {
  buildStep3ProjectionV2FromBootstrapSummary,
  buildStep3ProjectionVersionKey,
  computeStep3BootstrapSummary,
  computeStep3NonFloatingFteBreakdownByTeamFromAllocations,
  getStep3AveragePcaDisplayTargets,
  type Step3BootstrapSummary,
  type Step3ProjectionV2,
} from '@/lib/features/schedule/step3Bootstrap'
import type { Step3DialogSurface } from '@/lib/features/schedule/step3DialogFlow'
import { getMainTeam } from '@/lib/utils/teamMerge'
import { buildStaffByIdMap } from '@/lib/features/schedule/grouping'
import { isAllocationSlotFromSpecialProgram } from '@/lib/utils/scheduleReservationRuntime'
import { createEmptyTeamRecord } from '@/lib/utils/types'
import { TEAMS } from '@/lib/features/schedule/constants'
import { buildStep3DependencyFingerprint, type Step2ResultSurplusProjection } from './useStep3DialogProjectionTypes'

function jsonFingerprint(value: unknown): string {
  return JSON.stringify(value)
}

function buildPtPerTeamFingerprint(args: {
  therapistAllocations: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  teams?: Team[]
}): Record<Team, number> {
  const teams = args.teams ?? TEAMS
  const out = createEmptyTeamRecord<number>(0)
  teams.forEach((team) => {
    out[team] = Number(
      (args.therapistAllocations[team] || [])
        .reduce((sum, allocation) => sum + (allocation.fte_therapist ?? 0), 0)
        .toFixed(2)
    )
  })
  return out
}

export type UseStep3DialogProjectionArgs = {
  latestStep3DependencyFingerprintRef: MutableRefObject<string>
  latestStep4DependencyFingerprintRef: MutableRefObject<string>
  therapistAllocations: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  selectedDate: Date
  specialPrograms: SpecialProgram[] | null | undefined
  staffOverrides: Record<string, unknown>
  staff: Staff[]
  bufferStaff: Staff[]
  existingAllocationsForStep3: PCAAllocation[]
  floatingPCAsForStep3: PCAData[]
  visibleTeams: Team[]
  teamContributorsByMain: Partial<Record<Team, Team[]>>
  calculations: Record<Team, ScheduleCalculations | null | undefined>
  mergedInto: Partial<Record<Team, Team>>
  step2Result: unknown
  step3DialogSurface: Step3DialogSurface
  pendingPCAFTEPerTeam: Record<Team, number> | null | undefined
  currentWeekday: Weekday
}

export type UseStep3DialogProjectionResult = {
  displayViewForCurrentWeekday: ReturnType<typeof buildDisplayViewForWeekday>
  reservedSpecialProgramPcaFteForStep3: number
  existingAllocationsForStep3Dialog: PCAAllocation[]
  step3BootstrapSummary: Step3BootstrapSummary
  step3BootstrapSummaryV2: Step3BootstrapSummary
  step3ProjectionV2: Step3ProjectionV2
  step3DashboardAvgPcaDisplayByTeam: Partial<Record<Team, number>> | null
  pendingPCAFTEForStep3Dialog: Record<Team, number>
}

export function useStep3DialogProjection(args: UseStep3DialogProjectionArgs): UseStep3DialogProjectionResult {
  const {
    latestStep3DependencyFingerprintRef,
    latestStep4DependencyFingerprintRef,
    therapistAllocations,
    selectedDate,
    specialPrograms,
    staffOverrides,
    staff,
    bufferStaff,
    existingAllocationsForStep3,
    floatingPCAsForStep3,
    visibleTeams,
    teamContributorsByMain,
    calculations,
    mergedInto,
    step2Result,
    step3DialogSurface,
    pendingPCAFTEPerTeam,
    currentWeekday,
  } = args

  const reservedSpecialProgramPcaFteForStep3 = useMemo(
    () =>
      computeReservedSpecialProgramPcaFte({
        specialPrograms: specialPrograms ?? [],
        weekday: currentWeekday,
        staffOverrides: staffOverrides as Record<string, any>,
      }),
    [currentWeekday, specialPrograms, staffOverrides]
  )

  const displayViewForCurrentWeekday = useMemo(
    () =>
      buildDisplayViewForWeekday({
        weekday: getWeekday(selectedDate),
        specialPrograms: specialPrograms as any,
        staffOverrides: staffOverrides as any,
      }),
    [selectedDate, specialPrograms, staffOverrides]
  )

  const existingAllocationsForStep3Dialog = useMemo(() => {
    const canonical = (value: Team | null | undefined): Team | null => {
      if (!value) return null
      return getMainTeam(value, mergedInto)
    }
    return existingAllocationsForStep3.map((alloc) => ({
      ...alloc,
      team: canonical(alloc.team as Team | null) ?? alloc.team,
      slot1: canonical(alloc.slot1 as Team | null),
      slot2: canonical(alloc.slot2 as Team | null),
      slot3: canonical(alloc.slot3 as Team | null),
      slot4: canonical(alloc.slot4 as Team | null),
    }))
  }, [existingAllocationsForStep3, mergedInto])

  const existingAssignedValidForStep3Dialog = useMemo(() => {
    const out = createEmptyTeamRecord<number>(0)
    for (const alloc of existingAllocationsForStep3Dialog) {
      const invalidSlot = (alloc as any)?.invalid_slot as number | undefined
      const add = (slot: 1 | 2 | 3 | 4, team: Team | null) => {
        if (!team) return
        if (invalidSlot === slot) return
        out[team] = (out[team] || 0) + 0.25
      }
      add(1, alloc.slot1 ?? null)
      add(2, alloc.slot2 ?? null)
      add(3, alloc.slot3 ?? null)
      add(4, alloc.slot4 ?? null)
    }
    return out
  }, [existingAllocationsForStep3Dialog])

  const specialProgramAssignedForStep3Dialog = useMemo(() => {
    const out = createEmptyTeamRecord<number>(0)

    for (const alloc of existingAllocationsForStep3Dialog) {
      const ids = (alloc as any)?.special_program_ids
      if (!Array.isArray(ids) || ids.length === 0) continue
      const specialProgramsById = displayViewForCurrentWeekday.getProgramsByAllocationTeam(alloc.team as Team | null | undefined)

      const add = (slot: 1 | 2 | 3 | 4, team: Team | null) => {
        if (!team) return
        if (!isAllocationSlotFromSpecialProgram({ allocation: alloc, slot, team, specialProgramsById })) return
        out[team] = (out[team] || 0) + 0.25
      }
      add(1, alloc.slot1 ?? null)
      add(2, alloc.slot2 ?? null)
      add(3, alloc.slot3 ?? null)
      add(4, alloc.slot4 ?? null)

      const inv = (alloc as any)?.invalid_slot as 1 | 2 | 3 | 4 | null | undefined
      if (inv === 1 || inv === 2 || inv === 3 || inv === 4) {
        const invTeam = (inv === 1 ? alloc.slot1 : inv === 2 ? alloc.slot2 : inv === 3 ? alloc.slot3 : alloc.slot4) as Team | null
        if (
          invTeam &&
          isAllocationSlotFromSpecialProgram({
            allocation: alloc,
            slot: inv,
            team: invTeam,
            specialProgramsById,
          })
        ) {
          out[invTeam] = Math.max(0, (out[invTeam] || 0) - 0.25)
        }
      }
    }

    return out
  }, [existingAllocationsForStep3Dialog, displayViewForCurrentWeekday])

  const targetAverageForStep3Dialog = useMemo(() => {
    const out = createEmptyTeamRecord<number>(0)
    visibleTeams.forEach((mainTeam) => {
      const contributors = teamContributorsByMain[mainTeam] || [mainTeam]
      out[mainTeam] = contributors.reduce((sum, team) => sum + (calculations[team]?.average_pca_per_team || 0), 0)
    })
    return out
  }, [visibleTeams, teamContributorsByMain, calculations])

  const existingAssignedForCapForStep3Dialog = useMemo(() => {
    const out = createEmptyTeamRecord<number>(0)
    visibleTeams.forEach((mainTeam) => {
      const rawAssignedForCap = existingAssignedValidForStep3Dialog[mainTeam] || 0
      const specialAssignedForCap = specialProgramAssignedForStep3Dialog[mainTeam] || 0
      out[mainTeam] = Math.max(0, rawAssignedForCap - specialAssignedForCap)
    })
    return out
  }, [visibleTeams, existingAssignedValidForStep3Dialog, specialProgramAssignedForStep3Dialog])

  const step3NonFloatingFteBreakdownForDialog = useMemo(
    () =>
      computeStep3NonFloatingFteBreakdownByTeamFromAllocations({
        existingAllocations: existingAllocationsForStep3Dialog,
        staff: [...staff, ...bufferStaff],
        specialPrograms: specialPrograms as any,
        weekday: getWeekday(selectedDate),
        staffOverrides,
        canonicalSlotTeam: (t) => (t ? getMainTeam(t, mergedInto) : null),
      }),
    [
      existingAllocationsForStep3Dialog,
      staff,
      bufferStaff,
      specialPrograms,
      selectedDate,
      staffOverrides,
      mergedInto,
    ]
  )

  const staffByIdForStepDependencies = useMemo(
    () => buildStaffByIdMap([...staff, ...bufferStaff]),
    [staff, bufferStaff]
  )

  const step3DependencyFingerprint = useMemo(
    () =>
      buildStep3DependencyFingerprint({
        visibleTeams,
        teamTargetsByTeam: targetAverageForStep3Dialog,
        existingAssignedByTeam: existingAssignedForCapForStep3Dialog,
        reservedSpecialProgramPcaFte: reservedSpecialProgramPcaFteForStep3,
        floatingPCAs: floatingPCAsForStep3,
        existingAllocations: existingAllocationsForStep3Dialog,
        staffById: staffByIdForStepDependencies,
      }),
    [
      visibleTeams,
      targetAverageForStep3Dialog,
      existingAssignedForCapForStep3Dialog,
      reservedSpecialProgramPcaFteForStep3,
      floatingPCAsForStep3,
      existingAllocationsForStep3Dialog,
      staffByIdForStepDependencies,
    ]
  )

  const step4DependencyFingerprint = useMemo(
    () => buildPtPerTeamFingerprint({ therapistAllocations }),
    [therapistAllocations]
  )

  // Keep refs in sync during commit (useLayoutEffect), not after paint (useEffect).
  // Step 2 apply paths use flushSync + synchronous finalize so fingerprint refs match the post-edit
  // snapshot; queueMicrotask alone can run before React commits, leaving stale refs and empty deltas.
  useLayoutEffect(() => {
    latestStep3DependencyFingerprintRef.current = jsonFingerprint(step3DependencyFingerprint)
  }, [step3DependencyFingerprint])

  useLayoutEffect(() => {
    latestStep4DependencyFingerprintRef.current = jsonFingerprint(step4DependencyFingerprint)
  }, [step4DependencyFingerprint])

  const step3BootstrapSummary = useMemo(
    () =>
      computeStep3BootstrapSummary({
        teams: visibleTeams,
        teamTargets: targetAverageForStep3Dialog,
        existingTeamPCAAssigned: existingAssignedForCapForStep3Dialog,
        floatingPCAs: floatingPCAsForStep3,
        existingAllocations: existingAllocationsForStep3Dialog,
        staffOverrides,
        reservedSpecialProgramPcaFte: reservedSpecialProgramPcaFteForStep3,
        nonFloatingFteBreakdownByTeam: step3NonFloatingFteBreakdownForDialog,
      }),
    [
      visibleTeams,
      targetAverageForStep3Dialog,
      existingAssignedForCapForStep3Dialog,
      floatingPCAsForStep3,
      existingAllocationsForStep3Dialog,
      staffOverrides,
      reservedSpecialProgramPcaFteForStep3,
      step3NonFloatingFteBreakdownForDialog,
    ]
  )

  const step3BootstrapSummaryV2 = useMemo(
    () =>
      computeStep3BootstrapSummary({
        teams: visibleTeams,
        teamTargets: targetAverageForStep3Dialog,
        existingTeamPCAAssigned: existingAssignedForCapForStep3Dialog,
        floatingPCAs: floatingPCAsForStep3,
        existingAllocations: existingAllocationsForStep3Dialog,
        staffOverrides,
        reservedSpecialProgramPcaFte: reservedSpecialProgramPcaFteForStep3,
        floatingPcaAllocationVersion: 'v2',
        rawAveragePCAPerTeamByTeam: (step2Result as Step2ResultSurplusProjection | null)?.rawAveragePCAPerTeam,
        nonFloatingFteBreakdownByTeam: step3NonFloatingFteBreakdownForDialog,
      }),
    [
      visibleTeams,
      targetAverageForStep3Dialog,
      existingAssignedForCapForStep3Dialog,
      floatingPCAsForStep3,
      existingAllocationsForStep3Dialog,
      staffOverrides,
      reservedSpecialProgramPcaFteForStep3,
      step2Result,
      step3NonFloatingFteBreakdownForDialog,
    ]
  )

  const step3ProjectionV2 = useMemo(() => {
    const projectionVersion = buildStep3ProjectionVersionKey({
      teams: visibleTeams,
      teamTargets: targetAverageForStep3Dialog,
      existingTeamPCAAssigned: existingAssignedForCapForStep3Dialog,
      floatingPCAs: floatingPCAsForStep3,
      existingAllocations: existingAllocationsForStep3Dialog,
      staffOverrides,
      reservedSpecialProgramPcaFte: reservedSpecialProgramPcaFteForStep3,
      floatingPcaAllocationVersion: 'v2',
      rawAveragePCAPerTeamByTeam: (step2Result as Step2ResultSurplusProjection | null)?.rawAveragePCAPerTeam,
    })
    return buildStep3ProjectionV2FromBootstrapSummary(step3BootstrapSummaryV2, { projectionVersion })
  }, [
    step3BootstrapSummaryV2,
    visibleTeams,
    targetAverageForStep3Dialog,
    existingAssignedForCapForStep3Dialog,
    floatingPCAsForStep3,
    existingAllocationsForStep3Dialog,
    staffOverrides,
    reservedSpecialProgramPcaFteForStep3,
    step2Result,
  ])

  const step3DashboardAvgPcaDisplayByTeam = useMemo(() => {
    const partial = getStep3AveragePcaDisplayTargets(step3ProjectionV2)
    if (!partial) return null
    const next: Partial<Record<Team, number>> = {}
    for (const team of TEAMS) {
      const v = partial[team]
      if (typeof v === 'number' && Number.isFinite(v)) {
        next[team] = v
      }
    }
    return Object.keys(next).length ? next : null
  }, [step3ProjectionV2])

  const pendingPCAFTEForStep3Dialog = useMemo(() => {
    const out = createEmptyTeamRecord<number>(0)
    visibleTeams.forEach((mainTeam) => {
      const displayedTarget = step3BootstrapSummary.teamTargets[mainTeam] || 0
      const recomputedPending =
        step3DialogSurface === 'v2-ranked'
          ? step3BootstrapSummaryV2.pendingByTeam[mainTeam] || 0
          : step3BootstrapSummary.pendingByTeam[mainTeam] || 0

      // Fallback for early hydration / missing calculations: preserve legacy pending source.
      const contributors = teamContributorsByMain[mainTeam] || [mainTeam]
      const pendingFromState = contributors.reduce((sum, team) => sum + (pendingPCAFTEPerTeam?.[team] || 0), 0)
      out[mainTeam] = displayedTarget > 0 ? recomputedPending : pendingFromState
    })
    return out
  }, [
    visibleTeams,
    teamContributorsByMain,
    step3BootstrapSummary,
    step3BootstrapSummaryV2,
    step3DialogSurface,
    pendingPCAFTEPerTeam,
  ])

  return {
    displayViewForCurrentWeekday,
    reservedSpecialProgramPcaFteForStep3,
    existingAllocationsForStep3Dialog,
    step3BootstrapSummary,
    step3BootstrapSummaryV2,
    step3ProjectionV2,
    step3DashboardAvgPcaDisplayByTeam,
    pendingPCAFTEForStep3Dialog,
  }
}
