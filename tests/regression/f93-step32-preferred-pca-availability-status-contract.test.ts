/**
 * Locks per-preferred-PCA availability on `Step32TeamReview` once implemented in
 * `lib/features/schedule/step32V2/step32PreferredReviewModel.ts`. User-facing
 * labels for each `availability` value will live in
 * `lib/features/schedule/step32V2/step32PreferredReviewCopy.ts`.
 */
import assert from 'node:assert/strict'

import { computeStep3V2ReservationPreview } from '../../lib/features/schedule/step3V2ReservationPreview'
import type { PCAPreference } from '../../types/allocation'
import type { Team } from '../../types/staff'

function emptyTeamRecord<T>(value: T): Record<Team, T> {
  return { FO: value, SMM: value, SFM: value, CPPC: value, MC: value, GMC: value, NSM: value, DRO: value }
}

async function main() {
  const preferences: PCAPreference[] = [
    {
      id: 'pref-cppc',
      team: 'CPPC',
      preferred_pca_ids: ['pref-a', 'pref-b'],
      preferred_slots: [4, 1],
      gym_schedule: 3,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]

  const preview = computeStep3V2ReservationPreview({
    pcaPreferences: preferences,
    adjustedPendingFTE: { ...emptyTeamRecord(0), CPPC: 0.25 },
    floatingPCAs: [
      {
        id: 'pref-a',
        name: '光劭',
        floating: true,
        fte_pca: 1,
        leave_type: null,
        availableSlots: [],
        floor_pca: ['upper'],
      },
      // Rank #1 is slot 4; 阿明 is only feasible on rank #2 (slot 1).
      {
        id: 'pref-b',
        name: '阿明',
        floating: true,
        fte_pca: 1,
        leave_type: null,
        availableSlots: [1],
        floor_pca: ['upper'],
      },
      {
        id: 'floor-z',
        name: '樓層',
        floating: true,
        fte_pca: 1,
        leave_type: null,
        availableSlots: [1, 4],
        floor_pca: ['upper'],
      },
    ] as any,
    existingAllocations: [],
  })

  const cppc = preview.teamReviews.CPPC
  assert.deepEqual(
    cppc.preferredPcaStatuses?.map((row) => [row.name, row.availability]),
    [
      ['光劭', 'unavailable'],
      ['阿明', 'later-ranked'],
    ]
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
