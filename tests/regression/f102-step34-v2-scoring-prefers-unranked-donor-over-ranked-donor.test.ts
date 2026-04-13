import assert from 'node:assert/strict'

import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { generateRepairCandidates } from '../../lib/algorithms/floatingPcaV2/repairMoves'
import {
  buildRankedSlotAllocationScore,
  compareScores,
} from '../../lib/algorithms/floatingPcaV2/scoreSchedule'
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

function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const initialPendingFTE = { ...emptyTeamRecord(0), SMM: 0.5, GMC: 0.5, DRO: 1 }
  const pendingFTE = emptyTeamRecord(0)

  const pcaPool: PCAData[] = [
    makePca('smm-slot-a', [1]),
    makePca('smm-slot-b', [1]),
    makePca('dro-slot-a', [1]),
    makePca('gmc-flex', [3, 4]),
  ]

  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-smm',
      team: 'SMM',
      preferred_pca_ids: [],
      preferred_slots: [1],
      gym_schedule: 2,
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
    {
      id: 'pref-dro',
      team: 'DRO',
      preferred_pca_ids: [],
      preferred_slots: [],
      gym_schedule: 3,
      avoid_gym_schedule: false,
      floor_pca_selection: 'upper',
    },
  ]

  const allocations: PCAAllocation[] = [
    {
      id: 'alloc-smm-a',
      schedule_id: '',
      staff_id: 'smm-slot-a',
      team: 'SMM',
      fte_pca: 1,
      fte_remaining: 0.75,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: 'SMM',
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
    {
      id: 'alloc-smm-b',
      schedule_id: '',
      staff_id: 'smm-slot-b',
      team: 'SMM',
      fte_pca: 1,
      fte_remaining: 0.75,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: 'SMM',
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
    {
      id: 'alloc-dro-a',
      schedule_id: '',
      staff_id: 'dro-slot-a',
      team: 'DRO',
      fte_pca: 1,
      fte_remaining: 0.75,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: 'DRO',
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
    {
      id: 'alloc-gmc-flex',
      schedule_id: '',
      staff_id: 'gmc-flex',
      team: 'GMC',
      fte_pca: 1,
      fte_remaining: 0.5,
      slot_assigned: 0.5,
      slot_whole: null,
      slot1: null,
      slot2: null,
      slot3: 'GMC',
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
  assert.ok(b1Defect, 'GMC should have a recoverable ranked-gap defect in this fixture.')

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

  const smmSwap = candidates.find(
    (candidate) => candidate.sortKey === 'b1:swap:smm-slot-a:1:gmc-flex:3'
  )
  const droSwap = candidates.find(
    (candidate) => candidate.sortKey === 'b1:swap:dro-slot-a:1:gmc-flex:3'
  )

  assert.ok(smmSwap, 'Fixture should produce an SMM-ranked donor swap candidate.')
  assert.ok(droSwap, 'Fixture should produce a DRO-unranked donor swap candidate.')

  const smmDefects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations: smmSwap.allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations: [],
  })
  const droDefects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations: droSwap.allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations: [],
  })

  const smmScore = buildRankedSlotAllocationScore({
    allocations: smmSwap.allocations,
    initialPendingFTE,
    pendingFTE,
    teamOrder,
    defects: smmDefects,
    teamPrefs,
  })
  const droScore = buildRankedSlotAllocationScore({
    allocations: droSwap.allocations,
    initialPendingFTE,
    pendingFTE,
    teamOrder,
    defects: droDefects,
    teamPrefs,
  })

  assert.equal(
    compareScores(droScore, smmScore) < 0,
    true,
    'Scoring should prefer rescuing GMC from an unranked donor (DRO) over an equally-scored ranked donor (SMM) when both candidates satisfy the requester.'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
