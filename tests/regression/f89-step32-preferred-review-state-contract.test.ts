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

function makePreference(partial: Partial<PCAPreference> & { id: string; team: Team }): PCAPreference {
  return {
    preferred_pca_ids: [],
    preferred_slots: [],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
    ...partial,
  }
}

function getReview(preference: PCAPreference, floatingPCAs: PCAData[], pending = 0.25): any {
  const preview = computeStep3V2ReservationPreview({
    pcaPreferences: [preference],
    adjustedPendingFTE: { ...emptyTeamRecord(0), [preference.team]: pending },
    floatingPCAs,
    existingAllocations: [],
  }) as any
  return preview.teamReviews?.[preference.team]
}

async function main() {
  assert.equal(
    getReview(
      makePreference({
        id: 'pref-d',
        team: 'DRO',
        preferred_pca_ids: [],
        preferred_slots: [],
      }),
      [makePca('any', [1])]
    )?.reviewState,
    'not_applicable'
  )

  assert.equal(
    getReview(
      makePreference({
        id: 'pref-b',
        team: 'GMC',
        preferred_pca_ids: [],
        preferred_slots: [2],
      }),
      [makePca('any', [2])]
    )?.reviewState,
    'not_applicable'
  )

  assert.equal(
    getReview(
      makePreference({
        id: 'pref-c-matched',
        team: 'CPPC',
        preferred_pca_ids: ['c-match'],
        preferred_slots: [],
      }),
      [makePca('c-match', [2], 'upper')]
    )?.reviewState,
    'matched'
  )

  assert.equal(
    getReview(
      makePreference({
        id: 'pref-c-unavailable',
        team: 'MC',
        preferred_pca_ids: ['missing'],
        preferred_slots: [],
      }),
      [makePca('other', [1], 'upper')]
    )?.reviewState,
    'unavailable'
  )

  assert.equal(
    getReview(
      makePreference({
        id: 'pref-a-matched',
        team: 'FO',
        preferred_pca_ids: ['a-match'],
        preferred_slots: [1, 3],
      }),
      [makePca('a-match', [1, 3], 'upper'), makePca('floor', [1, 3], 'upper')],
      0.5
    )?.reviewState,
    'matched'
  )

  assert.equal(
    getReview(
      makePreference({
        id: 'pref-a-alternative',
        team: 'SMM',
        preferred_pca_ids: ['a-alt'],
        preferred_slots: [1, 3],
      }),
      [makePca('a-alt', [3], 'upper'), makePca('floor', [1, 3], 'upper')],
      0.5
    )?.reviewState,
    'alternative'
  )

  assert.equal(
    getReview(
      makePreference({
        id: 'pref-a-unavailable',
        team: 'SFM',
        preferred_pca_ids: ['a-missing'],
        preferred_slots: [1, 3],
      }),
      [makePca('floor', [1, 3], 'upper')],
      0.5
    )?.reviewState,
    'unavailable'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
