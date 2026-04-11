import assert from 'node:assert/strict'

import { deriveExtraCoverageByStaffId } from '../../lib/features/schedule/extraCoverageRuntime'
import type { SpecialProgram } from '../../types/allocation'
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

function makeStaff(args: {
  id: string
  name: string
  floating: boolean
  team?: Team | null
}): Staff {
  return {
    id: args.id,
    name: args.name,
    rank: 'PCA',
    special_program: null,
    team: args.team ?? null,
    floating: args.floating,
    floor_pca: ['upper'],
    status: 'active',
  }
}

function makeCalculation(team: Team, average: number): ScheduleCalculations {
  return {
    id: `calc-${team}`,
    schedule_id: '',
    team,
    designated_wards: [],
    total_beds_designated: 0,
    total_beds: 0,
    total_pt_on_duty: 0,
    beds_per_pt: 0,
    pt_per_team: 0,
    beds_for_relieving: 0,
    pca_on_duty: 0,
    total_pt_per_pca: 0,
    total_pt_per_team: 0,
    average_pca_per_team: average,
  }
}

function makeAllocation(args: {
  id: string
  staffId: string
  team: Team
  slot1?: Team | null
  slot2?: Team | null
  slot3?: Team | null
  slot4?: Team | null
  staff?: Staff
  specialProgramIds?: string[] | null
}): PCAAllocation & { staff?: Staff } {
  const slotCount = [args.slot1, args.slot2, args.slot3, args.slot4].filter(Boolean).length
  return {
    id: args.id,
    schedule_id: '',
    staff_id: args.staffId,
    team: args.team,
    fte_pca: 1,
    fte_remaining: Math.max(0, 1 - slotCount * 0.25),
    slot_assigned: slotCount * 0.25,
    slot_whole: null,
    slot1: args.slot1 ?? null,
    slot2: args.slot2 ?? null,
    slot3: args.slot3 ?? null,
    slot4: args.slot4 ?? null,
    leave_type: null,
    special_program_ids: args.specialProgramIds ?? null,
    staff: args.staff,
  }
}

async function main() {
  const team: Team = 'FO'
  const substitutionStaff = makeStaff({ id: 'sub-1', name: 'Sub Floating', floating: true })
  const trueStep3Staff = makeStaff({ id: 'step3-1', name: 'Step3 Floating', floating: true })

  const pcaAllocationsByTeam = {
    ...emptyTeamRecord<Array<PCAAllocation & { staff?: Staff }>>([]),
    FO: [
      makeAllocation({
        id: 'sub-alloc',
        staffId: 'sub-1',
        team,
        slot4: team,
        staff: substitutionStaff,
      }),
      makeAllocation({
        id: 'step3-alloc',
        staffId: 'step3-1',
        team,
        slot1: team,
        staff: trueStep3Staff,
      }),
    ],
  }

  const extraCoverageByStaffId = deriveExtraCoverageByStaffId({
    selectedDate: new Date('2026-04-13T00:00:00Z'),
    pcaAllocationsByTeam,
    staff: [substitutionStaff, trueStep3Staff],
    specialPrograms: [] as SpecialProgram[],
    staffOverrides: {
      'sub-1': {
        substitutionForBySlot: {
          4: {
            team: 'FO',
            nonFloatingPCAId: 'nf-target',
            nonFloatingPCAName: 'NF Target',
          },
        },
      },
    },
    visibleTeams: ['FO'],
    teamContributorsByMain: { FO: ['FO'] },
    calculations: {
      ...emptyTeamRecord<ScheduleCalculations | null>(null),
      FO: makeCalculation('FO', 0.25),
    },
    mergedInto: {},
  })

  assert.deepEqual(
    extraCoverageByStaffId,
    {
      'step3-1': { 1: true },
    },
    'Extra coverage should be marked only on true Step 3 floating surplus slots, not on substitution-owned coverage.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
