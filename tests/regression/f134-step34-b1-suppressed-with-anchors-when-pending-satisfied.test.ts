import assert from 'node:assert/strict'

import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
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
  const initialPendingFTE = { ...emptyTeamRecord(0), FO: 0.25, SMM: 0.25 }
  const pendingFTE = emptyTeamRecord(0)

  const pcaPool: PCAData[] = [makePca('fo-pca', [1, 2, 3, 4]), makePca('smm-donor', [1, 2, 3, 4])]

  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-fo',
      team: 'FO',
      preferred_pca_ids: [],
      preferred_slots: [1, 2],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
    {
      id: 'pref-smm',
      team: 'SMM',
      preferred_pca_ids: [],
      preferred_slots: [3],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]

  const allocations: PCAAllocation[] = [
    {
      id: 'alloc-fo',
      schedule_id: '',
      staff_id: 'fo-pca',
      team: 'FO',
      fte_pca: 0.25,
      fte_remaining: 0,
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
      id: 'alloc-smm',
      schedule_id: '',
      staff_id: 'smm-donor',
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

  const teamPrefs = buildTeamPrefs(pcaPreferences)

  const withoutAnchors = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations: [],
  })

  assert.equal(
    withoutAnchors.some((d) => d.kind === 'B1' && d.team === 'FO'),
    true,
    'Draft-only ranked gap (no Step 3.2/3.3 anchors) should still raise B1 when higher-ranked coverage is recoverable while remaining pending is already satisfied.'
  )

  const withAnchors = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations: [],
    committedStep3Anchors: [{ team: 'FO', slot: 2, pcaId: 'fo-pca' }],
  })

  assert.equal(
    withAnchors.some((d) => d.kind === 'B1' && d.team === 'FO'),
    false,
    'Once Step 3.2/3.3 commits pin FO floating coverage, B1 must not fire when remaining pending is already satisfied — the user should not be forced into an extra ranked rescue slot.'
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
