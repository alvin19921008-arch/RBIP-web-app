/**
 * V2 bootstrap (post–surplus removal): operational pending is quarter-rounded gap only.
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
      fte_pca: 1,
      leave_type: null,
      is_available: true,
      availableSlots: [1, 2, 3, 4],
    },
    {
      id: 'float-4',
      name: 'Float 4',
      floating: true,
      special_program: null,
      team: null,
      fte_pca: 0.5,
      leave_type: null,
      is_available: true,
      availableSlots: [1, 2],
    },
  ]

  const teamTargets = emptyTeamRecord(0)
  teamTargets.FO = 0.345
  teamTargets.SMM = 0.1
  teamTargets.SFM = 0.1
  teamTargets.CPPC = 0.1
  teamTargets.MC = 0.09
  teamTargets.GMC = 0.795
  teamTargets.NSM = 1.0
  teamTargets.DRO = 0.97

  const rawAveragePCAPerTeamByTeam = emptyTeamRecord(0)
  rawAveragePCAPerTeamByTeam.FO = 2.0
  rawAveragePCAPerTeamByTeam.SMM = 0.2
  rawAveragePCAPerTeamByTeam.SFM = 0.2
  rawAveragePCAPerTeamByTeam.CPPC = 0.2
  rawAveragePCAPerTeamByTeam.MC = 0.2
  rawAveragePCAPerTeamByTeam.GMC = 1.0
  rawAveragePCAPerTeamByTeam.NSM = 1.2
  rawAveragePCAPerTeamByTeam.DRO = 2.0

  const summary = computeStep3BootstrapSummary({
    teams: ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'],
    teamTargets,
    existingTeamPCAAssigned: emptyTeamRecord(0),
    floatingPCAs,
    existingAllocations: [] as PCAAllocation[],
    floatingPcaAllocationVersion: 'v2',
    rawAveragePCAPerTeamByTeam,
  })

  assert.equal(
    summary.pendingByTeam.FO,
    roundToNearestQuarterWithMidpoint(Math.max(0, teamTargets.FO))
  )
  assert.equal(
    summary.pendingByTeam.DRO,
    roundToNearestQuarterWithMidpoint(Math.max(0, teamTargets.DRO))
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
