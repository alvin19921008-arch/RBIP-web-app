import assert from 'node:assert/strict'

import { computeReservations } from '../../lib/utils/reservationLogic'
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

async function main() {
  const preferences: PCAPreference[] = [
    {
      id: 'pref-fo',
      team: 'FO',
      preferred_pca_ids: ['pca-a'],
      preferred_slots: [1, 3],
      avoid_gym_schedule: true,
      gym_schedule: 4,
      floor_pca_selection: 'upper',
    },
  ]

  const pending = emptyTeamRecord(0)
  pending.FO = 0.5

  const pcaPool: PCAData[] = [
    {
      id: 'pca-a',
      name: 'Preferred PCA A',
      floating: true,
      special_program: null,
      fte_pca: 0.25,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [3],
      floor_pca: ['upper'],
    } as any,
    {
      id: 'floor-m',
      name: 'Floor PCA M',
      floating: true,
      special_program: null,
      fte_pca: 0.5,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [1, 3],
      floor_pca: ['upper'],
    } as any,
  ]

  const preview = computeReservations(preferences, pending, pcaPool, [])

  assert.equal(preview.summary.teamsChecked, 1)
  assert.deepEqual(preview.summary.needsAttentionTeams, ['FO'])
  assert.equal(preview.teamReservations.FO?.slot, 1)
  assert.equal(preview.teamReservations.FO?.attentionReason, 'preferred-pca-misses-highest-feasible-rank')
  assert.equal(preview.teamReservations.FO?.recommendedPcaId, 'floor-m')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
