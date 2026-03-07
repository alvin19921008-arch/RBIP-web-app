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

async function runScenario(selectedPreferenceAssignments: Array<{ team: Team; slot: number; pcaId: string; source?: 'step32' | 'step33' }>) {
  const currentPendingFTE = emptyTeamRecord(0)
  currentPendingFTE.MC = 0.25
  currentPendingFTE.FO = 0.25

  const existingAllocations: PCAAllocation[] = [
    {
      id: 'existing-pca-a',
      schedule_id: '',
      staff_id: 'pca-a',
      team: 'FO',
      fte_pca: 0.5,
      fte_remaining: 0.25,
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

  const pcaPool: PCAData[] = [
    {
      id: 'pca-a',
      name: 'PCA A',
      floating: true,
      special_program: null,
      fte_pca: 0.5,
      leave_type: null,
      is_available: true,
      team: null,
      availableSlots: [1, 2],
    },
  ]

  const pcaPreferences: PCAPreference[] = []
  const specialPrograms: SpecialProgram[] = []

  return allocateFloatingPCA_v2({
    mode: 'standard',
    teamOrder: ['MC', 'FO', 'SMM', 'SFM', 'CPPC', 'GMC', 'NSM', 'DRO'],
    currentPendingFTE,
    existingAllocations,
    pcaPool,
    pcaPreferences,
    specialPrograms,
    extraCoverageMode: 'none',
    preferenceSelectionMode: 'selected_only',
    preferenceProtectionMode: 'exclusive',
    selectedPreferenceAssignments,
  })
}

async function main() {
  const withoutSelectedProtection = await runScenario([])
  const withStep33OnlySelection = await runScenario([
    { team: 'FO', slot: 1, pcaId: 'pca-a', source: 'step33' },
  ])

  assert.equal(
    withoutSelectedProtection.pendingPCAFTEPerTeam.MC,
    0,
    `Expected MC to receive the last available quarter-slot when no selected preferred pick is protecting PCA A, but got pending ${withoutSelectedProtection.pendingPCAFTEPerTeam.MC}`
  )

  assert.equal(
    withStep33OnlySelection.pendingPCAFTEPerTeam.MC,
    0,
    `Expected a Step 3.3-only selection to behave like no protected preferred pick for MC, but got pending ${withStep33OnlySelection.pendingPCAFTEPerTeam.MC}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
