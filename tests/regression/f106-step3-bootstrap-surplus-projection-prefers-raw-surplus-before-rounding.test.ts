/**
 * V2 bootstrap: pending floating uses quarter-rounded gap vs Avg (no surplus-grant uplift).
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
  ]

  const teamTargets = emptyTeamRecord(0)
  teamTargets.MC = 0.11
  teamTargets.NSM = 0.36

  const rawAveragePCAPerTeamByTeam = emptyTeamRecord(0)
  rawAveragePCAPerTeamByTeam.MC = 10
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

  for (const team of ['MC', 'NSM'] as const) {
    const gap = Math.max(0, (teamTargets[team] ?? 0) - 0)
    assert.equal(
      summary.pendingByTeam[team],
      roundToNearestQuarterWithMidpoint(gap),
      `Expected V2 pending = round(max(0, Avg − assigned)) for ${team}`
    )
  }

  assert.equal(summary.rawAveragePCAPerTeamByTeam?.MC, 10)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
