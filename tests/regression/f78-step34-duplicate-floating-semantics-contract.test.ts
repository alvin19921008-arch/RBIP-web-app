import assert from 'node:assert/strict'

import { getQualifyingDuplicateFloatingAssignmentsForSlot } from '../../lib/features/schedule/duplicateFloatingSemantics'
import type { SlotAssignmentLog } from '../../types/schedule'

function makeLog(overrides: Partial<SlotAssignmentLog>): SlotAssignmentLog {
  return {
    slot: 1,
    pcaId: 'pca-1',
    pcaName: 'PCA 1',
    assignedIn: 'step34',
    ...overrides,
  }
}

async function main() {
  const realFloating = makeLog({ pcaId: 'float-a', pcaName: 'Float A' })
  const substitutionLike = makeLog({ pcaId: 'float-sub', pcaName: 'Float Sub' })
  const anotherRealFloating = makeLog({ pcaId: 'float-b', pcaName: 'Float B' })
  const olderCommitted = makeLog({ pcaId: 'step33-a', pcaName: 'Step 3.3 A', assignedIn: 'step33' })

  assert.deepEqual(
    getQualifyingDuplicateFloatingAssignmentsForSlot({
      team: 'FO',
      slot: 1,
      logsForSlot: [realFloating, substitutionLike, olderCommitted],
      staffOverrides: {
        'float-sub': {
          substitutionForBySlot: {
            1: {
              nonFloatingPCAId: 'nf-1',
              nonFloatingPCAName: 'NF 1',
              team: 'FO',
            },
          },
        },
      },
    }).map((log) => log.pcaId),
    ['float-a'],
    'Expected duplicate-floating qualification to exclude substitution-like Step 3.4 rows and non-Step-3.4 rows.'
  )

  assert.deepEqual(
    getQualifyingDuplicateFloatingAssignmentsForSlot({
      team: 'FO',
      slot: 1,
      logsForSlot: [realFloating, anotherRealFloating],
      staffOverrides: {},
    }).map((log) => log.pcaId),
    ['float-a', 'float-b'],
    'Expected real Step 3.4 floating duplicates to remain visible to shared duplicate semantics.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
