/**
 * V2 surplus projection: continuous raw surplus can exist while executable slack is zero;
 * ideal shares stay informative but realized grants and operational pending stay capped.
 */
import assert from 'node:assert/strict'

import type { PCAData } from '../../lib/algorithms/pcaAllocation'
import { computeStep3BootstrapSummary } from '../../lib/features/schedule/step3Bootstrap'
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
  teamTargets.MC = 0.11
  teamTargets.NSM = 0.11

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

  assert.ok(summary.rawSurplusFte != null && summary.rawSurplusFte > 0.25)
  assert.equal(summary.redistributableSlackSlots, 0)

  const idealMc = summary.idealWeightedSurplusShareByTeam?.MC ?? 0
  const idealNsm = summary.idealWeightedSurplusShareByTeam?.NSM ?? 0
  assert.ok(idealMc > 0 && idealNsm > 0)

  assert.equal(summary.realizedSurplusSlotGrantsByTeam?.MC ?? -1, 0)
  assert.equal(summary.realizedSurplusSlotGrantsByTeam?.NSM ?? -1, 0)

  const baselinePendingMc = Math.max(0, teamTargets.MC - 0)
  const baselinePendingNsm = Math.max(0, teamTargets.NSM - 0)
  assert.equal(summary.pendingByTeam.MC, baselinePendingMc)
  assert.equal(summary.pendingByTeam.NSM, baselinePendingNsm)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
