import assert from 'node:assert/strict'

import type { PCAData } from '../../lib/algorithms/pcaAllocation'
import {
  computeStep3BootstrapSummary,
  describeStep3BootstrapDelta,
  STEP2_HANDOFF_FLOATING_TARGET_TOAST_MAIN,
} from '../../lib/features/schedule/step3Bootstrap'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

function emptyTeamRecord(value: number): Record<Team, number> {
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

async function main() {
  const floatingPCAs: PCAData[] = [
    {
      id: 'float-1',
      name: 'Float 1',
      floating: true,
      special_program: null,
      team: null,
      fte_pca: 1,
      leave_type: null,
      is_available: true,
      availableSlots: [1, 2, 3, 4],
    },
    {
      id: 'float-2',
      name: 'Float 2',
      floating: true,
      special_program: null,
      team: null,
      fte_pca: 1,
      leave_type: null,
      is_available: true,
      availableSlots: [1, 2, 3, 4],
    },
    {
      id: 'float-3',
      name: 'Float 3',
      floating: true,
      special_program: null,
      team: null,
      fte_pca: 0.25,
      leave_type: null,
      is_available: true,
      availableSlots: [1],
    },
  ]

  const noAllocations: PCAAllocation[] = []

  const beforeTargets = emptyTeamRecord(0)
  beforeTargets.FO = 1
  beforeTargets.SMM = 1
  beforeTargets.DRO = 0.25

  const afterTargets = emptyTeamRecord(0)
  afterTargets.FO = 0.75
  afterTargets.SMM = 1.25

  const existingAssigned = emptyTeamRecord(0)

  const beforeSummary = computeStep3BootstrapSummary({
    teams: ['FO', 'SMM', 'DRO'],
    teamTargets: beforeTargets,
    existingTeamPCAAssigned: existingAssigned,
    floatingPCAs,
    existingAllocations: noAllocations,
    reservedSpecialProgramPcaFte: 0.5,
  })

  const afterSummary = computeStep3BootstrapSummary({
    teams: ['FO', 'SMM', 'DRO'],
    teamTargets: afterTargets,
    existingTeamPCAAssigned: existingAssigned,
    floatingPCAs,
    existingAllocations: noAllocations,
    reservedSpecialProgramPcaFte: 0.25,
  })

  assert.equal(
    beforeSummary.neededFloatingSlots,
    9,
    `Expected pre-settle summary to need 9 slots, but got ${beforeSummary.neededFloatingSlots}`
  )
  assert.equal(
    afterSummary.neededFloatingSlots,
    8,
    `Expected settled summary to need 8 slots, but got ${afterSummary.neededFloatingSlots}`
  )
  assert.equal(
    afterSummary.slackFloatingSlots,
    1,
    `Expected settled summary to expose 1 extra floating slot, but got ${afterSummary.slackFloatingSlots}`
  )

  const delta = describeStep3BootstrapDelta(beforeSummary, afterSummary)

  assert.ok(delta, 'Expected non-null delta')
  assert.equal(
    delta?.main,
    STEP2_HANDOFF_FLOATING_TARGET_TOAST_MAIN,
    `Expected main line, but got: ${delta?.main}`
  )
  assert.equal(
    delta?.details,
    'FO -1 PCA slot, SMM +1 PCA slot, DRO -1 PCA slot',
    `Expected team-specific detail summary, but got: ${delta?.details}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
