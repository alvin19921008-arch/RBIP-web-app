/**
 * Task A0b: Step 3.4 "Why this happened" includes a distinct Extra after needs bullet
 * when tracker rows use allocationStage `extra-coverage` (not raised-target / surplus grant copy).
 */
import assert from 'node:assert/strict'

import type { FloatingPCAAllocationResultV2 } from '../../lib/algorithms/floatingPcaShared/contracts'
import { buildStep34TeamDetailViewModel } from '../../features/schedule/ui/steps/step3-floating/substeps/step34-preview/step34ViewModel'
import { createEmptyTracker } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { Team } from '../../types/staff'

function emptyTeamRecord<T>(value: T): Record<Team, T> {
  return { FO: value, SMM: value, SFM: value, CPPC: value, MC: value, GMC: value, NSM: value, DRO: value }
}

async function main() {
  const tracker = createEmptyTracker()
  const team: Team = 'FO'

  tracker[team].assignments.push({
    slot: 2,
    pcaId: 'float-x',
    pcaName: 'Alex',
    assignedIn: 'step34',
    allocationStage: 'extra-coverage',
    slotSelectionPhase: 'ranked-primary',
  })

  const summary = tracker[team].summary
  summary.totalSlotsAssigned = 1
  summary.pendingMet = true
  summary.amPmBalanced = true
  summary.highestRankedSlotFulfilled = 1
  summary.usedUnrankedSlot = false
  summary.preferredPCAUsed = false
  summary.repairAuditDefects = []

  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-fo',
      team: 'FO',
      preferred_pca_ids: [],
      preferred_slots: [2, 3, 4],
      gym_schedule: 1,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]

  const result: FloatingPCAAllocationResultV2 = {
    allocations: [],
    pendingPCAFTEPerTeam: emptyTeamRecord(0),
    tracker,
  }

  const detail = buildStep34TeamDetailViewModel({ team, result, pcaPreferences })
  const extraBullet = detail.reasons.find((r) => r.text.includes('Extra after needs'))
  assert.ok(extraBullet, 'expected Extra after needs reason bullet')
  assert.equal(extraBullet?.tone, 'extra-after-needs')
  assert.equal(extraBullet?.extraAfterNeedsCount, 1)
  assert.ok(
    extraBullet.text.includes('required floating need was already satisfied'),
    `expected satisfaction clause in reason, got: ${extraBullet.text}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
