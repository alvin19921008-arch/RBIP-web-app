/**
 * Step 3 bootstrap: non-floating FTE breakdown (designated vs substitution) sums to existingTeamPCAAssigned
 * per team when using [computeStep3BootstrapState] / [computeStep3NonFloatingFteBreakdownByTeamFromAllocations].
 */
import assert from 'node:assert/strict'

import {
  computeStep3BootstrapState,
  computeStep3NonFloatingFteBreakdownByTeamFromAllocations,
  type Step3NonFloatingFteBreakdownByTeam,
} from '../../lib/features/schedule/step3Bootstrap'
import type { SpecialProgram } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Staff, Team } from '../../types/staff'

function emptyTeamAllocations(): Record<Team, Array<PCAAllocation & { staff?: Staff }>> {
  return {
    FO: [],
    SMM: [],
    SFM: [],
    CPPC: [],
    MC: [],
    GMC: [],
    NSM: [],
    DRO: [],
  }
}

function sumBreakdownForTeam(team: Team, b: Step3NonFloatingFteBreakdownByTeam): number {
  const row = b[team]
  if (!row) return 0
  let s = 0
  for (const v of Object.values(row)) {
    if (typeof v === 'number' && Number.isFinite(v)) s += v
  }
  return s
}

async function main() {
  const specialPrograms: SpecialProgram[] = []

  const designated: Staff = {
    id: 'nf-1',
    name: 'NF PCA',
    rank: 'PCA',
    team: 'FO',
    status: 'active',
    floating: false,
    floor_pca: null,
    special_program: null,
  } as Staff

  const floater: Staff = {
    id: 'float-sub',
    name: 'Float Sub',
    rank: 'PCA',
    team: null,
    status: 'active',
    floating: true,
    floor_pca: null,
    special_program: null,
  } as Staff

  const allocsFull = emptyTeamAllocations()
  allocsFull.FO.push({
    id: 'alloc-nf-full',
    schedule_id: '',
    staff_id: 'nf-1',
    team: 'FO',
    fte_pca: 1,
    fte_remaining: 0,
    slot_assigned: 1,
    slot_whole: null,
    slot1: 'FO',
    slot2: 'FO',
    slot3: 'FO',
    slot4: 'FO',
    leave_type: null,
    special_program_ids: [],
  } as PCAAllocation)

  const bootstrapFull = computeStep3BootstrapState({
    pcaAllocations: allocsFull,
    staff: [designated],
    specialPrograms,
    weekday: 'mon',
  })

  assert.equal(bootstrapFull.existingTeamPCAAssigned.FO, 1)
  assert.equal(
    sumBreakdownForTeam('FO', bootstrapFull.nonFloatingFteBreakdownByTeam),
    1,
    'designated non-floating slots should reconcile to existingTeamPCAAssigned'
  )
  assert.equal(bootstrapFull.nonFloatingFteBreakdownByTeam.FO?.designated_non_floating_pca, 1)

  const allocsSub = emptyTeamAllocations()
  allocsSub.FO.push({
    id: 'alloc-sub',
    schedule_id: '',
    staff_id: 'float-sub',
    team: null,
    fte_pca: 1,
    fte_remaining: 0.75,
    slot_assigned: 0.25,
    slot_whole: null,
    slot1: 'FO',
    slot2: null,
    slot3: null,
    slot4: null,
    leave_type: null,
    special_program_ids: [],
  } as PCAAllocation)

  const staffOverrides = {
    'float-sub': {
      leaveType: null,
      fteRemaining: 1,
      substitutionFor: {
        nonFloatingPCAId: 'missing-nf',
        nonFloatingPCAName: 'Away',
        team: 'FO' as Team,
        slots: [1],
      },
    },
  }

  const bootstrapSub = computeStep3BootstrapState({
    pcaAllocations: allocsSub,
    staff: [floater],
    specialPrograms,
    weekday: 'mon',
    staffOverrides,
  })

  assert.equal(bootstrapSub.existingTeamPCAAssigned.FO, 0.25)
  assert.equal(
    sumBreakdownForTeam('FO', bootstrapSub.nonFloatingFteBreakdownByTeam),
    0.25,
    'substitution slot should reconcile to existingTeamPCAAssigned'
  )
  assert.equal(bootstrapSub.nonFloatingFteBreakdownByTeam.FO?.substitution_for_non_floating, 0.25)

  const flat = computeStep3NonFloatingFteBreakdownByTeamFromAllocations({
    existingAllocations: allocsFull.FO,
    staff: [designated],
    specialPrograms,
    weekday: 'mon',
  })
  assert.equal(sumBreakdownForTeam('FO', flat), 1)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
