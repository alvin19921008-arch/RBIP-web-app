import assert from 'node:assert/strict'

import { allocateFloatingPCA_v2RankedSlot, type PCAData } from '../../lib/algorithms/pcaAllocation'
import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { Team } from '../../types/staff'

/**
 * Section A — after `applyExtraCoverageRoundRobin()` mutates allocations, the allocator must
 * re-run ranked V2 repair audit (and repair scoring loop) before freezing the final tracker.
 *
 * Contract: `tracker[team].summary.repairAuditDefects` must match a fresh
 * `detectRankedV2RepairDefects` pass on the final `result.allocations` (Kinds `B1`, `F1`, `A1`,
 * `C1` only — `A2` is omitted from the tracker summary today, so both sides filter `A2` out).
 *
 * Section B — `extraAfterNeedsPolicy` budgeted-under-assigned-first: extra slots are capped by
 * `budgetSlots` and favor the most under-assigned team per policy balances.
 */

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

function defaultPreference(team: Team): PCAPreference {
  return {
    id: `pref-${team}`,
    team,
    preferred_pca_ids: [],
    preferred_slots: [1, 2],
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
  }
}

function makePca(id: string, slots: number[]): PCAData {
  return {
    id,
    name: id,
    floating: true,
    special_program: null,
    fte_pca: 1,
    leave_type: null,
    is_available: true,
    team: null,
    availableSlots: slots,
    floor_pca: ['upper'],
  } as PCAData
}

type RepairDefect = ReturnType<typeof detectRankedV2RepairDefects>[number]

function signatureForDefects(defects: RepairDefect[]): string[] {
  return defects
    .map((defect) => {
      if (defect.kind === 'A2') {
        return `${defect.kind}:${defect.team}:${defect.pcaId}`
      }
      return `${defect.kind}:${defect.team}`
    })
    .sort((a, b) => a.localeCompare(b))
}

function defectsFromTrackerSummary(
  tracker: Awaited<ReturnType<typeof allocateFloatingPCA_v2RankedSlot>>['tracker']
): RepairDefect[] {
  const rows: RepairDefect[] = []
  for (const team of TEAMS) {
    const kinds = tracker[team].summary.repairAuditDefects ?? []
    for (const kind of kinds) {
      if (kind === 'A2') continue
      rows.push({ kind, team } as RepairDefect)
    }
  }
  return rows
}

function countExtraCoverageSlotEntries(
  extra: Record<string, Array<1 | 2 | 3 | 4>> | undefined
): number {
  if (!extra) return 0
  return Object.values(extra).reduce((sum, slots) => sum + slots.length, 0)
}

/** Section A — repair audit stays in sync after unbounded round-robin extra coverage (original f99). */
async function sectionRepairAuditAfterRoundRobinExtraCoverage() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const currentPendingFTE = emptyTeamRecord(0.25)
  const pcaPool: PCAData[] = [
    makePca('pool-a', [1, 2, 3, 4]),
    makePca('pool-b', [1, 2, 3, 4]),
    makePca('pool-c', [1, 2, 3, 4]),
    makePca('pool-d', [1, 2, 3, 4]),
    makePca('pool-e', [1, 2, 3, 4]),
    makePca('pool-f', [1, 2, 3, 4]),
    makePca('pool-g', [1, 2, 3, 4]),
    makePca('pool-h', [1, 2, 3, 4]),
    makePca('pool-i', [1, 2, 3, 4]),
    makePca('pool-j', [1, 2, 3, 4]),
    makePca('pool-k', [1, 2, 3, 4]),
    makePca('pool-l', [1, 2, 3, 4]),
    makePca('pool-m', [1, 2, 3, 4]),
    makePca('pool-n', [1, 2, 3, 4]),
    makePca('pool-o', [1, 2, 3, 4]),
    makePca('pool-p', [1, 2, 3, 4]),
  ]
  const pcaPreferences: PCAPreference[] = TEAMS.map((team) => defaultPreference(team))
  const existingAllocations: [] = []

  const result = await allocateFloatingPCA_v2RankedSlot({
    teamOrder,
    currentPendingFTE,
    existingAllocations,
    pcaPool,
    pcaPreferences,
    specialPrograms: [],
    mode: 'standard',
    extraCoverageMode: 'round-robin-team-order',
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [],
  })

  assert.ok(result.extraCoverageByStaffId, 'Fixture expects extra coverage assignments so post-extra behavior is exercised.')

  const teamPrefs = TEAMS.reduce(
    (record, team) => {
      record[team] = getTeamPreferenceInfo(team, pcaPreferences)
      return record
    },
    {} as Record<Team, ReturnType<typeof getTeamPreferenceInfo>>
  )

  const manualDefects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE: currentPendingFTE,
    pendingFTE: result.pendingPCAFTEPerTeam,
    allocations: result.allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations: existingAllocations,
  })

  const manualComparable = manualDefects.filter((defect) => defect.kind !== 'A2')
  const trackerComparable = defectsFromTrackerSummary(result.tracker)

  assert.deepEqual(
    signatureForDefects(manualComparable),
    signatureForDefects(trackerComparable),
    'Final tracker repairAuditDefects must be recomputed after extra coverage so it matches a fresh audit of the frozen allocation snapshot.'
  )
}

/** Section B — budgeted extra-after-needs: at most [budgetSlots] extras, under-assigned-first team wins. */
async function sectionBudgetedExtraAfterNeedsRespectsBudgetAndTeam() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const currentPendingFTE = emptyTeamRecord(0)
  currentPendingFTE.FO = 0.25
  const pcaPool: PCAData[] = [makePca('pool-a', [1, 2]), makePca('pool-b', [1, 2])]
  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-fo',
      team: 'FO',
      preferred_pca_ids: [],
      preferred_slots: [1],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]
  const existingAllocations: [] = []

  const balanceAfterRoundedNeedsByTeam = emptyTeamRecord(0)
  balanceAfterRoundedNeedsByTeam.FO = -2

  const result = await allocateFloatingPCA_v2RankedSlot({
    teamOrder,
    currentPendingFTE,
    existingAllocations,
    pcaPool,
    pcaPreferences,
    specialPrograms: [],
    mode: 'standard',
    extraCoverageMode: 'none',
    extraAfterNeedsPolicy: {
      mode: 'budgeted-under-assigned-first',
      budgetSlots: 1,
      balanceAfterRoundedNeedsByTeam,
      tieBreakSeed: '2026-04-20',
    },
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [],
  })

  const extraSlots = countExtraCoverageSlotEntries(result.extraCoverageByStaffId)
  assert.ok(
    extraSlots <= 1,
    `Expected at most one budgeted extra slot; got ${extraSlots} from extraCoverageByStaffId`
  )
  assert.ok(extraSlots >= 1, 'Expected fixture to place exactly one budgeted extra when required coverage is satisfied')

  const extraOnFo = result.tracker.FO.assignments.filter((row) => row.assignmentTag === 'extra')
  assert.equal(
    extraOnFo.length,
    1,
    'Expected the single budgeted extra to be attributed to FO (clearly most under-assigned in policy balances)'
  )
}

async function main() {
  await sectionRepairAuditAfterRoundRobinExtraCoverage()
  await sectionBudgetedExtraAfterNeedsRespectsBudgetAndTeam()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
