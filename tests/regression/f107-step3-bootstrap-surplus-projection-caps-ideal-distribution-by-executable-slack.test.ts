/**
 * V2 bootstrap: tight floating pool — pending still follows rounded gap; slack can be zero.
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
      id: 'float-a',
      name: 'Float A',
      floating: true,
      special_program: null,
      team: null,
      fte_pca: 0.25,
      leave_type: null,
      is_available: true,
      availableSlots: [1],
    },
    {
      id: 'float-b',
      name: 'Float B',
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
  teamTargets.MC = 0.15
  teamTargets.NSM = 0.15

  const rawAveragePCAPerTeamByTeam = emptyTeamRecord(0)
  rawAveragePCAPerTeamByTeam.MC = 1
  rawAveragePCAPerTeamByTeam.NSM = 1

  const summary = computeStep3BootstrapSummary({
    teams: ['MC', 'NSM'],
    teamTargets,
    existingTeamPCAAssigned: emptyTeamRecord(0),
    floatingPCAs,
    existingAllocations: [] as PCAAllocation[],
    floatingPcaAllocationVersion: 'v2',
    rawAveragePCAPerTeamByTeam,
  })

  assert.equal(summary.slackFloatingSlots, 0, 'pool exactly meets discrete slot demand')

  for (const team of ['MC', 'NSM'] as const) {
    const gap = Math.max(0, teamTargets[team] ?? 0)
    assert.equal(summary.pendingByTeam[team], roundToNearestQuarterWithMidpoint(gap))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
