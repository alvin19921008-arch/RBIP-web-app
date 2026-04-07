import assert from 'node:assert/strict'

import { getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'

async function main() {
  const pref: PCAPreference = {
    id: 'pref-fo',
    team: 'FO',
    preferred_pca_ids: ['pca-a', 'pca-b'],
    preferred_slots: [1, 3],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
  }

  const info = getTeamPreferenceInfo('FO', [pref])

  assert.deepEqual(info.rankedSlots, [1, 3])
  assert.deepEqual(info.unrankedNonGymSlots, [2])
  assert.deepEqual(info.duplicateRankOrder, [1, 3, 2])
  assert.equal(info.gymSlot, 4)
  assert.equal(info.avoidGym, true)
  assert.equal(info.preferredSlot, 1)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
