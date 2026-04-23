'use client'

import { useCallback, useMemo, type TransitionStartFunction } from 'react'
import type { Team, Staff } from '@/types/staff'
import type {
  TherapistAllocation,
  PCAAllocation,
  BedAllocation,
  BedRelievingNotesByToTeam,
  AllocationTracker,
  ScheduleStepId,
  StepStatus,
} from '@/types/schedule'
import { ALLOCATION_STEPS, TEAMS } from '@/lib/features/schedule/constants'
import { hasAnySubstitution } from '@/lib/utils/substitutionFor'

export type StepChromeDownstreamAttention = {
  step3Outdated: boolean
  step4Outdated: boolean
} | null

export function useScheduleStepChromeNavigation(params: {
  startUiTransition: TransitionStartFunction
  goToNextStep: () => void
  goToPreviousStep: () => void
  goToStep: (step: ScheduleStepId) => void | Promise<void>
  currentStep: string
  stepStatus: Record<string, StepStatus>
  staff: Staff[]
  staffOverrides: Record<string, unknown>
  therapistAllocations: Partial<Record<Team, TherapistAllocation[]>>
  pcaAllocations: Partial<Record<Team, PCAAllocation[]>>
  bedAllocations: BedAllocation[] | null | undefined
  bedRelievingNotesByToTeam: BedRelievingNotesByToTeam | null | undefined
  step2Result: unknown | null
  initializedSteps: Set<string>
  adjustedPendingFTE: Record<Team, number> | null
  teamAllocationOrder: Team[] | null
  allocationTracker: AllocationTracker | null
  step2DownstreamImpact: StepChromeDownstreamAttention
  prefetchStep2Algorithms: () => void
  prefetchStep3Algorithms: () => void
  prefetchBedAlgorithm: () => void
}) {
  const {
    startUiTransition,
    goToNextStep,
    goToPreviousStep,
    goToStep,
    currentStep,
    stepStatus,
    staff,
    staffOverrides,
    therapistAllocations,
    pcaAllocations,
    bedAllocations,
    bedRelievingNotesByToTeam,
    step2Result,
    initializedSteps,
    adjustedPendingFTE,
    teamAllocationOrder,
    allocationTracker,
    step2DownstreamImpact,
    prefetchStep2Algorithms,
    prefetchStep3Algorithms,
    prefetchBedAlgorithm,
  } = params

  const handleNextStep = useCallback(async () => {
    // Only navigate, don't run algorithms
    startUiTransition(() => {
      goToNextStep()
    })
  }, [startUiTransition, goToNextStep])

  const handlePreviousStep = useCallback(() => {
    startUiTransition(() => {
      goToPreviousStep()
    })
  }, [startUiTransition, goToPreviousStep])

  const handleStepClick = useCallback(
    (stepId: string) => {
      goToStep(stepId as any)
    },
    [goToStep]
  )

  /** Same “saved work exists” signals as `showClearForCurrentStep`, for nav when workflow `stepStatus` lags DB rows. */
  const allocationStepNavSignals = useMemo(() => {
    const hasNonBaselineTherapistAllocs = TEAMS.some((team) =>
      (therapistAllocations[team] || []).some(
        (a) => typeof a.id === 'string' && !a.id.startsWith('baseline-therapist:')
      )
    )
    const hasNonBaselinePcaAllocs = TEAMS.some((team) =>
      (pcaAllocations[team] || []).some((a) => typeof a.id === 'string' && !a.id.startsWith('baseline-pca:'))
    )
    const hasStep2OverrideKeys = Object.values(staffOverrides ?? {}).some((o: any) => {
      if (!o || typeof o !== 'object') return false
      if (Array.isArray(o.specialProgramOverrides) && o.specialProgramOverrides.length > 0) return true
      if (hasAnySubstitution(o)) return true
      if (o.team != null) return true
      return false
    })
    const hasStep2Data =
      step2Result != null ||
      initializedSteps.has('therapist-pca') ||
      stepStatus['therapist-pca'] !== 'pending' ||
      hasNonBaselineTherapistAllocs ||
      hasNonBaselinePcaAllocs ||
      hasStep2OverrideKeys

    const hasStep3SlotOverrides = Object.values(staffOverrides ?? {}).some((o: any) => !!o?.slotOverrides)
    const hasFloatingAllocations = TEAMS.some((team) =>
      (pcaAllocations[team] || []).some((a) => {
        const staffMember = staff.find((s) => s.id === a.staff_id)
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

    return { hasStep2Data, hasStep3Data, hasStep4Data }
  }, [
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

  const attentionStepIds = useMemo(() => {
    const ids: string[] = []
    if (step2DownstreamImpact?.step3Outdated) ids.push('floating-pca')
    if (step2DownstreamImpact?.step4Outdated) ids.push('bed-relieving')
    return ids
  }, [step2DownstreamImpact])

  const canNavigateToStep = useCallback(
    (stepId: string) => {
      const targetIndex = ALLOCATION_STEPS.findIndex(s => s.id === stepId)
      const currentIndex = ALLOCATION_STEPS.findIndex(s => s.id === currentStep)

      // Can always go to earlier steps
      if (targetIndex <= currentIndex) return true

      const previousStep = ALLOCATION_STEPS[targetIndex - 1]
      if (!previousStep) return false

      // Special case for Step 1 -> Step 2 navigation
      if (previousStep.id === 'leave-fte') {
        // Allow if Step 1 has leave data configured (fresh schedule case)
        const hasLeaveData = Object.keys(staffOverrides).length > 0

        // Allow if any later step is completed (loaded schedule case)
        const anyLaterStepCompleted = ['therapist-pca', 'floating-pca', 'bed-relieving', 'review']
          .some(s => stepStatus[s] !== 'pending')

        // Allow if Step 1 itself is completed/modified (normal case)
        const step1Started = stepStatus['leave-fte'] !== 'pending'

        return (
          hasLeaveData ||
          anyLaterStepCompleted ||
          step1Started ||
          allocationStepNavSignals.hasStep2Data ||
          allocationStepNavSignals.hasStep3Data ||
          allocationStepNavSignals.hasStep4Data
        )
      }

      // Forward: require previous step started *or* matching saved allocation/workflow data
      // (explicit workflow can leave `stepStatus` pending while rows exist — see load gating).
      if (previousStep.id === 'therapist-pca') {
        return stepStatus['therapist-pca'] !== 'pending' || allocationStepNavSignals.hasStep2Data
      }
      if (previousStep.id === 'floating-pca') {
        return stepStatus['floating-pca'] !== 'pending' || allocationStepNavSignals.hasStep3Data
      }
      if (previousStep.id === 'bed-relieving') {
        return stepStatus['bed-relieving'] !== 'pending' || allocationStepNavSignals.hasStep4Data
      }

      return stepStatus[previousStep.id] !== 'pending'
    },
    [currentStep, staffOverrides, stepStatus, allocationStepNavSignals]
  )

  const handleStepInitializePrefetch = useCallback(() => {
    if (currentStep === 'therapist-pca') prefetchStep2Algorithms()
    else if (currentStep === 'floating-pca') prefetchStep3Algorithms()
    else if (currentStep === 'bed-relieving') prefetchBedAlgorithm()
  }, [currentStep, prefetchStep2Algorithms, prefetchStep3Algorithms, prefetchBedAlgorithm])

  return {
    handleNextStep,
    handlePreviousStep,
    handleStepClick,
    allocationStepNavSignals,
    attentionStepIds,
    canNavigateToStep,
    handleStepInitializePrefetch,
  }
}
