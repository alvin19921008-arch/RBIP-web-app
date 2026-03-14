import assert from 'node:assert/strict'

import { projectLoadStepGating } from '../../lib/features/schedule/workflowLoadProjection'
import type { WorkflowState } from '../../types/schedule'

async function main() {
  const explicitWorkflow: WorkflowState = {
    currentStep: 'floating-pca',
    completedSteps: ['leave-fte', 'therapist-pca'],
  }

  const projectedFromWorkflow = projectLoadStepGating({
    workflowState: explicitWorkflow,
    initializedStepsFromLoaded: null,
    hasLeaveData: true,
    hasTherapistData: true,
    hasPCAData: true,
    hasBedData: false,
  })

  assert.equal(
    projectedFromWorkflow.stepStatus['floating-pca'],
    'pending',
    'Expected explicit workflow state to keep floating step pending even when PCA rows exist'
  )
  assert.equal(
    projectedFromWorkflow.initializedStepsToApply.includes('floating-pca'),
    false,
    'Expected load gating to avoid inferring floating initialization from PCA row presence'
  )
  assert.equal(
    projectedFromWorkflow.currentStepToApply,
    'floating-pca',
    'Expected current step to follow explicit persisted workflow state'
  )

  const projectedWithoutWorkflow = projectLoadStepGating({
    workflowState: null,
    initializedStepsFromLoaded: null,
    hasLeaveData: true,
    hasTherapistData: true,
    hasPCAData: true,
    hasBedData: false,
  })

  assert.equal(
    projectedWithoutWorkflow.initializedStepsToApply.includes('floating-pca'),
    false,
    'Expected legacy fallback gating to keep floating step uninitialized without explicit workflow/init state'
  )
  assert.equal(
    projectedWithoutWorkflow.stepStatus['floating-pca'],
    'pending',
    'Expected legacy fallback gating to keep floating step pending without explicit workflow state'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
