/**
 * V2 surplus projection: raw/base targets and raw surplus drive ideal shares
 * before quarter realization; the grant must not follow a round-first-then-add path.
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

  assert.ok(summary.rawSurplusFte != null && summary.rawSurplusFte > 0.25)
  assert.equal(summary.redistributableSlackSlots, 1)

  const idealMc = summary.idealWeightedSurplusShareByTeam?.MC ?? 0
  const idealNsm = summary.idealWeightedSurplusShareByTeam?.NSM ?? 0
  assert.ok(idealMc > 0 && idealNsm > 0)
  assert.ok(idealMc > idealNsm)

  const realizedMc = summary.realizedSurplusSlotGrantsByTeam?.MC ?? 0
  const realizedNsm = summary.realizedSurplusSlotGrantsByTeam?.NSM ?? 0
  assert.equal(realizedMc, 0.25)
  assert.equal(realizedNsm, 0)

  const wrongRoundedWeightsMc = roundToNearestQuarterWithMidpoint(0.11)
  const wrongRoundedWeightsNsm = roundToNearestQuarterWithMidpoint(0.36)
  const wrongWeightSum = wrongRoundedWeightsMc + wrongRoundedWeightsNsm
  const wrongIdealMc =
    summary.rawSurplusFte! * (wrongRoundedWeightsMc / wrongWeightSum)
  const wrongIdealNsm =
    summary.rawSurplusFte! * (wrongRoundedWeightsNsm / wrongWeightSum)
  assert.ok(
    Math.abs(wrongIdealMc - idealMc) > 1e-6 || Math.abs(wrongIdealNsm - idealNsm) > 1e-6,
    'expected ideal shares to differ from a round-first weighting baseline'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
