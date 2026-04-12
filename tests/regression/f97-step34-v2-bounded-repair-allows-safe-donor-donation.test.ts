import assert from 'node:assert/strict'

import { type PCAData } from '../../lib/algorithms/pcaAllocation'
import { detectRankedV2RepairDefects } from '../../lib/algorithms/floatingPcaV2/repairAudit'
import { generateRepairCandidates } from '../../lib/algorithms/floatingPcaV2/repairMoves'
import { TEAMS, getTeamPreferenceInfo } from '../../lib/utils/floatingPCAHelpers'
import type { PCAPreference } from '../../types/allocation'
import type { PCAAllocation } from '../../types/schedule'
import type { Team } from '../../types/staff'

/**
 * Task 6 (RED): bounded repair must support a direct true-Step-3 floating donation
 * from a donor team that remains acceptably covered (here: keeps another true Step 3 slot).
 *
 * Expected RED today: generateRepairCandidates only emits move+fallback or swap shapes for B1,
 * not a single-transfer bounded donation candidate; full allocator therefore cannot record the
 * intended donation-shaped repair provenance for this fixture.
 */

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

function buildTeamPrefs(pcaPreferences: PCAPreference[]) {
  return TEAMS.reduce(
    (record, team) => {
      record[team] = getTeamPreferenceInfo(team, pcaPreferences)
      return record
    },
    {} as Record<Team, ReturnType<typeof getTeamPreferenceInfo>>
  )
}

function makePca(id: string, slots: number[]): PCAData {
  return {
    id,
    name: id,
    floating: true,
    special_program: null,
    fte_pca: 1,
    leave_type: null,
    is_available: true,
    team: null,
    availableSlots: slots,
    floor_pca: ['upper'],
  } as PCAData
}

function slotOwner(allocations: PCAAllocation[], pcaId: string, slot: 1 | 2 | 3 | 4) {
  const allocation = allocations.find((row) => row.staff_id === pcaId)
  if (!allocation) return null
  return slot === 1
    ? allocation.slot1
    : slot === 2
      ? allocation.slot2
      : slot === 3
        ? allocation.slot3
        : allocation.slot4
}

function isDirectBoundedDonationCandidate(args: {
  candidate: ReturnType<typeof generateRepairCandidates>[number]
  donorTeam: Team
  requesterTeam: Team
  donorPcaId: string
  slot: 1 | 2 | 3 | 4
}): boolean {
  const { candidate, donorTeam, requesterTeam, donorPcaId, slot } = args
  if (candidate.defectKind !== 'B1') return false
  if (candidate.repairAssignments.length !== 1) return false
  const [only] = candidate.repairAssignments
  if (only.team !== requesterTeam || only.pcaId !== donorPcaId || only.slot !== slot) {
    return false
  }
  if (slotOwner(candidate.allocations, donorPcaId, slot) !== requesterTeam) return false
  if (slotOwner(candidate.allocations, donorPcaId, slot) === donorTeam) return false
  return true
}

function main() {
  const teamOrder: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
  const initialPendingFTE = { ...emptyTeamRecord(0), GMC: 0.25, DRO: 0.5 }
  const pendingFTE = { ...emptyTeamRecord(0), GMC: 0, DRO: 0 }

  const pcaPool: PCAData[] = [
    makePca('shaohua', [1]),
    makePca('donor-b', [2]),
    makePca('gmc-cover', [4]),
  ]

  const pcaPreferences: PCAPreference[] = [
    {
      id: 'pref-gmc',
      team: 'GMC',
      preferred_pca_ids: [],
      preferred_slots: [1],
      gym_schedule: 3,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
    {
      id: 'pref-dro',
      team: 'DRO',
      preferred_pca_ids: [],
      preferred_slots: [1, 2],
      gym_schedule: 4,
      avoid_gym_schedule: true,
      floor_pca_selection: 'upper',
    },
  ]

  const teamPrefs = buildTeamPrefs(pcaPreferences)

  const allocations: PCAAllocation[] = [
    {
      id: 'alloc-shaohua',
      schedule_id: '',
      staff_id: 'shaohua',
      team: 'DRO',
      fte_pca: 1,
      fte_remaining: 0.75,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: 'DRO',
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
    {
      id: 'alloc-donor-b',
      schedule_id: '',
      staff_id: 'donor-b',
      team: 'DRO',
      fte_pca: 1,
      fte_remaining: 0.75,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: null,
      slot2: 'DRO',
      slot3: null,
      slot4: null,
      leave_type: null,
      special_program_ids: null,
    },
    {
      id: 'alloc-gmc-cover',
      schedule_id: '',
      staff_id: 'gmc-cover',
      team: 'GMC',
      fte_pca: 1,
      fte_remaining: 0.75,
      slot_assigned: 0.25,
      slot_whole: null,
      slot1: null,
      slot2: null,
      slot3: null,
      slot4: 'GMC',
      leave_type: null,
      special_program_ids: null,
    },
  ]

  const baselineAllocations: PCAAllocation[] = []

  const defects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    allocations,
    pcaPool,
    teamPrefs,
    baselineAllocations,
  })

  assert.equal(
    defects.some((defect) => defect.kind === 'B1' && defect.team === 'GMC'),
    true,
    'GMC is missing ranked slot #1 while another team holds it on a floating PCA; audit should treat this as a ranked-gap defect once donation-capable rescue exists.'
  )

  const b1Defect = defects.find((defect) => defect.kind === 'B1' && defect.team === 'GMC')
  assert.ok(b1Defect)

  const candidates = generateRepairCandidates({
    defect: b1Defect,
    allocations,
    pcaPool,
    teamPrefs,
    teamOrder,
    initialPendingFTE,
    pendingFTE,
    baselineAllocations,
  })

  const hasDirectDonation = candidates.some((candidate) =>
    isDirectBoundedDonationCandidate({
      candidate,
      donorTeam: 'DRO',
      requesterTeam: 'GMC',
      donorPcaId: 'shaohua',
      slot: 1,
    })
  )

  assert.equal(
    hasDirectDonation,
    true,
    'B1 repair should include a bounded direct donation candidate (single slot transfer, no fabricated fallback slot and no swap) when the donor remains covered on another true Step 3 floating slot.'
  )

  // Task 7 will wire the ranked V2 allocator to select this donation-shaped candidate and record
  // `allocationStage === "repair"` on the receiving team without dropping the donor’s remaining
  // true Step 3 floating coverage.
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
