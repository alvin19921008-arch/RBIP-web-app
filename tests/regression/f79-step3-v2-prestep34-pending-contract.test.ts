import assert from 'node:assert/strict'

import { runStep3V2CommittedSelections } from '../../lib/features/schedule/step3V2CommittedSelections'
import type { PCAData } from '../../lib/algorithms/pcaAllocation'
import type { PCAPreference } from '../../types/allocation'
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

function makePca(id: string, name: string, slots: number[]): PCAData {
  return {
    id,
    name,
    floating: true,
    special_program: null,
    fte_pca: 1,
    leave_type: null,
    is_available: true,
    team: null,
    availableSlots: slots,
  } as PCAData
}

async function main() {
  const result = await runStep3V2CommittedSelections({
    teamOrder: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.5 },
    existingAllocations: [],
    floatingPCAs: [
      makePca('manual-a', 'Manual A', [1]),
      makePca('auto-b', 'Auto B', [2]),
    ],
    pcaPreferences: [
      {
        id: 'pref-fo',
        team: 'FO',
        preferred_pca_ids: [],
        preferred_slots: [2],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      } satisfies PCAPreference,
    ],
    specialPrograms: [],
    step32Assignments: [
      {
        team: 'FO',
        slot: 1,
        pcaId: 'manual-a',
        pcaName: 'Manual A',
      },
    ],
    step33Assignments: [],
    mode: 'standard',
    preferenceSelectionMode: 'selected_only',
  })

  assert.equal(
    result.tracker.FO.summary.preStep34RoundedPendingFte,
    0.25,
    'Expected the tracker summary to preserve rounded pending after committed 3.2/3.3 assignments and before Step 3.4 runs.'
  )

  assert.equal(
    result.pendingPCAFTEPerTeam.FO,
    0,
    'Expected this scenario to prove the pre-Step-3.4 header value differs from the final leftover pending after Step 3.4 finishes.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
