import assert from 'node:assert/strict'

import {
  buildStep3V2VisibleSteps,
  getStep3V2BackTarget,
  type Step3V2Step,
} from '../../lib/features/schedule/step3V2Path'

async function main() {
  const fullPath = buildStep3V2VisibleSteps({
    includeStep32: true,
    includeStep33: true,
  })
  assert.deepEqual(
    fullPath,
    ['3.1', '3.2', '3.3', '3.4'],
    'Expected the full V2 path to include 3.2 and 3.3 when both are available'
  )

  const skippedPreferredPath = buildStep3V2VisibleSteps({
    includeStep32: false,
    includeStep33: true,
  })
  assert.deepEqual(
    skippedPreferredPath,
    ['3.1', '3.3', '3.4'],
    'Expected the V2 path to omit 3.2 entirely when no preferred-step review is needed'
  )

  const backFromAdjacent = getStep3V2BackTarget({
    currentStep: '3.3',
    visibleSteps: skippedPreferredPath,
  })
  assert.equal(
    backFromAdjacent,
    '3.1',
    'Expected 3.3 to route back to 3.1 when the V2 path skipped 3.2'
  )

  const backFromFinal = getStep3V2BackTarget({
    currentStep: '3.4',
    visibleSteps: ['3.1', '3.2', '3.4'] satisfies Step3V2Step[],
  })
  assert.equal(
    backFromFinal,
    '3.2',
    'Expected 3.4 to route back to the closest real prior step in the visible path'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
