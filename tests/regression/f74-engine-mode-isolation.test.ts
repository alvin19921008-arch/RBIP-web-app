import assert from 'node:assert/strict'

import { allocateFloatingPCAByEngine } from '../../lib/algorithms/pcaAllocation'
import type { Team } from '../../types/staff'

function emptyTeamRecord<T>(value: T): Record<Team, T> {
  return {
    FO: value,
    SMM: value,
    SFM: value,
    CPPC: value,
    MC: value,
    GMC: value,
    NSM: value,
    DRO: value,
  }
}

async function main() {
  const baseContext = {
    mode: 'balanced' as const,
    teamOrder: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'] as Team[],
    currentPendingFTE: emptyTeamRecord(0),
    existingAllocations: [],
    pcaPool: [],
    pcaPreferences: [],
    specialPrograms: [],
  }

  const v1 = await allocateFloatingPCAByEngine({
    ...baseContext,
    engine: 'v1',
  })

  const v2 = await allocateFloatingPCAByEngine({
    ...baseContext,
    engine: 'v2',
  })

  assert.equal(v1.tracker.FO.summary.allocationEngine, 'v1')
  assert.equal(v1.tracker.FO.summary.allocationMode, 'balanced')

  assert.equal(v2.tracker.FO.summary.allocationEngine, 'v2')
  assert.equal(
    v2.tracker.FO.summary.allocationMode,
    'standard',
    'Expected V2 to stay on its ranked-slot standard path and not reuse legacy balanced mode'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
