import assert from 'node:assert/strict'

import { type PCAData } from '../../lib/algorithms/pcaAllocation'
import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { generateRepairCandidates } from '../../lib/algorithms/floatingPcaV2/repairMoves'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
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

function buildTeamPrefs(pcaPreferences: PCAPreference[]) {
  return TEAMS.reduce(
    (record, team) => {
      record[team] = getTeamPreferenceInfo(team, pcaPreferences)
      return record
    },
    {} as Record<Team, ReturnType<typeof getTeamPreferenceInfo>>
  )
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

function slotOwner(allocations: PCAAllocation[], pcaId: string, slot: 1 | 2 | 3 | 4) {
  const allocation = allocations.find((row) => row.staff_id === pcaId)
  if (!allocation) return null
  return slot === 1
    ? allocation.slot1
    : slot === 2
      ? allocation.slot2
      : slot === 3
        ? allocation.slot3
        : allocation.slot4
}

async function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const initialPendingFTE = { ...emptyTeamRecord(0), SMM: 0.25 }
  const pendingFTE = { ...emptyTeamRecord(0), SMM: 0.25 }
  const baselineAllocations: PCAAllocation[] = [
    {
      id: 'baseline-smm-1',
      schedule_id: '',
      staff_id: 'baseline-smm-1',
      team: 'SMM',
      fte_pca: 0.25,
      fte_remaining: 0,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: 'SMM',
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
  ]
  const allocations: PCAAllocation[] = [
    ...baselineAllocations.map((allocation) => ({ ...allocation })),
    {
      id: 'floating-a',
      schedule_id: '',
      staff_id: 'floating-a',
      team: 'FO',
      fte_pca: 0.25,
      fte_remaining: 0,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: 'FO',
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
  ]
  const pcaPool: PCAData[] = [makePca('floating-a', [1]), makePca('fo-fallback', [2])]
  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-fo',
      team: 'FO',
      preferred_pca_ids: [],
      preferred_slots: [2],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
    {
      id: 'pref-smm',
      team: 'SMM',
      preferred_pca_ids: [],
      preferred_slots: [1],
      gym_schedule: 2,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]
  const teamPrefs = buildTeamPrefs(pcaPreferences)

  const defects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations,
  })

  assert.equal(
    slotOwner(allocations, 'floating-a', 1),
    'FO',
    'Post-draft setup must give FO the contested slot before repair.'
  )
  assert.equal(
    slotOwner(allocations, 'floating-a', 2),
    null,
    'Post-draft setup must leave the fallback slot open.'
  )
  assert.equal(
    defects.some((defect) => defect.kind === 'F1' && defect.team === 'SMM'),
    true,
    'Pending SMM should be flagged for fairness-floor repair when only a bounded rescue can produce its first true Step 3 floating slot.'
  )

  const f1Candidates = generateRepairCandidates({
    defect: { kind: 'F1', team: 'SMM' },
    allocations,
    pcaPool,
    teamPrefs,
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    baselineAllocations,
  })
  assert.equal(
    f1Candidates.some(
      (candidate) =>
        slotOwner(candidate.allocations, 'floating-a', 1) === 'SMM' &&
        slotOwner(candidate.allocations, 'fo-fallback', 2) === 'FO'
    ),
    true,
    'F1 repair should allow a bounded rescue even when the rescued team already owns that slot in baseline coverage.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
