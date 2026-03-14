import assert from 'node:assert/strict'

import { deriveExtraCoverageByStaffId } from '../../lib/features/schedule/extraCoverageRuntime'
import { stripExtraCoverageOverrides } from '../../lib/features/schedule/extraCoverageVisibility'
import type { PCAAllocation, ScheduleCalculations } from '../../types/schedule'
import type { Staff, Team } from '../../types/staff'

function emptyTeamRecord<T>(value: T): Record<Team, T> {
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

function deriveForSingleTeam(args: {
  team: Team
  staff: Staff[]
  pcaAllocationsByTeam: Record<Team, Array<PCAAllocation & { staff?: Staff }>>
  staffOverrides: Record<string, any>
  averagePcaPerTeam: number
}) {
  const calculations = emptyTeamRecord<ScheduleCalculations | null>(null)
  calculations[args.team] = {
    team: args.team,
    average_pca_per_team: args.averagePcaPerTeam,
  } as any

  return deriveExtraCoverageByStaffId({
    selectedDate: new Date('2026-03-04T08:00:00.000Z'),
    pcaAllocationsByTeam: args.pcaAllocationsByTeam,
    staff: args.staff,
    specialPrograms: [],
    staffOverrides: stripExtraCoverageOverrides(args.staffOverrides),
    visibleTeams: [args.team],
    teamContributorsByMain: { [args.team]: [args.team] } as Partial<Record<Team, Team[]>>,
    calculations,
    mergedInto: {},
  })
}

async function main() {
  const floatingMc: Staff = {
    id: 'floating-mc',
    name: 'Floating MC',
    rank: 'PCA',
    team: null,
    status: 'active',
    floating: true,
    floor_pca: false,
    buffer_fte: null,
    special_program: null,
    special_program_ids: [],
  } as any

  const offDutyMc: Staff = {
    id: 'off-duty-mc',
    name: 'Off Duty MC',
    rank: 'PCA',
    team: 'MC',
    status: 'active',
    floating: false,
    floor_pca: false,
    buffer_fte: null,
    special_program: null,
    special_program_ids: [],
  } as any

  const pcaAllocationsWithOffDuty = emptyTeamRecord<Array<PCAAllocation & { staff?: Staff }>>([])
  pcaAllocationsWithOffDuty.MC.push(
    {
      id: 'alloc-floating-mc',
      schedule_id: '',
      staff_id: 'floating-mc',
      team: 'MC',
      fte_pca: 1,
      fte_remaining: 0,
      slot_assigned: 1,
      slot_whole: null,
      slot1: 'MC',
      slot2: 'MC',
      slot3: 'MC',
      slot4: 'MC',
      leave_type: null,
      special_program_ids: [],
      staff: floatingMc,
    },
    {
      id: 'alloc-off-duty-mc',
      schedule_id: '',
      staff_id: 'off-duty-mc',
      team: 'MC',
      fte_pca: 0,
      fte_remaining: 0,
      slot_assigned: 0,
      slot_whole: null,
      slot1: 'MC',
      slot2: 'MC',
      slot3: 'MC',
      slot4: 'MC',
      leave_type: 'VL',
      special_program_ids: [],
      staff: offDutyMc,
    }
  )

  const offDutyExtra = deriveForSingleTeam({
    team: 'MC',
    staff: [floatingMc, offDutyMc],
    pcaAllocationsByTeam: pcaAllocationsWithOffDuty,
    staffOverrides: {
      'floating-mc': { leaveType: null, fteRemaining: 1 },
      'off-duty-mc': { leaveType: 'VL', fteRemaining: 0, availableSlots: [] },
    },
    averagePcaPerTeam: 0.75,
  })

  assert.deepEqual(
    offDutyExtra,
    {
      'floating-mc': { 4: true },
    },
    `Expected off-duty placeholder PCA row to contribute zero assigned slots, but got ${JSON.stringify(offDutyExtra)}`
  )

  const floatingGmc: Staff = {
    id: 'floating-gmc',
    name: 'Floating GMC',
    rank: 'PCA',
    team: null,
    status: 'active',
    floating: true,
    floor_pca: false,
    buffer_fte: null,
    special_program: null,
    special_program_ids: [],
  } as any

  const halfDayGmc: Staff = {
    id: 'half-day-gmc',
    name: 'Half Day GMC',
    rank: 'PCA',
    team: 'GMC',
    status: 'active',
    floating: false,
    floor_pca: false,
    buffer_fte: null,
    special_program: null,
    special_program_ids: [],
  } as any

  const pcaAllocationsWithHalfDay = emptyTeamRecord<Array<PCAAllocation & { staff?: Staff }>>([])
  pcaAllocationsWithHalfDay.GMC.push(
    {
      id: 'alloc-floating-gmc',
      schedule_id: '',
      staff_id: 'floating-gmc',
      team: 'GMC',
      fte_pca: 1,
      fte_remaining: 0,
      slot_assigned: 1,
      slot_whole: null,
      slot1: 'GMC',
      slot2: 'GMC',
      slot3: 'GMC',
      slot4: 'GMC',
      leave_type: null,
      special_program_ids: [],
      staff: floatingGmc,
    },
    {
      id: 'alloc-half-day-gmc',
      schedule_id: '',
      staff_id: 'half-day-gmc',
      team: 'GMC',
      fte_pca: 0.5,
      fte_remaining: 0,
      slot_assigned: 0.5,
      slot_whole: null,
      slot1: 'GMC',
      slot2: 'GMC',
      slot3: 'GMC',
      slot4: 'GMC',
      leave_type: 'VL',
      special_program_ids: [],
      staff: halfDayGmc,
    }
  )

  const halfDayExtra = deriveForSingleTeam({
    team: 'GMC',
    staff: [floatingGmc, halfDayGmc],
    pcaAllocationsByTeam: pcaAllocationsWithHalfDay,
    staffOverrides: {
      'floating-gmc': { leaveType: null, fteRemaining: 1 },
      'half-day-gmc': { leaveType: 'VL', fteRemaining: 0.5, availableSlots: [1, 2] },
    },
    averagePcaPerTeam: 1.25,
  })

  assert.deepEqual(
    halfDayExtra,
    {
      'floating-gmc': { 4: true },
    },
    `Expected half-day PCA to contribute only its runtime-available slots, but got ${JSON.stringify(halfDayExtra)}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
