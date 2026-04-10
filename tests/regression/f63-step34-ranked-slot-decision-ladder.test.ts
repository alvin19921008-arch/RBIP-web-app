import assert from 'node:assert/strict'

import { allocateFloatingPCA_v2RankedSlot } from '../../lib/algorithms/pcaAllocation'
import type { PCAData } from '../../lib/algorithms/pcaAllocation'
import type { PCAPreference } from '../../types/allocation'
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

function makePca(id: string, slots: number[], floor?: 'upper' | 'lower'): PCAData {
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
    floor_pca: floor ? [floor] : undefined,
  } as PCAData
}

function makePreference(team: Team, rankedSlots: number[], preferredPcaIds: string[]): PCAPreference {
  return {
    id: `pref-${team}`,
    team,
    preferred_pca_ids: preferredPcaIds,
    preferred_slots: rankedSlots,
    gym_schedule: 4,
    avoid_gym_schedule: true,
    floor_pca_selection: 'upper',
  }
}

function slotOwner(result: Awaited<ReturnType<typeof allocateFloatingPCA_v2RankedSlot>>, pcaId: string, slot: 1 | 2 | 3 | 4) {
  const allocation = result.allocations.find((row) => row.staff_id === pcaId)
  if (!allocation) return null
  return slot === 1 ? allocation.slot1 : slot === 2 ? allocation.slot2 : slot === 3 ? allocation.slot3 : allocation.slot4
}

async function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

  const rankFirstResult = await allocateFloatingPCA_v2RankedSlot({
    teamOrder,
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.5 },
    existingAllocations: [],
    pcaPool: [
      makePca('floor-1', [1, 3], 'upper'),
      makePca('preferred-a', [3], 'upper'),
      makePca('other-1', [2], 'lower'),
    ],
    pcaPreferences: [makePreference('FO', [1, 3], ['preferred-a'])],
    specialPrograms: [],
  })

  assert.equal(slotOwner(rankFirstResult, 'floor-1', 1), 'FO')
  assert.equal(slotOwner(rankFirstResult, 'floor-1', 3), 'FO')
  assert.equal(rankFirstResult.pendingPCAFTEPerTeam.FO, 0)
  assert.equal(rankFirstResult.tracker.FO.assignments[0]?.fulfilledSlotRank, 1)

  const unrankedBeforeDuplicate = await allocateFloatingPCA_v2RankedSlot({
    teamOrder,
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.5 },
    existingAllocations: [
      {
        id: 'existing-fo',
        schedule_id: '',
        staff_id: 'existing-fo',
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
    ],
    pcaPool: [makePca('other-1', [2], 'upper')],
    pcaPreferences: [makePreference('FO', [1], [])],
    specialPrograms: [],
  })

  assert.equal(slotOwner(unrankedBeforeDuplicate, 'other-1', 2), 'FO')
  assert.equal(unrankedBeforeDuplicate.tracker.FO.assignments[0]?.slotSelectionPhase, 'unranked-unused')

  const gymLastResort = await allocateFloatingPCA_v2RankedSlot({
    teamOrder,
    currentPendingFTE: { ...emptyTeamRecord(0), FO: 0.25 },
    existingAllocations: [],
    pcaPool: [makePca('gym-only', [4], 'upper')],
    pcaPreferences: [makePreference('FO', [1, 3], [])],
    specialPrograms: [],
  })

  assert.equal(slotOwner(gymLastResort, 'gym-only', 4), 'FO')
  assert.equal(gymLastResort.tracker.FO.assignments[0]?.slotSelectionPhase, 'gym-last-resort')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
