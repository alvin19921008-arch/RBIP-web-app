/**
 * Locks the Step 3.4 gym UX contract: tracker `Status` tooltip copy and Step 3.4
 * summary pills must follow canonical `TeamAllocationLog.summary.gymUsageStatus`
 * (see `types/schedule.ts` once `GymUsageStatus` / `gymUsageStatus` exist), not
 * legacy `gymSlotUsed` / `gymUsedAsLastResort` alone.
 *
 * Targets: `v2PcaTrackerTooltipModel.ts`, `step34ViewModel.ts`.
 */
import assert from 'node:assert/strict'

import type { FloatingPCAAllocationResultV2 } from '../../lib/algorithms/floatingPcaShared/contracts'
import { buildStep34TeamDetailViewModel } from '../../components/allocation/step34/step34ViewModel'
import { buildV2PcaTrackerTooltipModel } from '../../lib/features/schedule/v2PcaTrackerTooltipModel'
import { createEmptyTracker } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { Team } from '../../types/staff'

function emptyTeamRecord<T>(value: T): Record<Team, T> {
  return { FO: value, SMM: value, SFM: value, CPPC: value, MC: value, GMC: value, NSM: value, DRO: value }
}

async function main() {
  const tracker = createEmptyTracker()
  const team: Team = 'DRO'

  tracker[team].assignments.push({
    slot: 3,
    pcaId: 'float-a',
    pcaName: '少華',
    assignedIn: 'step34',
    allocationStage: 'repair',
    slotSelectionPhase: 'gym-last-resort',
  })

  const summary = tracker[team].summary
  summary.totalSlotsAssigned = 1
  summary.pendingMet = true
  summary.amPmBalanced = false
  summary.highestRankedSlotFulfilled = null
  summary.usedUnrankedSlot = false
  summary.preferredPCAUsed = false
  summary.repairAuditDefects = []

  // Canonical final state says last-resort gym; legacy flags intentionally disagree.
  ;(summary as { gymUsageStatus?: 'avoided' | 'used-last-resort' }).gymUsageStatus = 'used-last-resort'
  summary.gymSlotUsed = false
  summary.gymUsedAsLastResort = false

  const tooltip = buildV2PcaTrackerTooltipModel({ team, allocationLog: tracker[team], bufferAssignments: [] })
  assert.ok(tooltip, 'expected tooltip model when tracker rows exist')
  const statusSubvalue = tooltip.summaryCells.find((cell) => cell.label === 'Status')?.subvalue ?? ''
  assert.ok(
    statusSubvalue.includes('Gym used only as last resort'),
    `Status subvalue must follow canonical gymUsageStatus (expected "Gym used only as last resort"), got: ${statusSubvalue}`
  )

  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-dro',
      team: 'DRO',
      preferred_pca_ids: [],
      preferred_slots: [3],
      gym_schedule: 4,
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
  const gymPill = detail.summaryPills.find((pill) => pill.label.startsWith('Gym '))
  assert.equal(
    gymPill?.label,
    'Gym used only as last resort',
    'Step 3.4 summary pill must follow canonical gymUsageStatus when legacy flags disagree'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
