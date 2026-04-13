/**
 * V2 surplus projection: realized grants match executable slack, and reconciled
 * rounded adjusted targets pick up exactly that global quarter-slot uplift.
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
  teamTargets.FO = 0.1
  teamTargets.SMM = 0.1
  teamTargets.SFM = 0.1

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

  assert.equal(summary.redistributableSlackSlots, 2)

  const sumRealized =
    (summary.realizedSurplusSlotGrantsByTeam?.FO ?? 0) +
    (summary.realizedSurplusSlotGrantsByTeam?.SMM ?? 0) +
    (summary.realizedSurplusSlotGrantsByTeam?.SFM ?? 0)
  assert.equal(sumRealized, 0.5)

  const baselineRounded = (team: Team) =>
    roundToNearestQuarterWithMidpoint(teamTargets[team] ?? 0)

  const sumRoundedDelta =
    (summary.roundedAdjustedTeamTargets!.FO! - baselineRounded('FO')) +
    (summary.roundedAdjustedTeamTargets!.SMM! - baselineRounded('SMM')) +
    (summary.roundedAdjustedTeamTargets!.SFM! - baselineRounded('SFM'))

  assert.ok(Math.abs(sumRoundedDelta - 0.5) < 1e-9)

  const sumDelta =
    (summary.surplusAdjustmentDeltaByTeam?.FO ?? 0) +
    (summary.surplusAdjustmentDeltaByTeam?.SMM ?? 0) +
    (summary.surplusAdjustmentDeltaByTeam?.SFM ?? 0)
  assert.ok(Math.abs(sumDelta - 0.5) < 1e-9)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
