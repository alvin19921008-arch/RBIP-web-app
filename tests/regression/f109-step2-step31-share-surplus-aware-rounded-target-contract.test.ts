/**
 * V2 contract: Step 3.1 pending = round(max(0, Avg − existingAssigned)); Step 2 handoff toast
 * only when display Avg targets change (not when only the floating pool size changes).
 */
import assert from 'node:assert/strict'

import type { PCAData } from '../../lib/algorithms/pcaAllocation'
import {
  computeStep3BootstrapSummary,
  describeStep3BootstrapDelta,
} from '../../lib/features/schedule/step3Bootstrap'
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

function buildFloatingPca(id: string, fte: number): PCAData {
  return {
    id,
    name: id,
    floating: true,
    special_program: null,
    team: null,
    fte_pca: fte,
    leave_type: null,
    is_available: true,
    availableSlots: [1, 2, 3, 4],
  }
}

async function main() {
  const teamTargets = emptyTeamRecord(0)
  teamTargets.MC = 0.11
  teamTargets.NSM = 0.36

  const rawAveragePCAPerTeamByTeam = emptyTeamRecord(0)
  rawAveragePCAPerTeamByTeam.MC = 10
  rawAveragePCAPerTeamByTeam.NSM = 1

  const baseArgs = {
    teams: ['MC', 'NSM'] as Team[],
    teamTargets,
    existingTeamPCAAssigned: emptyTeamRecord(0),
    existingAllocations: [] as PCAAllocation[],
    floatingPcaAllocationVersion: 'v2' as const,
    rawAveragePCAPerTeamByTeam,
  }

  const prev = computeStep3BootstrapSummary({
    ...baseArgs,
    floatingPCAs: [buildFloatingPca('float-0', 1)],
  })

  const next = computeStep3BootstrapSummary({
    ...baseArgs,
    floatingPCAs: [buildFloatingPca('float-0', 1), buildFloatingPca('float-1', 1)],
  })

  assert.equal(describeStep3BootstrapDelta(prev, next), null)

  const expectedMc = roundToNearestQuarterWithMidpoint(Math.max(0, teamTargets.MC - 0))
  assert.equal(next.pendingByTeam.MC, expectedMc)
  assert.equal(roundToNearestQuarterWithMidpoint(next.pendingByTeam.MC ?? 0), expectedMc)

  assert.equal(next.rawAveragePCAPerTeamByTeam?.MC, 10)
  assert.equal(next.teamTargets.MC, teamTargets.MC)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
