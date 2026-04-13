import assert from 'node:assert/strict'

import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { generateRepairCandidates } from '../../lib/algorithms/floatingPcaV2/repairMoves'
import { type PCAData } from '../../lib/algorithms/pcaAllocation'
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

function countSlotsForTeam(allocations: PCAAllocation[], team: Team): number {
  return allocations.reduce((count, allocation) => {
    return (
      count +
      (allocation.slot1 === team ? 1 : 0) +
      (allocation.slot2 === team ? 1 : 0) +
      (allocation.slot3 === team ? 1 : 0) +
      (allocation.slot4 === team ? 1 : 0)
    )
  }, 0)
}

function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const initialPendingFTE = { ...emptyTeamRecord(0), FO: 0.25, GMC: 0.5 }
  const pendingFTE = emptyTeamRecord(0)

  const pcaPool: PCAData[] = [
    makePca('shared-fo-gmc', [1, 3]),
    makePca('gmc-second', [4]),
  ]

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
    {
      id: 'pref-gmc',
      team: 'GMC',
      preferred_pca_ids: [],
      preferred_slots: [1],
      gym_schedule: 2,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]

  const allocations: PCAAllocation[] = [
    {
      id: 'alloc-shared',
      schedule_id: '',
      staff_id: 'shared-fo-gmc',
      team: 'FO',
      fte_pca: 1,
      fte_remaining: 0.5,
      slot_assigned: 0.5,
      slot_whole: null,
      slot1: 'FO',
      slot2: null,
      slot3: 'GMC',
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
    {
      id: 'alloc-gmc-second',
      schedule_id: '',
      staff_id: 'gmc-second',
      team: 'GMC',
      fte_pca: 1,
      fte_remaining: 0.75,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: null,
      slot2: null,
      slot3: null,
      slot4: 'GMC',
      leave_type: null,
      special_program_ids: null,
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
    baselineAllocations: [],
  })

  const b1Defect = defects.find((defect) => defect.kind === 'B1' && defect.team === 'GMC')
  assert.ok(b1Defect, 'GMC should surface a B1 ranked-gap defect in the sway fixture.')

  const candidates = generateRepairCandidates({
    defect: b1Defect,
    allocations,
    pcaPool,
    teamPrefs,
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    baselineAllocations: [],
  })

  const samePcaSway = candidates.find(
    (candidate) =>
      slotOwner(candidate.allocations, 'shared-fo-gmc', 1) === 'GMC' &&
      slotOwner(candidate.allocations, 'shared-fo-gmc', 3) === 'FO' &&
      slotOwner(candidate.allocations, 'gmc-second', 4) === 'GMC' &&
      countSlotsForTeam(candidate.allocations, 'GMC') === 2 &&
      countSlotsForTeam(candidate.allocations, 'FO') === 1
  )

  assert.equal(
    Boolean(samePcaSway),
    true,
    'B1 repair should allow a same-PCA sway that upgrades GMC from slot 3 to ranked slot 1 without creating surplus coverage.'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
