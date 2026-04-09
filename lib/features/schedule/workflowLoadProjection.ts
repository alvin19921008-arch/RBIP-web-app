import type { WorkflowState, ScheduleStepId, StepStatus } from '@/types/schedule'

const STEP_IDS: ScheduleStepId[] = ['leave-fte', 'therapist-pca', 'floating-pca', 'bed-relieving', 'review']

function emptyStepStatus(): Record<ScheduleStepId, StepStatus> {
  return {
    'leave-fte': 'pending',
    'therapist-pca': 'pending',
    'floating-pca': 'pending',
    'bed-relieving': 'pending',
    review: 'pending',
  }
}

function sanitizeStepIds(ids: string[] | null | undefined): ScheduleStepId[] {
  if (!Array.isArray(ids)) return []
  const unique = new Set<ScheduleStepId>()
  ids.forEach((value) => {
    if ((STEP_IDS as string[]).includes(value)) unique.add(value as ScheduleStepId)
  })
  return Array.from(unique)
}

function inferCurrentStepFromStatus(stepStatus: Record<ScheduleStepId, StepStatus>): ScheduleStepId {
  if (stepStatus['bed-relieving'] !== 'pending') return 'review'
  if (stepStatus['floating-pca'] !== 'pending') return 'bed-relieving'
  if (stepStatus['therapist-pca'] !== 'pending') return 'floating-pca'
  if (stepStatus['leave-fte'] !== 'pending') return 'therapist-pca'
  return 'leave-fte'
}

export function projectLoadStepGating(args: {
  workflowState: WorkflowState | null
  initializedStepsFromLoaded: string[] | null
  hasLeaveData: boolean
  hasTherapistData: boolean
  hasPCAData: boolean
  hasBedData: boolean
}): {
  stepStatus: Record<ScheduleStepId, StepStatus>
  initializedStepsToApply: ScheduleStepId[]
  currentStepToApply: ScheduleStepId
} {
  const workflowCompletedSteps = sanitizeStepIds(args.workflowState?.completedSteps as string[] | undefined)
  const workflowOutdatedSteps = sanitizeStepIds(args.workflowState?.outdatedSteps as string[] | undefined)
  const hasExplicitWorkflow = !!args.workflowState && Array.isArray(args.workflowState.completedSteps)

  if (hasExplicitWorkflow) {
    const stepStatus = emptyStepStatus()
    workflowCompletedSteps.forEach((stepId) => {
      stepStatus[stepId] = 'completed'
    })
    workflowOutdatedSteps.forEach((stepId) => {
      if (stepStatus[stepId] === 'completed') stepStatus[stepId] = 'outdated'
    })
    const currentStepFromWorkflow = (args.workflowState?.currentStep ?? null) as string | null
    const currentStepToApply = (STEP_IDS as string[]).includes(currentStepFromWorkflow || '')
      ? (currentStepFromWorkflow as ScheduleStepId)
      : inferCurrentStepFromStatus(stepStatus)

    const initializedStepsFromLoaded = sanitizeStepIds(args.initializedStepsFromLoaded)
    const initializedStepsToApply =
      initializedStepsFromLoaded.length > 0
        ? initializedStepsFromLoaded
        : workflowCompletedSteps.filter((stepId) => stepId !== 'review')

    return {
      stepStatus,
      initializedStepsToApply,
      currentStepToApply,
    }
  }

  const stepStatus = emptyStepStatus()
  if (args.hasLeaveData) stepStatus['leave-fte'] = 'completed'
  if (args.hasTherapistData || args.hasPCAData) stepStatus['therapist-pca'] = 'completed'
  if (args.hasPCAData || args.hasBedData) stepStatus['floating-pca'] = 'completed'
  if (args.hasBedData) stepStatus['bed-relieving'] = 'completed'

  const initializedStepsFromLoaded = sanitizeStepIds(args.initializedStepsFromLoaded)
  const initializedStepsToApply =
    initializedStepsFromLoaded.length > 0
      ? initializedStepsFromLoaded
      : ([
          ...(stepStatus['therapist-pca'] === 'completed' ? (['therapist-pca'] as ScheduleStepId[]) : []),
          ...(stepStatus['floating-pca'] === 'completed' ? (['floating-pca'] as ScheduleStepId[]) : []),
          ...(stepStatus['bed-relieving'] === 'completed' ? (['bed-relieving'] as ScheduleStepId[]) : []),
        ] as ScheduleStepId[])

  return {
    stepStatus,
    initializedStepsToApply,
    currentStepToApply: inferCurrentStepFromStatus(stepStatus),
  }
}
