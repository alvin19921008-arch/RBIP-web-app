import assert from 'node:assert/strict'

import { buildDisplayPcaAllocationsByTeam } from '../../lib/features/schedule/pcaDisplayProjection'
import type { PCAAllocation } from '../../types/schedule'
import type { Staff, Team } from '../../types/staff'

function emptyTeamRecordFactory<T>(factory: () => T): Record<Team, T> {
  return {
    FO: factory(),
    SMM: factory(),
    SFM: factory(),
    CPPC: factory(),
    MC: factory(),
    GMC: factory(),
    NSM: factory(),
    DRO: factory(),
  }
}

async function main() {
  const overrideOnlyNonFloating: Staff = {
    id: 'nf-mc',
    name: 'NF MC',
    rank: 'PCA',
    team: 'MC',
    status: 'active',
    floating: false,
    floor_pca: false,
    buffer_fte: null,
    special_program: null,
    special_program_ids: [],
  } as any

  const realFloating: Staff = {
    id: 'float-fo',
    name: 'Float FO',
    rank: 'PCA',
    team: null,
    status: 'active',
    floating: true,
    floor_pca: false,
    buffer_fte: null,
    special_program: null,
    special_program_ids: [],
  } as any

  const partialDayNonFloating: Staff = {
    id: 'nf-gmc',
    name: 'NF GMC',
    rank: 'PCA',
    team: 'GMC',
    status: 'active',
    floating: false,
    floor_pca: false,
    buffer_fte: null,
    special_program: null,
    special_program_ids: [],
  } as any

  const noOverrideNonFloating: Staff = {
    id: 'nf-unused',
    name: 'NF Unused',
    rank: 'PCA',
    team: 'SMM',
    status: 'active',
    floating: false,
    floor_pca: false,
    buffer_fte: null,
    special_program: null,
    special_program_ids: [],
  } as any

  const step2OnlyNonFloating: Staff = {
    id: 'nf-step2-only',
    name: 'NF Step2 Only',
    rank: 'PCA',
    team: 'SFM',
    status: 'active',
    floating: false,
    floor_pca: false,
    buffer_fte: null,
    special_program: null,
    special_program_ids: [],
  } as any

  const pcaAllocationsByTeam = emptyTeamRecordFactory<Array<PCAAllocation & { staff: Staff }>>(() => [])
  pcaAllocationsByTeam.FO.push({
    id: 'alloc-float-fo',
    schedule_id: 'schedule-1',
    staff_id: 'float-fo',
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
    special_program_ids: null,
    invalid_slot: undefined,
    staff: realFloating,
  })
  pcaAllocationsByTeam.GMC.push({
    id: 'alloc-nf-gmc',
    schedule_id: 'schedule-1',
    staff_id: 'nf-gmc',
    team: 'GMC',
    fte_pca: 0.5,
    fte_remaining: 0,
    slot_assigned: 0.5,
    slot_whole: null,
    slot1: 'GMC',
    slot2: 'GMC',
    slot3: null,
    slot4: null,
    leave_type: 'VL',
    special_program_ids: null,
    invalid_slot: undefined,
    staff: partialDayNonFloating,
  })

  const projected = buildDisplayPcaAllocationsByTeam({
    selectedDate: new Date('2026-03-17T08:00:00.000Z'),
    staff: [overrideOnlyNonFloating, realFloating, partialDayNonFloating, noOverrideNonFloating, step2OnlyNonFloating],
    staffOverrides: {
      'nf-mc': {
        leaveType: null,
        fteRemaining: 1,
      },
      'float-fo': {
        leaveType: null,
        fteRemaining: 1,
      },
      'nf-gmc': {
        leaveType: 'VL',
        fteRemaining: 0.5,
        availableSlots: [1, 2],
      },
      'nf-step2-only': {
        specialProgramOverrides: [{ programId: 'robotic', slots: [1, 2] }],
      },
    } as any,
    pcaAllocationsByTeam,
  })

  const mcStaffIds = projected.MC.map((alloc) => alloc.staff_id)
  assert.deepEqual(
    mcStaffIds,
    ['nf-mc'],
    `Expected MC display projection to include the override-only non-floating PCA row, got ${JSON.stringify(mcStaffIds)}`
  )

  const syntheticMc = projected.MC[0] as any
  assert.equal(
    syntheticMc.__displayOnlyStep1,
    true,
    'Expected override-only non-floating PCA row to be marked as display-only Step 1 state'
  )
  assert.deepEqual(
    syntheticMc.__displaySlots,
    [1, 2, 3, 4],
    `Expected display-only row to expose whole-day display slots from runtime state, got ${JSON.stringify(syntheticMc.__displaySlots)}`
  )
  assert.equal(
    syntheticMc.slot_assigned,
    0,
    `Expected display-only row to contribute zero assigned coverage, got ${syntheticMc.slot_assigned}`
  )
  assert.deepEqual(
    [syntheticMc.slot1, syntheticMc.slot2, syntheticMc.slot3, syntheticMc.slot4],
    [null, null, null, null],
    `Expected display-only row to avoid phantom slot ownership, got ${JSON.stringify([
      syntheticMc.slot1,
      syntheticMc.slot2,
      syntheticMc.slot3,
      syntheticMc.slot4,
    ])}`
  )

  assert.deepEqual(
    projected.GMC.map((alloc) => alloc.staff_id),
    ['nf-gmc'],
    `Expected existing material PCA row to stay canonical without duplicate synthetic rows, got ${JSON.stringify(
      projected.GMC.map((alloc) => alloc.staff_id)
    )}`
  )
  assert.deepEqual(
    projected.FO.map((alloc) => alloc.staff_id),
    ['float-fo'],
    `Expected real floating PCA row to remain in display projection, got ${JSON.stringify(projected.FO.map((alloc) => alloc.staff_id))}`
  )
  assert.equal(
    projected.SMM.length,
    0,
    `Expected non-floating PCA without meaningful override or persisted row to stay hidden, got ${JSON.stringify(
      projected.SMM.map((alloc) => alloc.staff_id)
    )}`
  )
  assert.equal(
    projected.SFM.length,
    0,
    `Expected later-step-only PCA metadata without Step 1 meaning to stay hidden, got ${JSON.stringify(
      projected.SFM.map((alloc) => alloc.staff_id)
    )}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
