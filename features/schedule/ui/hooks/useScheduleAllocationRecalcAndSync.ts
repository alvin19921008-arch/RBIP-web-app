'use client'

/**
 * Allocation recalculation (`recalculateScheduleCalculations`), its dependent `useEffect` cluster,
 * and `useAllocationSync` — extracted from `SchedulePageContent` (Round 3 / R3-22).
 *
 * ## Hook registration order vs `SchedulePageClient` neighbors (do not reorder casually)
 *
 * `SchedulePageContent` calls, in order:
 * 1. `useMainPaneLoadAndHydrateDateEffect` — passes `invokeRecalculateForMainLoad` wired to
 *    `recalculateScheduleCalculationsForLoadRef` (ref filled inside `useScheduleAllocationRecalcAndSync`).
 * 2. `useEffect` — defer below-the-fold heavy UI.
 * 3. **`useSchedulePaneHydrationEndForRecalcCluster`** (this module) — must stay **before** the legacy
 *    “BASE DATA regeneration” `useEffect` (~2086) and calendar/holiday effects so downstream hooks
 *    (e.g. `useAllocationSync` TRIGGER2) still observe `isHydratingSchedule === true` during load-driven
 *    `currentStep` / `staffOverrides` updates (see inline comment in `SchedulePageClient`).
 * 4. …intermediate hooks (dates, prefetch, `useScheduleDateTransition`, staff load, merge config, wards, …)…
 * 5. **`useScheduleAllocationRecalcAndSync`** (this module) — runs **after** `wardsByTeam`,
 *    `designatedWardsByTeam`, and `totalBedsAllTeams` memos; registers, in order:
 *    - `recalculateScheduleCalculations` (`useCallback`)
 *    - synchronous `recalculateScheduleCalculationsForLoadRef.current = …`
 *    - auto-recalc on allocation change `useEffect`
 *    - persisted-calculations stale repair `useEffect`
 *    - avg PCA / reserved-slot repair `useEffect`
 *    - bed overrides + dynamic `allocateBeds` / `setBedAllocations` `useEffect`
 *    - `useAllocationSync`
 */

import { useCallback, useEffect, useRef } from 'react'
import type { Team, Staff } from '@/types/staff'
import type {
  TherapistAllocation,
  PCAAllocation,
  ScheduleCalculations,
  StepStatus,
  BedAllocation,
} from '@/types/schedule'
import type { SpecialProgram, SPTAllocation } from '@/types/allocation'
import type { WardForScheduleBedMath } from '@/lib/features/schedule/bedMath'
import type { ScheduleWardRow } from '@/lib/features/schedule/controller/scheduleControllerTypes'
import { computeBedsDesignatedByTeam, computeBedsForRelieving } from '@/lib/features/schedule/bedMath'
import { getWeekday, formatDateForInput } from '@/lib/features/schedule/date'
import { computeDrmAddOnFte, computeReservedSpecialProgramPcaFte } from '@/lib/utils/specialProgramPcaCapacity'
import { createEmptyTeamRecordFactory } from '@/lib/utils/types'
import { getContributingTeams, getMainTeam } from '@/lib/utils/teamMerge'
import type { BedAllocationContext } from '@/lib/algorithms/bedAllocation'
import { useAllocationSync, type StaffOverrides } from '@/lib/hooks/useAllocationSync'
import { useSchedulePaneHydrationEndEffect } from '@/features/schedule/ui/hooks/useSchedulePaneHydration'
import type { BedCountsOverridesByTeam } from '@/lib/features/schedule/controller/scheduleControllerTypes'

export function useSchedulePaneHydrationEndForRecalcCluster(
  input: Parameters<typeof useSchedulePaneHydrationEndEffect>[0]
): void {
  useSchedulePaneHydrationEndEffect(input)
}

export type RecalculateScheduleCalculationsOptions = {
  allowDuringHydration?: boolean
  forceWithoutAllocations?: boolean
  source?: {
    pcaAllocations?: Record<Team, (PCAAllocation & { staff: Staff })[]>
    therapistAllocations?: Record<Team, (TherapistAllocation & { staff: Staff })[]>
    staffOverrides?: StaffOverrides
  }
}

export type UseScheduleAllocationRecalcAndSyncParams = {
  recalculateScheduleCalculationsForLoadRef: React.MutableRefObject<
    ((opts?: RecalculateScheduleCalculationsOptions) => void) | null
  >
  pcaAllocations: Record<Team, (PCAAllocation & { staff: Staff })[]>
  therapistAllocations: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  staffOverrides: StaffOverrides
  wardsForRecalculation: WardForScheduleBedMath[]
  wardsByTeam: Record<Team, WardForScheduleBedMath[]>
  designatedWardsByTeam: Record<Team, string[]>
  totalBedsAllTeams: number
  bedCountsOverridesByTeam: BedCountsOverridesByTeam
  selectedDate: Date
  specialPrograms: SpecialProgram[]
  staff: Staff[]
  currentStep: string
  recalculationTeams: Team[]
  teamMergeMergedInto: Partial<Record<Team, Team>>
  hasLoadedStoredCalculations: boolean
  isHydratingSchedule: boolean
  setCalculations: React.Dispatch<React.SetStateAction<Record<Team, ScheduleCalculations | null>>>
  calculations: Record<Team, ScheduleCalculations | null>
  loading: boolean
  wards: ScheduleWardRow[]
  stepStatus: Record<string, StepStatus>
  setBedAllocations: React.Dispatch<React.SetStateAction<BedAllocation[]>>
  setTherapistAllocations: React.Dispatch<
    React.SetStateAction<Record<Team, (TherapistAllocation & { staff: Staff })[]>>
  >
  sptAllocations: SPTAllocation[]
  initializedSteps: Set<string>
}

export function useScheduleAllocationRecalcAndSync(
  params: UseScheduleAllocationRecalcAndSyncParams
): { recalculateScheduleCalculations: (opts?: RecalculateScheduleCalculationsOptions) => void } {
  const {
    recalculateScheduleCalculationsForLoadRef,
    pcaAllocations,
    therapistAllocations,
    staffOverrides,
    wardsForRecalculation,
    wardsByTeam,
    designatedWardsByTeam,
    totalBedsAllTeams,
    bedCountsOverridesByTeam,
    selectedDate,
    specialPrograms,
    staff,
    currentStep,
    recalculationTeams,
    teamMergeMergedInto,
    hasLoadedStoredCalculations,
    isHydratingSchedule,
    setCalculations,
    calculations,
    loading,
    wards,
    stepStatus,
    setBedAllocations,
    setTherapistAllocations,
    sptAllocations,
    initializedSteps,
  } = params

  const calcStaleRepairAttemptedDateRef = useRef<string | null>(null)
  const avgPcaTargetRepairAttemptedDateRef = useRef<string | null>(null)

  const recalculateScheduleCalculations = useCallback(
    (opts?: RecalculateScheduleCalculationsOptions) => {
      const sourcePcaAllocations = opts?.source?.pcaAllocations ?? pcaAllocations
      const sourceTherapistAllocations = opts?.source?.therapistAllocations ?? therapistAllocations
      const sourceStaffOverrides = opts?.source?.staffOverrides ?? staffOverrides

      // Prevent recalculation churn during initial hydration if we already loaded stored calculations.
      if (hasLoadedStoredCalculations && isHydratingSchedule && !opts?.allowDuringHydration) {
        return
      }
      // In step 1, we need to recalculate even without allocations to show updated PT/team, avg PCA/team, bed/team
      // In other steps, we still need allocations to exist
      const hasAllocations = Object.keys(sourcePcaAllocations).some(
        (team) => sourcePcaAllocations[team as Team]?.length > 0
      )
      if (!hasAllocations && currentStep !== 'leave-fte' && !opts?.forceWithoutAllocations) {
        return
      }

      // Build PCA allocations by team (reuse existing pcaAllocations state)
      const pcaByTeam = sourcePcaAllocations

      // Build therapist allocations by team
      // In step 1 with no allocations, build from staff data
      let therapistByTeam: Record<Team, (TherapistAllocation & { staff: Staff })[]>
      if (!hasAllocations && currentStep === 'leave-fte') {
        // Build therapist allocations from staff data for step 1
        therapistByTeam = {
          FO: [],
          SMM: [],
          SFM: [],
          CPPC: [],
          MC: [],
          GMC: [],
          NSM: [],
          DRO: [],
        }
        staff.forEach((s) => {
          if (['SPT', 'APPT', 'RPT'].includes(s.rank)) {
            const override = sourceStaffOverrides[s.id]
            const fte = override?.fteRemaining ?? 1.0
            if (fte > 0 && s.team) {
              const effectiveTeam = getMainTeam(s.team, teamMergeMergedInto)
              // Create a minimal allocation object for calculation purposes
              const alloc: TherapistAllocation & { staff: Staff } = {
                id: '',
                schedule_id: '',
                staff_id: s.id,
                team: effectiveTeam,
                fte_therapist: fte,
                fte_remaining: 1.0 - fte,
                slot_whole: null,
                slot1: null,
                slot2: null,
                slot3: null,
                slot4: null,
                leave_type: override?.leaveType ?? null,
                special_program_ids: null,
                is_substitute_team_head: false,
                spt_slot_display: null,
                is_manual_override: false,
                manual_override_note: null,
                staff: s,
              }
              therapistByTeam[effectiveTeam].push(alloc)
            }
          }
        })
      } else {
        // Reuse existing therapistAllocations state
        therapistByTeam = sourceTherapistAllocations
      }

      const pcaByTeamForCalc = createEmptyTeamRecordFactory<(PCAAllocation & { staff: Staff })[]>(() => [])
      const therapistByTeamForCalc = createEmptyTeamRecordFactory<(TherapistAllocation & { staff: Staff })[]>(() => [])
      recalculationTeams.forEach((mainTeam) => {
        const contributors = getContributingTeams(mainTeam, teamMergeMergedInto)
        pcaByTeamForCalc[mainTeam] = contributors.flatMap((team) => pcaByTeam[team] || [])
        therapistByTeamForCalc[mainTeam] = contributors.flatMap((team) => therapistByTeam[team] || [])
      })

      // Reuse the calculation logic from applySavedAllocations
      // CRITICAL: Use staffOverrides for current FTE values (not stale alloc.fte_therapist)
      const totalPTOnDutyAllTeams = recalculationTeams.reduce((sum, team) => {
        return (
          sum +
          therapistByTeamForCalc[team].reduce((teamSum, alloc) => {
            const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
            // Use staffOverrides for current FTE, fallback to alloc.fte_therapist
            const overrideFTE = sourceStaffOverrides[alloc.staff_id]?.fteRemaining
            const currentFTE = overrideFTE !== undefined ? overrideFTE : alloc.fte_therapist || 0
            const hasFTE = currentFTE > 0
            return teamSum + (isTherapist && hasFTE ? currentFTE : 0)
          }, 0)
        )
      }, 0)

      // IMPORTANT: Use EFFECTIVE total beds (after SHS/Student deductions) for relieving calculations.
      // Otherwise the global sum of bedsForRelieving becomes positive (e.g. +15) and Block 3 cannot match Block 5.
      const ptPerTeamByTeam: Record<Team, number> = { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }

      recalculationTeams.forEach((team) => {
        const ptPerTeam = therapistByTeamForCalc[team].reduce((sum, alloc) => {
          const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
          // Use staffOverrides for current FTE, fallback to alloc.fte_therapist
          const overrideFTE = sourceStaffOverrides[alloc.staff_id]?.fteRemaining
          const currentFTE = overrideFTE !== undefined ? overrideFTE : alloc.fte_therapist || 0
          const hasFTE = currentFTE > 0
          return sum + (isTherapist && hasFTE ? currentFTE : 0)
        }, 0)
        ptPerTeamByTeam[team] = ptPerTeam
      })

      const { bedsDesignatedByTeam, totalBedsEffectiveAllTeams } = computeBedsDesignatedByTeam({
        teams: recalculationTeams,
        wards: wardsForRecalculation,
        bedCountsOverridesByTeam,
      })
      const { bedsForRelieving, overallBedsPerPT } = computeBedsForRelieving({
        teams: recalculationTeams,
        bedsDesignatedByTeam,
        totalBedsEffectiveAllTeams,
        totalPTByTeam: ptPerTeamByTeam,
      })

      // Calculate totals for PCA formulas using ALL on-duty PCAs from staff database
      // This ensures the requirement (Avg PCA/team) is CONSISTENT regardless of allocation state
      const totalPCAOnDuty = staff
        .filter((s) => s.rank === 'PCA')
        .reduce((sum, s) => {
          const overrideFTE = sourceStaffOverrides[s.id]?.fteRemaining
          // For buffer staff, use buffer_fte as base
          const isBufferStaff = s.status === 'buffer'
          const baseFTE = isBufferStaff && s.buffer_fte !== undefined ? s.buffer_fte : 1.0
          // Use override FTE if set, otherwise default to baseFTE (or 0 if on leave)
          const isOnLeave = sourceStaffOverrides[s.id]?.leaveType && sourceStaffOverrides[s.id]?.fteRemaining === 0
          const currentFTE = overrideFTE !== undefined ? overrideFTE : isOnLeave ? 0 : baseFTE
          return sum + currentFTE
        }, 0)
      // Keep the old calculation for comparison in logs
      const seenPCAIds = new Set<string>()
      const totalPCAFromAllocations = recalculationTeams.reduce((sum, team) => {
        return (
          sum +
          pcaByTeamForCalc[team].reduce((teamSum, alloc) => {
            if (seenPCAIds.has(alloc.staff_id)) return teamSum
            seenPCAIds.add(alloc.staff_id)
            const overrideFTE = sourceStaffOverrides[alloc.staff_id]?.fteRemaining
            const currentFTE = overrideFTE !== undefined ? overrideFTE : alloc.fte_pca || 0
            return teamSum + currentFTE
          }, 0)
        )
      }, 0)
      // Use totalPCAOnDuty (from staff DB) for consistent requirements
      const bedsPerPCA = totalPCAOnDuty > 0 ? totalBedsEffectiveAllTeams / totalPCAOnDuty : 0

      // Excel semantics: Avg PCA/team uses the PCA pool *after* reserving special-program slots.
      // Important: derive reserved FTE from required slots (incl. Step 2.0 overrides), not from allocations.
      const weekdayKey = getWeekday(selectedDate)
      const reservedSpecialProgramPcaFte = computeReservedSpecialProgramPcaFte({
        specialPrograms,
        weekday: weekdayKey,
        staffOverrides: sourceStaffOverrides,
      })
      const drmAddOnFte = computeDrmAddOnFte({
        specialPrograms,
        weekday: weekdayKey,
        staffOverrides: sourceStaffOverrides,
        defaultAddOn: 0.4,
      })

      // DRM add-on is intended as "earmarked capacity" (Excel semantics):
      // - take it out of the base pool before distributing Avg PCA/team across teams
      // - then add it back to DRO as "Final PCA/team"
      const effectiveTotalPCAForAvg = Math.max(0, totalPCAOnDuty - reservedSpecialProgramPcaFte - drmAddOnFte)

      const scheduleCalcs: Record<Team, ScheduleCalculations | null> = {
        FO: null,
        SMM: null,
        SFM: null,
        CPPC: null,
        MC: null,
        GMC: null,
        NSM: null,
        DRO: null,
      }

      recalculationTeams.forEach((team) => {
        const teamWards = wardsByTeam[team] || []
        const totalBedsDesignated = bedsDesignatedByTeam[team] ?? 0
        const designatedWards = designatedWardsByTeam[team] || []

        const teamTherapists = therapistByTeamForCalc[team]
        const ptPerTeam = teamTherapists.reduce((sum, alloc) => {
          const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
          // Use staffOverrides for current FTE, fallback to alloc.fte_therapist
          const overrideFTE = sourceStaffOverrides[alloc.staff_id]?.fteRemaining
          const currentFTE = overrideFTE !== undefined ? overrideFTE : alloc.fte_therapist || 0
          const hasFTE = currentFTE > 0
          return sum + (isTherapist && hasFTE ? currentFTE : 0)
        }, 0)

        const bedsPerPT = ptPerTeam > 0 ? totalBedsDesignated / ptPerTeam : 0

        const teamPCAs = pcaByTeamForCalc[team]
        const pcaOnDuty = teamPCAs.reduce((sum, alloc) => {
          const overrideFTE = sourceStaffOverrides[alloc.staff_id]?.fteRemaining
          const currentFTE = overrideFTE !== undefined ? overrideFTE : alloc.fte_pca || 0
          return sum + currentFTE
        }, 0)
        const totalPTPerPCA = pcaOnDuty > 0 ? ptPerTeam / pcaOnDuty : 0

        // Avg PCA/team is based on the effective PCA pool after reserving special-program slots.
        const baseAveragePCAPerTeam =
          totalPTOnDutyAllTeams > 0
            ? (ptPerTeam * effectiveTotalPCAForAvg) / totalPTOnDutyAllTeams
            : effectiveTotalPCAForAvg / Math.max(1, recalculationTeams.length)

        const expectedBedsPerTeam =
          totalPTOnDutyAllTeams > 0 ? (totalBedsEffectiveAllTeams / totalPTOnDutyAllTeams) * ptPerTeam : 0
        const requiredPCAPerTeam = bedsPerPCA > 0 ? expectedBedsPerTeam / bedsPerPCA : 0

        // DRM: add-on applies to DRO only (final = base + add-on).
        const isDrmActive = team === 'DRO' && drmAddOnFte > 0
        const finalAveragePCAPerTeam = team === 'DRO' ? baseAveragePCAPerTeam + drmAddOnFte : baseAveragePCAPerTeam

        scheduleCalcs[team] = {
          id: '',
          schedule_id: '',
          team,
          designated_wards: designatedWards,
          total_beds_designated: totalBedsDesignated,
          total_beds: totalBedsAllTeams,
          total_pt_on_duty: totalPTOnDutyAllTeams,
          beds_per_pt: bedsPerPT,
          pt_per_team: ptPerTeam,
          beds_for_relieving: bedsForRelieving[team],
          pca_on_duty: pcaOnDuty,
          total_pt_per_pca: totalPTPerPCA,
          total_pt_per_team: ptPerTeam,
          average_pca_per_team: finalAveragePCAPerTeam,
          base_average_pca_per_team: isDrmActive ? baseAveragePCAPerTeam : undefined,
          expected_beds_per_team: expectedBedsPerTeam,
          required_pca_per_team: requiredPCAPerTeam,
        }
      })

      setCalculations(scheduleCalcs)
    },
    [
      pcaAllocations,
      therapistAllocations,
      staffOverrides,
      wardsForRecalculation,
      wardsByTeam,
      designatedWardsByTeam,
      totalBedsAllTeams,
      bedCountsOverridesByTeam,
      selectedDate,
      specialPrograms,
      staff,
      currentStep,
      recalculationTeams,
      teamMergeMergedInto,
    ]
  )

  recalculateScheduleCalculationsForLoadRef.current =
    recalculateScheduleCalculations as unknown as (opts?: {
      allowDuringHydration?: boolean
      forceWithoutAllocations?: boolean
      source?: unknown
    }) => void

  // Auto-recalculate when allocations change (e.g., after Step 2 algo, therapist transfer)
  useEffect(() => {
    // During initial hydration, never recalculate (prevents progressive avg PCA/team changes).
    if (isHydratingSchedule) {
      return
    }
    // Recalculate when therapistAllocations or pcaAllocations change. Do NOT skip when
    // hasLoadedStoredCalculations: in-memory edits (e.g. therapist drag transfer) update
    // allocations but stored calculations reflect load-time state, so we must recompute.
    const hasAllocations = Object.keys(pcaAllocations).some((team) => pcaAllocations[team as Team]?.length > 0)
    if (hasAllocations) {
      recalculateScheduleCalculations()
    }
  }, [therapistAllocations, pcaAllocations, recalculateScheduleCalculations, hasLoadedStoredCalculations, isHydratingSchedule])

  // Guardrail: persisted calculations can occasionally be stale (all expected_beds_per_team = 0)
  // while live PT and effective beds are non-zero. Recompute once per date to repair Block 6.
  useEffect(() => {
    if (!hasLoadedStoredCalculations) return
    if (isHydratingSchedule || loading) return
    if (!selectedDate) return

    const dateKey = formatDateForInput(selectedDate)
    if (calcStaleRepairAttemptedDateRef.current === dateKey) return

    const allExpectedBedsZero = recalculationTeams.every((team) => {
      const v = calculations[team]?.expected_beds_per_team
      return typeof v !== 'number' || v === 0
    })
    if (!allExpectedBedsZero) return

    const hasAnyTherapistOnDuty = recalculationTeams.some((team) => {
      const contributors = getContributingTeams(team, teamMergeMergedInto)
      return contributors.some((fromTeam) =>
        therapistAllocations[fromTeam].some((alloc) => {
          if (!['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)) return false
          const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
          const fte = overrideFTE !== undefined ? overrideFTE : alloc.fte_therapist || 0
          return fte > 0
        })
      )
    })
    if (!hasAnyTherapistOnDuty) return

    const hasAnyPcaAllocations = Object.values(pcaAllocations).some((arr) => Array.isArray(arr) && arr.length > 0)
    if (!hasAnyPcaAllocations && currentStep !== 'leave-fte') return

    const { totalBedsEffectiveAllTeams } = computeBedsDesignatedByTeam({
      teams: recalculationTeams,
      wards: wardsForRecalculation,
      bedCountsOverridesByTeam,
    })
    if (!(totalBedsEffectiveAllTeams > 0)) return

    calcStaleRepairAttemptedDateRef.current = dateKey
    recalculateScheduleCalculations({ allowDuringHydration: true })
  }, [
    hasLoadedStoredCalculations,
    isHydratingSchedule,
    loading,
    selectedDate,
    calculations,
    therapistAllocations,
    staffOverrides,
    wards,
    bedCountsOverridesByTeam,
    recalculateScheduleCalculations,
    currentStep,
    pcaAllocations,
    recalculationTeams,
    wardsForRecalculation,
    teamMergeMergedInto,
  ])

  // Guardrail: older persisted calculations may have computed Avg PCA/team using the full PCA pool
  // (without reserving special-program slot FTE). This breaks the conservation check and Step 3 pending math.
  // Recompute once per date to align Avg PCA/team with Excel semantics:
  // effectivePCA = totalPCAOnDuty - reservedSpecialProgramSlotsFTE; then add DRM add-on (DRO only).
  useEffect(() => {
    if (!hasLoadedStoredCalculations) return
    if (isHydratingSchedule || loading) return
    if (!selectedDate) return

    const dateKey = formatDateForInput(selectedDate)
    if (avgPcaTargetRepairAttemptedDateRef.current === dateKey) return

    const weekdayKey = getWeekday(selectedDate)
    const reservedSpecialProgramPcaFte = computeReservedSpecialProgramPcaFte({
      specialPrograms,
      weekday: weekdayKey,
      staffOverrides,
    })
    if (!(reservedSpecialProgramPcaFte > 1e-6)) return

    const totalPCAOnDuty = staff
      .filter((s) => s.rank === 'PCA')
      .reduce((sum, s) => {
        const overrideFTE = staffOverrides[s.id]?.fteRemaining
        const isBufferStaff = s.status === 'buffer'
        const baseFTE = isBufferStaff && s.buffer_fte !== undefined ? s.buffer_fte : 1.0
        const isOnLeave = staffOverrides[s.id]?.leaveType && staffOverrides[s.id]?.fteRemaining === 0
        const currentFTE = overrideFTE !== undefined ? overrideFTE : isOnLeave ? 0 : baseFTE
        return sum + currentFTE
      }, 0)

    const drmAddOnFte = computeDrmAddOnFte({
      specialPrograms,
      weekday: weekdayKey,
      staffOverrides,
      defaultAddOn: 0.4,
    })
    const effectiveTotalPCAForAvg = Math.max(0, totalPCAOnDuty - reservedSpecialProgramPcaFte - drmAddOnFte)

    // Sum of targets should equal (totalPCAOnDuty - reservedSpecialProgramPcaFte)
    // since DRM is taken out then added back to DRO.
    const expectedSum = effectiveTotalPCAForAvg + drmAddOnFte
    const observedSum = recalculationTeams.reduce(
      (sum, team) => sum + (calculations[team]?.average_pca_per_team ?? 0),
      0
    )

    const mismatch = Math.abs(observedSum - expectedSum)
    if (mismatch < 0.2) return

    avgPcaTargetRepairAttemptedDateRef.current = dateKey
    recalculateScheduleCalculations({ allowDuringHydration: true })
  }, [
    hasLoadedStoredCalculations,
    isHydratingSchedule,
    loading,
    selectedDate,
    staff,
    staffOverrides,
    specialPrograms,
    calculations,
    recalculateScheduleCalculations,
    recalculationTeams,
  ])

  // Recalculate beds + relieving beds when bed-count overrides change.
  useEffect(() => {
    // During initial hydration, never recalculate (prevents progressive avg PCA/team changes).
    if (isHydratingSchedule) {
      return
    }
    // OPTIMIZATION: Skip recalculation if we've loaded stored calculations (bed counts changes are handled separately)
    if (hasLoadedStoredCalculations) {
      // IMPORTANT: Do not clear persisted bed allocations.
      // If bed allocations exist in DB (completed schedules), they should show immediately on load.
      const shouldComputeBeds =
        stepStatus['bed-relieving'] === 'completed' || currentStep === 'bed-relieving' || currentStep === 'review'
      if (!shouldComputeBeds) {
        return
      }
      // IMPORTANT: During initial load, do not call recalculateScheduleCalculations when stored calculations exist.
      // Bed allocations are loaded from DB; skip the rest of this effect to prevent any recalc-triggered UI churn.
      return
    }
    const hasAllocations = Object.keys(pcaAllocations).some((team) => pcaAllocations[team as Team]?.length > 0)
    if (!hasAllocations && currentStep !== 'leave-fte') {
      return
    }

    recalculateScheduleCalculations()

    const shouldComputeBeds =
      stepStatus['bed-relieving'] === 'completed' || currentStep === 'bed-relieving' || currentStep === 'review'

    if (!shouldComputeBeds) {
      return
    }

    // Compute bed allocations using current therapist allocations and bed-count overrides
    // IMPORTANT: Use EFFECTIVE total beds (after SHS/Student deductions) for relieving calculations.
    const ptPerTeamByTeam: Record<Team, number> = { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }

    recalculationTeams.forEach((team) => {
      const contributors = getContributingTeams(team, teamMergeMergedInto)
      const ptPerTeam = contributors.reduce((teamSum, fromTeam) => {
        return (
          teamSum +
          therapistAllocations[fromTeam].reduce((sum, alloc) => {
            const isTherapist = ['SPT', 'APPT', 'RPT'].includes(alloc.staff.rank)
            const overrideFTE = staffOverrides[alloc.staff_id]?.fteRemaining
            const currentFTE = overrideFTE !== undefined ? overrideFTE : alloc.fte_therapist || 0
            const hasFTE = currentFTE > 0
            return sum + (isTherapist && hasFTE ? currentFTE : 0)
          }, 0)
        )
      }, 0)
      ptPerTeamByTeam[team] = ptPerTeam
    })

    const { bedsDesignatedByTeam, totalBedsEffectiveAllTeams } = computeBedsDesignatedByTeam({
      teams: recalculationTeams,
      wards: wardsForRecalculation,
      bedCountsOverridesByTeam,
    })
    const { bedsForRelieving } = computeBedsForRelieving({
      teams: recalculationTeams,
      bedsDesignatedByTeam,
      totalBedsEffectiveAllTeams,
      totalPTByTeam: ptPerTeamByTeam,
    })

    const bedContext: BedAllocationContext = {
      bedsForRelieving,
      wards: wardsForRecalculation.map((w: any) => ({ name: w.name, team_assignments: w.team_assignments })),
    }
    let cancelled = false
    void (async () => {
      const { allocateBeds } = await import('@/lib/algorithms/bedAllocation')
      if (cancelled) return
      const bedResult = allocateBeds(bedContext)
      if (cancelled) return
      setBedAllocations(bedResult.allocations)
    })().catch((e) => console.error('Failed to recompute bed allocations:', e))
    return () => {
      cancelled = true
    }
  }, [
    bedCountsOverridesByTeam,
    hasLoadedStoredCalculations,
    isHydratingSchedule,
    currentStep,
    stepStatus,
    wardsForRecalculation,
    therapistAllocations,
    staffOverrides,
    pcaAllocations,
    recalculateScheduleCalculations,
    recalculationTeams,
    teamMergeMergedInto,
  ])

  // ============================================================================
  // CENTRALIZED ALLOCATION SYNC
  // Uses useAllocationSync hook to handle all allocation syncing in one place.
  // See .cursor/rules/stepwise-workflow-data.mdc for architecture documentation.
  //
  // The hook handles two sync triggers:
  // 1. On staffOverrides change (within a step): Real-time UI sync
  // 2. On step transition (currentStep changes): Full sync for "before algo" state
  // ============================================================================
  useAllocationSync({
    staffOverrides,
    currentStep,
    staff,
    therapistAllocations,
    pcaAllocations,
    specialPrograms,
    sptAllocations,
    selectedDate,
    hasLoadedStoredCalculations,
    step2Initialized: initializedSteps.has('therapist-pca'),
    setTherapistAllocations,
    recalculateScheduleCalculations,
    isHydrating: isHydratingSchedule,
  })

  return { recalculateScheduleCalculations }
}
