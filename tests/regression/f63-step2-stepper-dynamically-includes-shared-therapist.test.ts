import assert from 'node:assert/strict'

import { buildStep2WizardStepperSteps } from '../../lib/features/schedule/step2WizardStepper'

async function main() {
  assert.deepEqual(
    buildStep2WizardStepperSteps({
      showSubstituteStep: true,
      showSharedTherapistStep: false,
    }),
    [
      { step: '2.0', label: 'Programs' },
      { step: '2.1', label: 'Substitute' },
      { step: '2.2', label: 'SPT' },
    ],
    'Expected Step 2 stepper to omit 2.3 when there are no shared therapists for the day'
  )

  assert.deepEqual(
    buildStep2WizardStepperSteps({
      showSubstituteStep: false,
      showSharedTherapistStep: true,
    }),
    [
      { step: '2.0', label: 'Programs' },
      { step: '2.2', label: 'SPT' },
      { step: '2.3', label: 'Shared therapist' },
    ],
    'Expected Step 2 stepper to append 2.3 when shared therapist review is needed, even if 2.1 is hidden'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
