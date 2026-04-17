import assert from 'node:assert/strict'

import { STEP32_CONTINUITY_TRADEOFF_PATH_NOTE } from '../../lib/features/schedule/step32V2/step32PreferredReviewCopy'
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

function makePca(id: string, availableSlots: number[], floor?: 'upper' | 'lower'): PCAData {
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
    floor_pca: floor ? [floor] : undefined,
  } as PCAData
}

async function main() {
  const preview = computeStep3V2ReservationPreview({
    pcaPreferences: [
      {
        id: 'pref-fo',
        team: 'FO',
        preferred_pca_ids: ['preferred-a'],
        preferred_slots: [1, 3],
        gym_schedule: 4,
        avoid_gym_schedule: true,
        floor_pca_selection: 'upper',
      } satisfies PCAPreference,
    ],
    adjustedPendingFTE: { ...emptyTeamRecord(0), FO: 0.5 },
    floatingPCAs: [makePca('preferred-a', [3], 'upper'), makePca('floor-m', [1, 3], 'upper')],
    existingAllocations: [],
  }) as any

  const fo = preview.teamReviews?.FO
  assert.equal(fo?.systemSuggestedPathKey, 'ranked:1')
  assert.equal(
    fo?.pathOptions?.find((option: { pathKey: string }) => option.pathKey === 'ranked:3')?.commitState,
    'committable_with_tradeoff'
  )
  assert.equal(
    fo?.pathOptions?.find((option: { pathKey: string }) => option.pathKey === 'ranked:3')?.tradeoffKind,
    'continuity'
  )
  assert.deepEqual(
    fo?.pathOptions?.find((option: { pathKey: string }) => option.pathKey === 'ranked:3')?.note,
    STEP32_CONTINUITY_TRADEOFF_PATH_NOTE
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
