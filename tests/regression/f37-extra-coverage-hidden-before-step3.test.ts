import assert from 'node:assert/strict'

import {
  sanitizeExtraCoverageOverrides,
  shouldShowExtraCoverage,
} from '../../lib/features/schedule/extraCoverageVisibility'

async function main() {
  assert.equal(
    shouldShowExtraCoverage({ currentStep: 'therapist-pca', initializedSteps: new Set(['therapist-pca']) }),
    false,
    'Expected extra coverage to stay hidden before Step 3 initializes'
  )

  assert.equal(
    shouldShowExtraCoverage({ currentStep: 'floating-pca', initializedSteps: new Set(['therapist-pca']) }),
    false,
    'Expected extra coverage to stay hidden when Step 3 screen opens before allocation completes'
  )

  assert.equal(
    shouldShowExtraCoverage({ currentStep: 'therapist-pca', initializedSteps: new Set(['therapist-pca', 'floating-pca']) }),
    true,
    'Expected extra coverage to remain visible after Step 3 has initialized'
  )

  const sanitized = sanitizeExtraCoverageOverrides({
    currentStep: 'therapist-pca',
    initializedSteps: new Set(['therapist-pca']),
    staffOverrides: {
      a: { leaveType: null, fteRemaining: 1, extraCoverageBySlot: { 1: true } },
      b: { leaveType: null, fteRemaining: 1 },
      c: { extraCoverageBySlot: { 2: true } },
    },
  })

  assert.deepEqual(
    sanitized,
    {
      a: { leaveType: null, fteRemaining: 1 },
      b: { leaveType: null, fteRemaining: 1 },
    },
    'Expected stale extraCoverageBySlot markers to be stripped before Step 3'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
