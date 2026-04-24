import assert from 'node:assert/strict'

import { allocateFloatingPCA_v2RankedSlot, type PCAData } from '../../lib/algorithms/pcaAllocation'
import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { roundToNearestQuarterWithMidpoint } from '../../lib/utils/rounding'
import { getTeamPreferenceInfo, TEAMS } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

/**
 * After a full v2 run that can perform A1 duplicate relief, no team that started Step 3.4
 * with meaningful pending should still be flagged for F1 (fairness floor when a bounded rescue
 * is still available).
 *
 * @see docs/superpowers/plans/2026-04-24-floating-pca-v2-a1-global-duplicate-repair-plan.md Task 5
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

function makePca(id: string, slots: number[], floor: 'upper' | 'lower'): PCAData {
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
    floor_pca: [floor],
  } as PCAData
}

function allocRow(
  staffId: string,
  team: Team,
  slot: 1 | 2 | 3 | 4,
  owner: Team
): PCAAllocation {
  return {
    id: `id-${staffId}`,
    schedule_id: '',
    staff_id: staffId,
    team,
    fte_pca: 1,
    fte_remaining: 0.75,
    slot_assigned: 0.25,
    slot_whole: null,
    slot1: slot === 1 ? owner : null,
    slot2: slot === 2 ? owner : null,
    slot3: slot === 3 ? owner : null,
    slot4: slot === 4 ? owner : null,
    leave_type: null,
    special_program_ids: null,
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

function meaningfulInitialPendingFTE(pending: Record<Team, number>, team: Team): boolean {
  return roundToNearestQuarterWithMidpoint(pending[team] ?? 0) >= 0.25
}

/** Same pool as f133 — A1 can fire with widened audit; full allocator may apply duplicate repair. */
function defaultPreferences(): PCAPreference[] {
  return [
    { id: 'p-fo', team: 'FO', preferred_pca_ids: [], preferred_slots: [1], gym_schedule: 4, avoid_gym_schedule: true, floor_pca_selection: 'upper' },
    { id: 'p-smm', team: 'SMM', preferred_pca_ids: [], preferred_slots: [1], gym_schedule: 4, avoid_gym_schedule: true, floor_pca_selection: 'upper' },
    { id: 'p-sfm', team: 'SFM', preferred_pca_ids: [], preferred_slots: [1], gym_schedule: 4, avoid_gym_schedule: true, floor_pca_selection: 'upper' },
    { id: 'p-cppc', team: 'CPPC', preferred_pca_ids: [], preferred_slots: [1], gym_schedule: 4, avoid_gym_schedule: true, floor_pca_selection: 'upper' },
    { id: 'p-mc', team: 'MC', preferred_pca_ids: [], preferred_slots: [1], gym_schedule: 4, avoid_gym_schedule: true, floor_pca_selection: 'upper' },
    { id: 'p-gmc', team: 'GMC', preferred_pca_ids: [], preferred_slots: [1], gym_schedule: 4, avoid_gym_schedule: true, floor_pca_selection: 'upper' },
    {
      id: 'p-nsm',
      team: 'NSM',
      preferred_pca_ids: [],
      preferred_slots: [2, 4],
      gym_schedule: 3,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
    {
      id: 'p-dro',
      team: 'DRO',
      preferred_pca_ids: [],
      preferred_slots: [2],
      gym_schedule: 3,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]
}

async function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

  const pcaPool: PCAData[] = [
    makePca('dro-dup-a', [2], 'upper'),
    makePca('dro-dup-b', [2], 'upper'),
    makePca('nsm-clean', [4], 'upper'),
  ]

  const pcaPreferences = defaultPreferences()
  const initialPendingFTE = { ...emptyTeamRecord(0), NSM: 0.5, DRO: 0.5 }

  const existingAllocations: PCAAllocation[] = [
    allocRow('dro-dup-a', 'DRO', 2, 'DRO'),
    allocRow('dro-dup-b', 'DRO', 2, 'DRO'),
    allocRow('nsm-clean', 'NSM', 4, 'NSM'),
  ]

  const result = await allocateFloatingPCA_v2RankedSlot({
    teamOrder,
    currentPendingFTE: initialPendingFTE,
    existingAllocations,
    pcaPool,
    pcaPreferences,
    specialPrograms: [],
    mode: 'standard',
    extraCoverageMode: 'none',
    preferenceSelectionMode: 'legacy',
    selectedPreferenceAssignments: [],
  })

  const teamPrefs = buildTeamPrefs(pcaPreferences)
  const finalDefects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE: result.pendingPCAFTEPerTeam,
    allocations: result.allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations: existingAllocations,
  })

  for (const team of TEAMS) {
    if (!meaningfulInitialPendingFTE(initialPendingFTE, team)) continue
    const f1ForTeam = finalDefects.find((d) => d.kind === 'F1' && d.team === team)
    assert.equal(
      f1ForTeam,
      undefined,
      `No F1 for team ${team} that had meaningful initial pending after allocator (A1 / repair path).`
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
