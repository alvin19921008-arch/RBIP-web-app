import assert from 'node:assert/strict'

import { getQualifyingDuplicateFloatingAssignmentsForSlot } from '../../lib/features/schedule/duplicateFloatingSemantics'
import type { SlotAssignmentLog } from '../../types/schedule'

function makeAssignment(overrides: Partial<SlotAssignmentLog>): SlotAssignmentLog {
  return {
    slot: 4,
    pcaId: 'pca',
    pcaName: 'PCA',
    assignedIn: 'step34',
    allocationStage: 'draft',
    repairReason: null,
    cycle: 3,
    step3OwnershipKind: 'step3-floating',
    upstreamCoverageKind: 'non-floating',
    fulfilledSlotRank: null,
    slotSelectionPhase: 'unranked-unused',
    pcaSelectionTier: 'non-floor',
    usedContinuity: false,
    duplicateSlot: true,
    ...overrides,
  }
}

function main() {
  const logsForSlot: SlotAssignmentLog[] = [
    makeAssignment({
      pcaId: 'dro-a',
      pcaName: '少華',
      allocationStage: 'draft',
    }),
    makeAssignment({
      pcaId: 'dro-b',
      pcaName: '淑貞',
      allocationStage: 'repair',
      repairReason: 'ranked-coverage',
    }),
  ]

  const qualifying = getQualifyingDuplicateFloatingAssignmentsForSlot({
    team: 'DRO',
    slot: 4,
    logsForSlot,
    staffOverrides: undefined,
  })

  assert.equal(
    qualifying.length,
    2,
    'Two true Step 3 floating rows on the same slot should count as duplicate floating even when upstream non-floating coverage also exists.'
  )
  assert.deepEqual(
    qualifying.map((entry) => entry.pcaId).sort(),
    ['dro-a', 'dro-b'],
    'Duplicate semantics should keep both distinct floating PCAs on the duplicated slot.'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
