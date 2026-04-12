/**
 * Locks `primaryScenario` summary fields on `Step32TeamReview` (see
 * `lib/features/schedule/step32V2/step32PreferredReviewModel.ts`) and the
 * exact user-facing strings that should be produced via
 * `lib/features/schedule/step32V2/step32PreferredReviewCopy.ts`.
 */
import assert from 'node:assert/strict'

import { computeStep3V2ReservationPreview } from '../../lib/features/schedule/step3V2ReservationPreview'

async function main() {
  const preview = computeStep3V2ReservationPreview({
    pcaPreferences: [
      {
        id: 'pref-fo',
        team: 'FO',
        preferred_pca_ids: ['pref-only'],
        preferred_slots: [1, 3],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      },
    ],
    adjustedPendingFTE: { FO: 0.5, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 },
    floatingPCAs: [
      {
        id: 'pref-only',
        name: 'Preferred',
        floating: true,
        fte_pca: 1,
        leave_type: null,
        availableSlots: [3],
        floor_pca: ['upper'],
      },
      {
        id: 'floor-a',
        name: 'Floor',
        floating: true,
        fte_pca: 1,
        leave_type: null,
        availableSlots: [1, 3],
        floor_pca: ['upper'],
      },
    ] as any,
    existingAllocations: [],
  })

  const fo = preview.teamReviews.FO
  assert.equal(fo.reviewState, 'alternative')
  assert.equal(fo.primaryScenario?.recommendedLabel, 'Floor fills rank #1 and continues to rank #2')
  assert.equal(fo.primaryScenario?.preferredOutcomeLabel, 'Preferred can still take a later ranked slot')
  assert.equal(fo.primaryScenario?.tradeoff, 'continuity')
  assert.equal(fo.primaryScenario?.saveEffect, 'Reserving saves one slot only (+0.25).')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
