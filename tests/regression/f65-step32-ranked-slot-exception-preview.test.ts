import assert from 'node:assert/strict'

import { computeStep3V2ReservationPreview } from '../../lib/features/schedule/step3V2ReservationPreview'
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

function makePca(id: string, availableSlots: number[]): PCAData {
  return {
    id,
    name: id,
    floating: true,
    special_program: null,
    fte_pca: 1,
    leave_type: null,
    is_available: true,
    team: null,
    availableSlots,
  }
}

async function main() {
  const preferences: PCAPreference[] = [
    {
      id: 'pref-fo',
      team: 'FO',
      preferred_pca_ids: ['pca-a'],
      preferred_slots: [1, 3],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]

  const preview = computeStep3V2ReservationPreview({
    pcaPreferences: preferences,
    adjustedPendingFTE: { ...emptyTeamRecord(0), FO: 0.5 },
    floatingPCAs: [makePca('pca-a', [3]), makePca('floor-m', [1, 3])],
    existingAllocations: [],
  })

  assert.equal(preview.summary.teamsChecked, 1)
  assert.deepEqual(preview.summary.needsAttentionTeams, ['FO'])
  assert.deepEqual(preview.summary.autoContinueTeams, [])

  assert.equal(
    preview.teamReservations.FO?.attentionReason,
    'preferred-pca-misses-highest-feasible-rank',
    'Expected FO to be flagged when the highest feasible ranked slot cannot use the preferred PCA'
  )
  assert.equal(preview.teamReservations.FO?.slot, 1)
  assert.equal(preview.teamReservations.FO?.recommendedPcaId, 'floor-m')
  assert.equal(preview.teamReservations.FO?.preferredPcaMayStillHelpLater, true)
  assert.deepEqual(
    preview.teamReservations.FO?.rankedChoices?.map((choice) => choice.slot),
    [1, 3]
  )
  assert.deepEqual(preview.teamReservations.FO?.otherSlots, [2])
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
