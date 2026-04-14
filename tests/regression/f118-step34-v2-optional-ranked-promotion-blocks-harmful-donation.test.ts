import assert from 'node:assert/strict'

import {
  buildRankedV2RepairAuditState,
  donationWouldBreakDonorRankCoverage,
  detectRankedV2RepairDefects,
} from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { type PCAData } from '../../lib/algorithms/pcaAllocation'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

/**
 * Ranked donor protection: donating the donor's sole ranked true Step 3 slot would break GMC's
 * ranked floor. Optional promotion post-checks reuse `detectRankedV2RepairDefects`, so harmful
 * donations must not surface as accepted P1 outcomes.
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

function buildTeamPrefs(pcaPreferences: PCAPreference[]) {
  return TEAMS.reduce(
    (record, team) => {
      record[team] = getTeamPreferenceInfo(team, pcaPreferences)
      return record
    },
    {} as Record<Team, ReturnType<typeof getTeamPreferenceInfo>>
  )
}

function main() {
  const teamOrder: Team[] = ['CPPC', 'GMC', 'FO', 'SMM', 'SFM', 'MC', 'NSM', 'DRO']
  const initialPendingFTE = { ...emptyTeamRecord(0), GMC: 0.25 }
  const pendingFTE = { ...initialPendingFTE }

  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-gmc',
      team: 'GMC',
      preferred_pca_ids: ['donor-pca'],
      preferred_slots: [1, 4],
      gym_schedule: 3,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]
  const teamPrefs = buildTeamPrefs(pcaPreferences)
  const pcaPool = [makePca('donor-pca', [1, 4])]

  const allocations: PCAAllocation[] = [
    {
      id: 'alloc-donor',
      schedule_id: '',
      staff_id: 'donor-pca',
      team: null,
      fte_pca: 1,
      fte_remaining: 0.75,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: 'GMC',
      slot2: 'GMC',
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
  ]
  const baselineAllocations: PCAAllocation[] = []

  const state = buildRankedV2RepairAuditState({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations,
  })

  assert.ok(
    donationWouldBreakDonorRankCoverage(state, 'GMC', 'donor-pca', 1),
    'Donor must be classified as harmful to rank coverage if slot 1 is donated away while ranked slots remain required.'
  )

  const cleared: PCAAllocation[] = allocations.map((row) =>
    row.staff_id === 'donor-pca' ? { ...row, slot1: null, slot_assigned: 0.25, fte_remaining: 0.75 } : { ...row }
  )

  const afterDefects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations: cleared,
    pcaPool,
    teamPrefs,
    baselineAllocations,
  })
  assert.ok(
    afterDefects.some((d) => d.kind === 'B1' && d.team === 'GMC'),
    'Stripping the donor’s ranked true Step 3 slot without replacement must surface as a ranked-gap defect the optional promotion pass rejects.'
  )
}

main()
