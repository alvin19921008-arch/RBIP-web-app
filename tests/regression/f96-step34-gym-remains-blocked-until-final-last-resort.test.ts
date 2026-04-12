/**
 * When `avoid_gym_schedule` is true and a non-gym slot path can satisfy pending,
 * the ranked V2 allocator must end with canonical `gymUsageStatus === 'avoided'`
 * on the team summary (see `types/schedule.ts`, `allocator.ts`, tracker finalization).
 *
 * This locks the scoring / repair preference: gym is not chosen while a repaired
 * non-gym schedule remains available.
 */
import assert from 'node:assert/strict'

import { allocateFloatingPCA_v2RankedSlot, type PCAData } from '../../lib/algorithms/pcaAllocation'
import type { PCAPreference } from '../../types/allocation'
import type { Team } from '../../types/staff'

function emptyTeamRecord<T>(value: T): Record<Team, T> {
  return { FO: value, SMM: value, SFM: value, CPPC: value, MC: value, GMC: value, NSM: value, DRO: value }
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
    floor_pca: ['upper'],
  }
}

async function main() {
  const result = await allocateFloatingPCA_v2RankedSlot({
    teamOrder: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
    currentPendingFTE: { ...emptyTeamRecord(0), SMM: 0.25 },
    existingAllocations: [],
    pcaPool: [makePca('non-gym', 'Non Gym', [2]), makePca('gym-only', 'Gym', [4])],
    pcaPreferences: [
      {
        id: 'pref-smm',
        team: 'SMM',
        preferred_pca_ids: [],
        preferred_slots: [2],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      },
    ],
    specialPrograms: [],
    mode: 'standard',
    extraCoverageMode: 'none',
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [],
  })

  const summary = result.tracker.SMM.summary as { gymUsageStatus?: 'avoided' | 'used-last-resort' }
  assert.equal(
    summary.gymUsageStatus,
    'avoided',
    'Canonical gym status must be avoided when a non-gym slot can cover pending (avoid gym true)'
  )

  assert.equal(
    result.tracker.SMM.assignments.some((a) => a.slotSelectionPhase === 'gym-last-resort'),
    false,
    'No assignment should end in gym-last-resort when non-gym coverage exists and avoid gym is enabled'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
