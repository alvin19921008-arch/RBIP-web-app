import type { WorkflowState } from '@/types/schedule'
import type { ScheduleStepId } from '@/types/schedule'

type StepState = 'pending' | 'completed' | 'modified'

const STEP_IDS: ScheduleStepId[] = ['leave-fte', 'therapist-pca', 'floating-pca', 'bed-relieving', 'review']

function emptyStepStatus(): Record<ScheduleStepId, StepState> {
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

function inferCurrentStepFromStatus(stepStatus: Record<ScheduleStepId, StepState>): ScheduleStepId {
  if (stepStatus['bed-relieving'] === 'completed') return 'review'
  if (stepStatus['floating-pca'] === 'completed') return 'bed-relieving'
  if (stepStatus['therapist-pca'] === 'completed') return 'floating-pca'
  if (stepStatus['leave-fte'] === 'completed') return 'therapist-pca'
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
  stepStatus: Record<ScheduleStepId, StepState>
  initializedStepsToApply: ScheduleStepId[]
  currentStepToApply: ScheduleStepId
} {
  const workflowCompletedSteps = sanitizeStepIds(args.workflowState?.completedSteps as string[] | undefined)
  const hasExplicitWorkflow = !!args.workflowState && Array.isArray(args.workflowState.completedSteps)

  if (hasExplicitWorkflow) {
    const stepStatus = emptyStepStatus()
    workflowCompletedSteps.forEach((stepId) => {
      stepStatus[stepId] = 'completed'
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
  if (args.hasBedData) stepStatus['bed-relieving'] = 'completed'

  const initializedStepsFromLoaded = sanitizeStepIds(args.initializedStepsFromLoaded)
  const initializedStepsToApply =
    initializedStepsFromLoaded.length > 0
      ? initializedStepsFromLoaded
      : ([
          ...(stepStatus['therapist-pca'] === 'completed' ? (['therapist-pca'] as ScheduleStepId[]) : []),
          ...(stepStatus['bed-relieving'] === 'completed' ? (['bed-relieving'] as ScheduleStepId[]) : []),
        ] as ScheduleStepId[])

  return {
    stepStatus,
    initializedStepsToApply,
    currentStepToApply: inferCurrentStepFromStatus(stepStatus),
  }
}
