import assert from 'node:assert/strict'

import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
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
  const initialPendingFTE = { ...emptyTeamRecord(0), FO: 0.25, DRO: 1 }
  const pendingFTE = emptyTeamRecord(0)

  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-fo',
      team: 'FO',
      preferred_pca_ids: [],
      preferred_slots: [2, 1],
      gym_schedule: 4,
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

  const teamPrefs = buildTeamPrefs(pcaPreferences)
  const pcaPool: PCAData[] = [makePca('fo-slot-2', [2]), makePca('dro-slot-1', [1, 2, 3, 4])]

  const currentAllocations: PCAAllocation[] = [
    {
      id: 'alloc-fo-slot-2',
      schedule_id: '',
      staff_id: 'fo-slot-2',
      team: 'FO',
      fte_pca: 1,
      fte_remaining: 0.75,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: null,
      slot2: 'FO',
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
    {
      id: 'alloc-dro',
      schedule_id: '',
      staff_id: 'dro-slot-1',
      team: 'DRO',
      fte_pca: 1,
      fte_remaining: 0,
      slot_assigned: 1,
      slot_whole: null,
      slot1: 'DRO',
      slot2: 'DRO',
      slot3: 'DRO',
      slot4: 'DRO',
      leave_type: null,
      special_program_ids: null,
    },
  ]

  const donationAllocations: PCAAllocation[] = [
    currentAllocations[0],
    {
      ...currentAllocations[1],
      slot1: 'FO',
      slot2: 'DRO',
      slot3: 'DRO',
      slot4: 'DRO',
      slot_assigned: 0.75,
      fte_remaining: 0.25,
    },
  ]

  const currentDefects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations: currentAllocations,
    pcaPool,
    teamPrefs,
    baselineAllocations: [],
  })

  assert.equal(
    currentDefects.some((defect) => defect.kind === 'B1' && defect.team === 'FO'),
    false,
    'A team with one floating slot target should not be treated as missing ranked coverage once its highest-priority relevant ranked slot is already covered.'
  )

  const donationDefects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE: { ...pendingFTE, DRO: 0.25 },
    allocations: donationAllocations,
    pcaPool,
    teamPrefs,
    baselineAllocations: [],
  })

  const currentScore = buildRankedSlotAllocationScore({
    allocations: currentAllocations,
    initialPendingFTE,
    pendingFTE,
    teamOrder,
    defects: currentDefects,
    teamPrefs,
  })
  const donationScore = buildRankedSlotAllocationScore({
    allocations: donationAllocations,
    initialPendingFTE,
    pendingFTE: { ...pendingFTE, DRO: 0.25 },
    teamOrder,
    defects: donationDefects,
    teamPrefs,
  })

  assert.equal(
    compareScores(currentScore, donationScore) < 0,
    true,
    'Once FO no longer falsely triggers B1, stealing an extra lower-priority ranked slot from DRO should score worse than keeping DRO fully met.'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
