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
  const nonFloatingStacked = makeLog({
    pcaId: 'float-nf',
    pcaName: 'Float NF',
    ...({ step3OwnershipKind: 'step3-floating', upstreamCoverageKind: 'non-floating' } as any),
  })
  const substitutionStacked = makeLog({
    pcaId: 'float-sub-upstream',
    pcaName: 'Float Sub Upstream',
    ...({ step3OwnershipKind: 'step3-floating', upstreamCoverageKind: 'substitution-like' } as any),
  })
  const specialProgramStacked = makeLog({
    pcaId: 'float-sp',
    pcaName: 'Float SP',
    ...({ step3OwnershipKind: 'step3-floating', upstreamCoverageKind: 'special-program' } as any),
  })
  const firstStep3Floating = makeLog({
    pcaId: 'float-a',
    pcaName: 'Float A',
    ...({ step3OwnershipKind: 'step3-floating', upstreamCoverageKind: null } as any),
  })
  const secondStep3Floating = makeLog({
    pcaId: 'float-b',
    pcaName: 'Float B',
    ...({ step3OwnershipKind: 'step3-floating', upstreamCoverageKind: null } as any),
  })

  assert.deepEqual(
    getQualifyingDuplicateFloatingAssignmentsForSlot({
      team: 'FO',
      slot: 1,
      logsForSlot: [nonFloatingStacked],
      staffOverrides: {},
    }).map((log) => log.pcaId),
    [],
    'Expected non-floating upstream coverage plus one Step 3 floating row to stay non-duplicate.'
  )

  assert.deepEqual(
    getQualifyingDuplicateFloatingAssignmentsForSlot({
      team: 'FO',
      slot: 1,
      logsForSlot: [substitutionStacked],
      staffOverrides: {},
    }).map((log) => log.pcaId),
    [],
    'Expected substitution-covered upstream coverage plus one Step 3 floating row to stay non-duplicate.'
  )

  assert.deepEqual(
    getQualifyingDuplicateFloatingAssignmentsForSlot({
      team: 'FO',
      slot: 1,
      logsForSlot: [specialProgramStacked],
      staffOverrides: {},
    }).map((log) => log.pcaId),
    [],
    'Expected special-program upstream coverage plus one Step 3 floating row to stay non-duplicate.'
  )

  assert.deepEqual(
    getQualifyingDuplicateFloatingAssignmentsForSlot({
      team: 'FO',
      slot: 1,
      logsForSlot: [firstStep3Floating, secondStep3Floating],
      staffOverrides: {},
    }).map((log) => log.pcaId),
    ['float-a', 'float-b'],
    'Expected true Step 3 floating-on-floating stacking to remain visible to shared duplicate semantics.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
