'use client'

import { createElement, useCallback, useMemo, type MouseEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { ActionToastProgress } from '@/components/ui/action-toast'
import type {
  BedAllocation,
  BedRelievingNotesByToTeam,
  PCAAllocation,
  ScheduleStepId,
  StepStatus,
  TherapistAllocation,
} from '@/types/schedule'
import type { Staff, Team } from '@/types/staff'
import type { StaffOverrides } from '@/lib/hooks/useAllocationSync'
import { hasAnySubstitution } from '@/lib/utils/substitutionFor'
import { TEAMS } from '@/lib/features/schedule/constants'

const STEP_ORDER: ScheduleStepId[] = ['leave-fte', 'therapist-pca', 'floating-pca', 'bed-relieving', 'review']

const CLEARABLE_STEP_SET: Record<string, true> = {
  'leave-fte': true,
  'therapist-pca': true,
  'floating-pca': true,
  'bed-relieving': true,
}

type ShowActionToast = (
  title: string,
  variant?: unknown,
  description?: string,
  options?: {
    durationMs?: number
    actions?: ReactNode
    progress?: ActionToastProgress
    persistUntilDismissed?: boolean
    dismissOnOutsideClick?: boolean
    showDurationProgress?: boolean
    pauseOnHover?: boolean
  }
) => unknown

export type UseScheduleStepClearActionsArgs = {
  currentStep: string
  stepStatus: Record<ScheduleStepId, StepStatus>
  initializedSteps: Set<string>
  staffOverrides: StaffOverrides
  therapistAllocations: Record<Team, TherapistAllocation[]>
  pcaAllocations: Record<Team, PCAAllocation[]>
  bedAllocations: BedAllocation[]
  bedRelievingNotesByToTeam: BedRelievingNotesByToTeam
  step2Result: unknown
  adjustedPendingFTE: unknown
  teamAllocationOrder: unknown
  allocationTracker: unknown
  staff: Staff[]
  showActionToast: ShowActionToast
  dismissActionToast: () => void
  closeDialogsForStepClear: () => void
  clearStep3UiStateForStepClear: () => void
  clearDomainFromStep: (stepId: ScheduleStepId) => void
}

export type ScheduleStepClearActionsResult = {
  showClearForCurrentStep: boolean
  handleClearStep: (stepIdRaw: string) => void
}

function getRangeLabelForStep(stepId: ScheduleStepId): string {
  if (stepId === 'leave-fte') return 'Steps 1–4'
  if (stepId === 'therapist-pca') return 'Steps 2–4'
  if (stepId === 'floating-pca') return 'Steps 3–4'
  return 'Step 4'
}

function getSingleStepLabel(stepId: ScheduleStepId): string {
  if (stepId === 'leave-fte') return 'Step 1 (Leave & FTE)'
  if (stepId === 'therapist-pca') return 'Step 2 (Therapist & PCA)'
  if (stepId === 'floating-pca') return 'Step 3 (Floating PCA)'
  return 'Step 4 (Bed Relieving)'
}

export function useScheduleStepClearActions({
  currentStep,
  stepStatus,
  initializedSteps,
  staffOverrides,
  therapistAllocations,
  pcaAllocations,
  bedAllocations,
  bedRelievingNotesByToTeam,
  step2Result,
  adjustedPendingFTE,
  teamAllocationOrder,
  allocationTracker,
  staff,
  showActionToast,
  dismissActionToast,
  closeDialogsForStepClear,
  clearStep3UiStateForStepClear,
  clearDomainFromStep,
}: UseScheduleStepClearActionsArgs): ScheduleStepClearActionsResult {
  const hasLaterStepData = useCallback(
    (target: ScheduleStepId) => {
      const index = STEP_ORDER.indexOf(target)
      if (index < 0) return false
      const later = STEP_ORDER.slice(index + 1, STEP_ORDER.indexOf('review'))
      return later.some((stepId) => stepStatus[stepId] !== 'pending')
    },
    [stepStatus]
  )

  const showClearForCurrentStep = useMemo(() => {
    const hasStep1Overrides = Object.keys(staffOverrides ?? {}).length > 0

    const hasNonBaselineTherapistAllocs = TEAMS.some((team) =>
      (therapistAllocations[team] || []).some(
        (allocation) => typeof allocation.id === 'string' && !allocation.id.startsWith('baseline-therapist:')
      )
    )
    const hasNonBaselinePcaAllocs = TEAMS.some((team) =>
      (pcaAllocations[team] || []).some(
        (allocation) => typeof allocation.id === 'string' && !allocation.id.startsWith('baseline-pca:')
      )
    )

    // Step 2 is considered to have data if algorithm allocations exist or step-specific override keys exist.
    const hasStep2OverrideKeys = Object.values(staffOverrides ?? {}).some((override: any) => {
      if (!override || typeof override !== 'object') return false
      if (Array.isArray(override.specialProgramOverrides) && override.specialProgramOverrides.length > 0) return true
      if (hasAnySubstitution(override)) return true
      // Team transfer overrides (fixed-team therapist emergency move)
      if (override.team != null) return true
      return false
    })
    const hasStep2Data =
      step2Result != null ||
      initializedSteps.has('therapist-pca') ||
      stepStatus['therapist-pca'] !== 'pending' ||
      hasNonBaselineTherapistAllocs ||
      hasNonBaselinePcaAllocs ||
      hasStep2OverrideKeys

    // Step 3 has data if floating allocations exist, or slotOverrides exist, or tracking state exists.
    const hasStep3SlotOverrides = Object.values(staffOverrides ?? {}).some((override: any) => !!override?.slotOverrides)
    const hasFloatingAllocations = TEAMS.some((team) =>
      (pcaAllocations[team] || []).some((allocation) => {
        const staffMember = staff.find((row) => row.id === allocation.staff_id)
        return !!staffMember?.floating
      })
    )
    const hasStep3Data =
      initializedSteps.has('floating-pca') ||
      stepStatus['floating-pca'] !== 'pending' ||
      adjustedPendingFTE != null ||
      teamAllocationOrder != null ||
      allocationTracker != null ||
      hasStep3SlotOverrides ||
      hasFloatingAllocations

    const hasStep4Notes = Object.keys(bedRelievingNotesByToTeam ?? {}).length > 0
    const hasStep4Data =
      initializedSteps.has('bed-relieving') ||
      stepStatus['bed-relieving'] !== 'pending' ||
      (bedAllocations?.length ?? 0) > 0 ||
      hasStep4Notes

    const step = currentStep as ScheduleStepId
    if (step === 'leave-fte') return hasStep1Overrides || hasStep2Data || hasStep3Data || hasStep4Data
    if (step === 'therapist-pca') return hasStep2Data || hasStep3Data || hasStep4Data
    if (step === 'floating-pca') return hasStep3Data || hasStep4Data
    if (step === 'bed-relieving') return hasStep4Data
    return false
  }, [
    currentStep,
    staffOverrides,
    staff,
    therapistAllocations,
    pcaAllocations,
    bedAllocations,
    bedRelievingNotesByToTeam,
    step2Result,
    initializedSteps,
    stepStatus,
    adjustedPendingFTE,
    teamAllocationOrder,
    allocationTracker,
  ])

  const runClearForStep = useCallback(
    async (stepId: ScheduleStepId) => {
      closeDialogsForStepClear()
      clearStep3UiStateForStepClear()
      clearDomainFromStep(stepId)
    },
    [clearDomainFromStep, clearStep3UiStateForStepClear, closeDialogsForStepClear]
  )

  const handleClearStep = useCallback(
    (stepIdRaw: string) => {
      const stepId = stepIdRaw as ScheduleStepId
      if (!CLEARABLE_STEP_SET[stepId]) return

      if (hasLaterStepData(stepId)) {
        const clearedLabel = getRangeLabelForStep(stepId)
        showActionToast(
          'This will clear later steps too',
          'warning',
          `Later-step data exists. Confirm to clear ${clearedLabel}.`,
          {
            persistUntilDismissed: true,
            dismissOnOutsideClick: true,
            actions: createElement(
              'div',
              { className: 'flex items-center justify-end gap-2' },
              createElement(
                Button,
                {
                  type: 'button',
                  variant: 'ghost',
                  size: 'sm',
                  onClick: (event: MouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation()
                    dismissActionToast()
                  },
                },
                'Cancel'
              ),
              createElement(
                Button,
                {
                  type: 'button',
                  variant: 'destructive',
                  size: 'sm',
                  onClick: async (event: MouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation()
                    dismissActionToast()
                    await runClearForStep(stepId)
                    showActionToast('Cleared', 'success', `Cleared ${clearedLabel}.`)
                  },
                },
                'Confirm'
              )
            ),
          }
        )
        return
      }

      ;(async () => {
        await runClearForStep(stepId)
        showActionToast('Cleared', 'success', `Cleared ${getSingleStepLabel(stepId)}.`)
      })().catch((error) => {
        console.error('Clear step failed:', error)
        showActionToast('Clear failed', 'error', (error as any)?.message || 'Please try again.')
      })
    },
    [dismissActionToast, hasLaterStepData, runClearForStep, showActionToast]
  )

  return {
    showClearForCurrentStep,
    handleClearStep,
  }
}
