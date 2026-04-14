import assert from 'node:assert/strict'

import { allocateFloatingPCA_v2RankedSlot, type PCAData } from '../../lib/algorithms/pcaAllocation'
import { detectRankedV2GymAvoidableDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

/**
 * End-to-end: when gym occupancy is unavoidable (PCA cannot host any non-gym slot),
 * Part III must not emit `G1` on the final allocation (true last resort — mirrors f121 tail).
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

async function main() {
  const teamOrder: Team[] = [...TEAMS]
  const currentPendingFTE = { ...emptyTeamRecord(0), FO: 0.25 }
  const existingAllocations: PCAAllocation[] = [
    {
      id: 'alloc-float-b',
      schedule_id: '',
      staff_id: 'float-b',
      team: 'FO',
      fte_pca: 1,
      fte_remaining: 0.5,
      slot_assigned: 0.5,
      slot_whole: null,
      slot1: null,
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
  ]

  const pcaPreferences: PCAPreference[] = TEAMS.map((team) =>
    team === 'FO'
      ? {
          id: 'pref-fo',
          team: 'FO',
          preferred_pca_ids: [],
          preferred_slots: [4],
          gym_schedule: 4,
          avoid_gym_schedule: true,
          floor_pca_selection: 'upper',
        }
      : defaultPreference(team)
  )

  const pcaPool = [makePca('float-b', [4])]

  const result = await allocateFloatingPCA_v2RankedSlot({
    teamOrder,
    currentPendingFTE,
    existingAllocations,
    pcaPool,
    pcaPreferences,
    specialPrograms: [],
    mode: 'standard',
    extraCoverageMode: 'none',
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [],
  })

  const teamPrefs = TEAMS.reduce(
    (acc, team) => {
      acc[team] = getTeamPreferenceInfo(team, pcaPreferences)
      return acc
    },
    {} as Record<Team, ReturnType<typeof getTeamPreferenceInfo>>
  )

  assert.deepEqual(
    detectRankedV2GymAvoidableDefects({
      teamOrder,
      initialPendingFTE: currentPendingFTE,
      pendingFTE: result.pendingPCAFTEPerTeam,
      allocations: result.allocations,
      pcaPool,
      teamPrefs,
      baselineAllocations: existingAllocations,
    }),
    [],
    'G1 must not be raised when gym is the only feasible slot (last resort).'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
