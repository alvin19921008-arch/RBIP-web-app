/**
 * V2 bootstrap: floating slack = available pool slots minus discrete slot need from rounded pending.
 */
import assert from 'node:assert/strict'

import type { PCAData } from '../../lib/algorithms/pcaAllocation'
import { computeStep3BootstrapSummary } from '../../lib/features/schedule/step3Bootstrap'
import { roundToNearestQuarterWithMidpoint } from '../../lib/utils/rounding'
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
      fte_pca: 0.25,
      leave_type: null,
      is_available: true,
      availableSlots: [1],
    },
  ]

  const teamTargets = emptyTeamRecord(0)
  teamTargets.FO = 0.15
  teamTargets.SMM = 0.15
  teamTargets.SFM = 0.15

  const rawAveragePCAPerTeamByTeam = emptyTeamRecord(1)

  const summary = computeStep3BootstrapSummary({
    teams: ['FO', 'SMM', 'SFM'],
    teamTargets,
    existingTeamPCAAssigned: emptyTeamRecord(0),
    floatingPCAs,
    existingAllocations: [] as PCAAllocation[],
    floatingPcaAllocationVersion: 'v2',
    rawAveragePCAPerTeamByTeam,
  })

  assert.equal(summary.availableFloatingSlots, 5)

  let discreteNeeded = 0
  for (const team of ['FO', 'SMM', 'SFM'] as Team[]) {
    const gap = Math.max(0, (teamTargets[team] ?? 0) - 0)
    const pending = roundToNearestQuarterWithMidpoint(gap)
    assert.equal(summary.pendingByTeam[team], pending)
    discreteNeeded += Math.max(0, Math.round(roundToNearestQuarterWithMidpoint(pending) / 0.25))
  }
  assert.equal(discreteNeeded, 3)
  assert.equal(summary.neededFloatingSlots, discreteNeeded)
  assert.equal(summary.slackFloatingSlots, summary.availableFloatingSlots - summary.neededFloatingSlots)
  assert.equal(summary.slackFloatingSlots, 2)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
