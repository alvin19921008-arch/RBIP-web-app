import assert from 'node:assert/strict'

import { buildV2PcaTrackerTooltipModel } from '../../lib/features/schedule/v2PcaTrackerTooltipModel'
import { deriveTeamStep3FloatingFulfillmentSemantics } from '../../lib/features/schedule/step3FloatingFulfillmentSemantics'
import type { SpecialProgram } from '../../types/allocation'
import type { PCAAllocation, TeamAllocationLog } from '../../types/schedule'
import type { Staff, Team, Weekday } from '../../types/staff'

function makeEmptyLog(): TeamAllocationLog {
  return {
    team: 'FO',
    assignments: [],
    summary: {
      totalSlotsAssigned: 0,
      fromStep30: 0,
      fromStep32: 0,
      fromStep33: 0,
      fromStep34Cycle1: 0,
      fromStep34Cycle2: 0,
      fromStep34Cycle3: 0,
      preferredSlotFilled: false,
      preferredPCAsUsed: 0,
      floorPCAsUsed: 0,
      nonFloorPCAsUsed: 0,
      amPmBalanced: false,
      gymSlotUsed: false,
      pendingMet: true,
      highestRankedSlotFulfilled: 1,
      usedUnrankedSlot: false,
      usedDuplicateFloatingSlot: false,
      gymUsedAsLastResort: false,
      preferredPCAUsed: false,
      fulfilledByBuffer: false,
      allocationMode: 'standard',
      repairAuditDefects: [],
      preStep34RoundedPendingFte: 0.25,
    },
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

function makeAllocation(args: {
  id: string
  staffId: string
  team: Team
  slot1?: Team | null
  slot2?: Team | null
  slot3?: Team | null
  slot4?: Team | null
  specialProgramIds?: string[] | null
  staff?: Staff
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
  const weekday: Weekday = 'mon'
  const team: Team = 'FO'
  const allPcaStaff: Staff[] = [
    makeStaff({ id: 'nf-1', name: 'Non Floating', floating: false, team }),
    makeStaff({ id: 'sp-1', name: 'Special Program', floating: true }),
    makeStaff({ id: 'sub-1', name: 'Sub Floating', floating: true }),
    makeStaff({ id: 'step3-1', name: 'Step3 Floating', floating: true }),
  ]
  const allocations: Array<PCAAllocation & { staff?: Staff }> = [
    makeAllocation({ id: 'nf-1', staffId: 'nf-1', team, slot1: team, staff: allPcaStaff[0] }),
    makeAllocation({
      id: 'sp-1',
      staffId: 'sp-1',
      team,
      slot2: team,
      specialProgramIds: ['sp-ortho'],
      staff: allPcaStaff[1],
    }),
    makeAllocation({ id: 'sub-1', staffId: 'sub-1', team, slot3: team, staff: allPcaStaff[2] }),
    makeAllocation({ id: 'step3-1', staffId: 'step3-1', team, slot4: team, staff: allPcaStaff[3] }),
  ]
  const specialPrograms: SpecialProgram[] = [
    {
      id: 'sp-ortho',
      name: 'Ortho',
      staff_ids: ['sp-1'],
      weekdays: ['mon'],
      slots: {
        mon: [2],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
      },
      fte_subtraction: {
        'sp-1': { mon: 0.25, tue: 0, wed: 0, thu: 0, fri: 0 },
      },
      pca_required: 1,
    },
  ]
  const staffOverrides = {
    'sub-1': {
      substitutionForBySlot: {
        3: {
          team: 'FO',
          nonFloatingPCAId: 'nf-target',
          nonFloatingPCAName: 'NF Target',
        },
      },
    },
  }
  const semantics = deriveTeamStep3FloatingFulfillmentSemantics({
    team,
    allocations,
    allPcaStaff,
    staffOverrides,
    specialPrograms,
    weekday,
    averagePcaPerTeam: 0.75,
  })

  const log = makeEmptyLog()
  log.assignments.push({
    slot: 4,
    pcaId: 'step3-1',
    pcaName: 'Step3 Floating',
    assignedIn: 'step34',
    allocationStage: 'draft',
    fulfilledSlotRank: null,
    slotSelectionPhase: 'unranked-unused',
    pcaSelectionTier: 'floor',
    usedContinuity: false,
    duplicateSlot: false,
    step3OwnershipKind: 'step3-floating',
    upstreamCoverageKind: null,
  })
  log.summary.totalSlotsAssigned = 1
  log.summary.fromStep34Cycle1 = 1

  const model = buildV2PcaTrackerTooltipModel({
    team,
    allocationLog: log,
    pendingPcaFte: 0,
    ownershipSemantics: semantics,
  } as any)

  const mixCell = model?.summaryCells.find((cell) => cell.label === '3.4 Mix')
  assert.equal(
    mixCell?.subvalue,
    'Reserved 0.25 · Substitution 0.25 · Fulfills 0.25 · Surplus 0.00',
    'V2 tooltip summary should expose ownership buckets so reserved Step 2 coverage is not misread as true Step 3 fulfillment.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
