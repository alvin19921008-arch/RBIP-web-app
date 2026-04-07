import assert from 'node:assert/strict'

import { allocateFloatingPCA_v2, type PCAData } from '../../lib/algorithms/pcaAllocation'
import type { PCAPreference, SpecialProgram } from '../../types/allocation'
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

function slotCountsForTeam(allocations: PCAAllocation[], team: Team): Record<number, number> {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const alloc of allocations) {
    if (alloc.slot1 === team) counts[1]++
    if (alloc.slot2 === team) counts[2]++
    if (alloc.slot3 === team) counts[3]++
    if (alloc.slot4 === team) counts[4]++
  }
  return counts
}

async function run(params: {
  pending: number
  preferences: PCAPreference[]
  pcaPool: PCAData[]
  existingAllocations?: PCAAllocation[]
}): Promise<Awaited<ReturnType<typeof allocateFloatingPCA_v2>>> {
  const currentPendingFTE = emptyTeamRecord(0)
  currentPendingFTE.FO = params.pending
  const specialPrograms: SpecialProgram[] = []
  return allocateFloatingPCA_v2({
    mode: 'standard',
    teamOrder: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
    currentPendingFTE,
    existingAllocations: params.existingAllocations ?? [],
    pcaPool: params.pcaPool,
    pcaPreferences: params.preferences,
    specialPrograms,
  })
}

async function main() {
  // Scenario 1: rank #1 beats preferred PCA when preferred PCA can't cover rank #1.
  {
    const result = await run({
      pending: 0.5,
      preferences: [
        {
          id: 'pref-fo',
          team: 'FO',
          preferred_pca_ids: ['preferred-a'],
          preferred_slots: [1, 3],
          avoid_gym_schedule: true,
          gym_schedule: 4,
          floor_pca_selection: 'upper',
        },
      ],
      pcaPool: [
        {
          id: 'preferred-a',
          name: 'Preferred A',
          floating: true,
          special_program: null,
          fte_pca: 0.25,
          leave_type: null,
          is_available: true,
          team: null,
          availableSlots: [3],
          floor_pca: ['upper'],
        } as any,
        {
          id: 'floor-u',
          name: 'Floor U',
          floating: true,
          special_program: null,
          fte_pca: 0.5,
          leave_type: null,
          is_available: true,
          team: null,
          availableSlots: [1, 3],
          floor_pca: ['upper'],
        } as any,
      ],
    })

    const counts = slotCountsForTeam(result.allocations, 'FO')
    assert.equal(counts[1] >= 1, true, 'Expected rank #1 slot to be fulfilled before lower-ranked slot-only preference')
    assert.equal(result.pendingPCAFTEPerTeam.FO, 0)
  }

  // Scenario 2: unused unranked slot must beat duplicate slot.
  {
    const result = await run({
      pending: 0.5,
      preferences: [
        {
          id: 'pref-fo-2',
          team: 'FO',
          preferred_pca_ids: [],
          preferred_slots: [1],
          avoid_gym_schedule: true,
          gym_schedule: 4,
          floor_pca_selection: null,
        },
      ],
      pcaPool: [
        {
          id: 'slot1-only',
          name: 'Slot1 Only',
          floating: true,
          special_program: null,
          fte_pca: 0.25,
          leave_type: null,
          is_available: true,
          team: null,
          availableSlots: [1],
        } as any,
        {
          id: 'slot2-only',
          name: 'Slot2 Only',
          floating: true,
          special_program: null,
          fte_pca: 0.25,
          leave_type: null,
          is_available: true,
          team: null,
          availableSlots: [2],
        } as any,
      ],
    })

    const counts = slotCountsForTeam(result.allocations, 'FO')
    assert.equal(counts[1], 1, 'Expected exactly one assignment on ranked slot 1')
    assert.equal(counts[2], 1, 'Expected allocator to use unused unranked slot 2 before duplicating slot 1')
    assert.equal(result.pendingPCAFTEPerTeam.FO, 0)
  }

  // Scenario 3: once duplication is unavoidable, duplicate order returns to ranked order.
  {
    const result = await run({
      pending: 0.75,
      preferences: [
        {
          id: 'pref-fo-3',
          team: 'FO',
          preferred_pca_ids: [],
          preferred_slots: [1, 3, 2],
          avoid_gym_schedule: true,
          gym_schedule: 4,
          floor_pca_selection: null,
        },
      ],
      pcaPool: [
        {
          id: 'slot1-a',
          name: 'Slot1 A',
          floating: true,
          special_program: null,
          fte_pca: 0.25,
          leave_type: null,
          is_available: true,
          team: null,
          availableSlots: [1],
        } as any,
        {
          id: 'slot3-a',
          name: 'Slot3 A',
          floating: true,
          special_program: null,
          fte_pca: 0.25,
          leave_type: null,
          is_available: true,
          team: null,
          availableSlots: [3],
        } as any,
        {
          id: 'slot1-b',
          name: 'Slot1 B',
          floating: true,
          special_program: null,
          fte_pca: 0.25,
          leave_type: null,
          is_available: true,
          team: null,
          availableSlots: [1],
        } as any,
      ],
    })

    const counts = slotCountsForTeam(result.allocations, 'FO')
    assert.equal(counts[1], 2, 'Expected duplicate fallback to restart at ranked slot 1')
    assert.equal(counts[3], 1, 'Expected ranked slot 3 to be used before duplicate fallback')
    assert.equal(result.pendingPCAFTEPerTeam.FO, 0)
  }

  // Scenario 4: gym is true last resort when avoid-gym is on.
  {
    const result = await run({
      pending: 0.25,
      preferences: [
        {
          id: 'pref-fo-4',
          team: 'FO',
          preferred_pca_ids: [],
          preferred_slots: [1, 3],
          avoid_gym_schedule: true,
          gym_schedule: 4,
          floor_pca_selection: null,
        },
      ],
      pcaPool: [
        {
          id: 'gym-only',
          name: 'Gym Only',
          floating: true,
          special_program: null,
          fte_pca: 0.25,
          leave_type: null,
          is_available: true,
          team: null,
          availableSlots: [4],
        } as any,
      ],
    })

    const counts = slotCountsForTeam(result.allocations, 'FO')
    assert.equal(counts[4], 1, 'Expected gym slot to be used only when it is the final legal path')
    assert.equal(result.tracker.FO.assignments[0]?.slotSelectionPhase, 'gym-last-resort')
    assert.equal(result.pendingPCAFTEPerTeam.FO, 0)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
