import type { Team } from '@/types/staff'
import type { PCAAllocation } from '@/types/schedule'
import type { PCAData } from '@/lib/algorithms/pcaAllocationTypes'
import {
  countTeamsMaterialShort,
  teamHasMaterialRemainingFloatingPending,
} from '@/lib/algorithms/floatingPcaV2/duplicateRepairPolicy'
import {
  buildRankedV2RepairAuditState,
  compareRankedV2GymAvoidanceRepairOutcomes,
  countTrueStep3FloatingSlotsByTeam,
  detectRankedV2GymAvoidableDefects,
  detectRankedV2RepairDefects,
  donorHasTrueStep3Ownership,
  getRankedV2GymAvoidanceRepairOutcomeMetrics,
  gymFeasibilityBatchSortKey,
  listRankedV2GymFeasibilityValidReshuffleBatches,
  MAX_GYM_FEASIBILITY_PROBE_CANDIDATES,
  teamCanDonateBoundedly,
  type RankedV2OptionalPromotionOpportunity,
  type RankedV2RepairDefect,
} from '@/lib/algorithms/floatingPcaV2/repairAudit'
import { compareA1RepairSortKeysForScanOrder } from '@/lib/algorithms/floatingPcaV2/repairMoveSelection'
import { TEAMS, type TeamPreferenceInfo } from '@/lib/utils/floatingPCAHelpers'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'

type Slot = 1 | 2 | 3 | 4

type SlotOwnerUpdate = {
  pcaId: string
  slot: Slot
  fromTeam: Team | null
  toTeam: Team | null
}

export type RepairAssignment = {
  team: Team
  pcaId: string
  slot: Slot
}

export type RepairCandidateDefectKind = RankedV2RepairDefect['kind'] | 'P1'

export type RepairCandidate = {
  defectKind: RepairCandidateDefectKind
  reason: RepairCandidateDefectKind
  sortKey: string
  allocations: PCAAllocation[]
  repairAssignments: RepairAssignment[]
}

/** Step 3.2 / 3.3 user commits — must not move or retarget (Constraint 6c). */
export type Step3CommittedFloatingAnchor = {
  team: Team
  slot: Slot
  pcaId: string
}

export type GenerateRepairCandidatesContext = {
  defect: RankedV2RepairDefect
  allocations: PCAAllocation[]
  pcaPool: PCAData[]
  teamPrefs: Record<Team, TeamPreferenceInfo>
  teamOrder?: Team[]
  initialPendingFTE?: Record<Team, number>
  pendingFTE?: Record<Team, number>
  baselineAllocations?: PCAAllocation[]
  /** Step 3.2 + 3.3 frozen anchors (preferred PCA+slot / adjacent); repair must not alter these cells. */
  committedStep3Anchors?: Step3CommittedFloatingAnchor[]
}

const VALID_SLOTS: Slot[] = [1, 2, 3, 4]

function cloneAllocations(allocations: PCAAllocation[]): PCAAllocation[] {
  return allocations.map((allocation) => ({ ...allocation }))
}

function getAllocationByStaffId(
  allocations: PCAAllocation[],
  staffId: string
): PCAAllocation | undefined {
  return allocations.find((allocation) => allocation.staff_id === staffId)
}

function getPcaById(pcaPool: PCAData[], pcaId: string): PCAData | undefined {
  return pcaPool.find((pca) => pca.id === pcaId)
}

function getSlotOwner(allocation: PCAAllocation | undefined, slot: Slot): Team | null {
  if (!allocation) return null
  if (slot === 1) return allocation.slot1
  if (slot === 2) return allocation.slot2
  if (slot === 3) return allocation.slot3
  return allocation.slot4
}

function setSlotOwner(allocation: PCAAllocation, slot: Slot, team: Team | null): void {
  if (slot === 1) allocation.slot1 = team
  else if (slot === 2) allocation.slot2 = team
  else if (slot === 3) allocation.slot3 = team
  else allocation.slot4 = team
}

function getOrCreateRepairAllocation(
  allocations: PCAAllocation[],
  pcaPool: PCAData[],
  pcaId: string,
  team: Team | null
): PCAAllocation | null {
  const existing = getAllocationByStaffId(allocations, pcaId)
  if (existing) return existing

  const pca = getPcaById(pcaPool, pcaId)
  if (!pca) return null

  const created: PCAAllocation = {
    id: `repair-${String(pca.id)}`,
    schedule_id: '',
    staff_id: pca.id,
    team: team ?? 'FO',
    fte_pca: pca.fte_pca,
    fte_remaining: pca.fte_pca,
    slot_assigned: 0,
    slot_whole: null,
    slot1: null,
    slot2: null,
    slot3: null,
    slot4: null,
    leave_type: pca.leave_type,
    special_program_ids: null,
  }
  allocations.push(created)
  return created
}

function getNormalizedAvailableSlots(pca: PCAData): Slot[] {
  if (!Array.isArray(pca.availableSlots)) return [...VALID_SLOTS]
  return pca.availableSlots.filter((slot): slot is Slot =>
    slot === 1 || slot === 2 || slot === 3 || slot === 4
  )
}

function countAssignedSlots(allocation: PCAAllocation): number {
  return VALID_SLOTS.filter((slot) => getSlotOwner(allocation, slot) != null).length
}

function updateDerivedAllocationFields(allocation: PCAAllocation): void {
  const assignedSlots = countAssignedSlots(allocation)
  allocation.slot_assigned = assignedSlots * 0.25
  allocation.fte_remaining = Math.max(0, allocation.fte_pca - allocation.slot_assigned)
}

function isAllocationWithinCapacity(allocation: PCAAllocation): boolean {
  return countAssignedSlots(allocation) * 0.25 <= allocation.fte_pca + 1e-9
}

function isSlotAllowedForTeam(
  team: Team,
  slot: Slot,
  teamPrefs: Record<Team, TeamPreferenceInfo>
): boolean {
  const pref = teamPrefs[team]
  if (!pref) return false
  if (pref.avoidGym && pref.gymSlot === slot) return false
  return true
}

function getAssignedSlotsForTeam(allocations: PCAAllocation[], team: Team): Slot[] {
  const slots: Slot[] = []
  for (const allocation of allocations) {
    for (const slot of VALID_SLOTS) {
      if (getSlotOwner(allocation, slot) === team) {
        slots.push(slot)
      }
    }
  }
  return slots.sort((a, b) => a - b)
}

function getAssignedFloatingSlotsForTeam(
  allocations: PCAAllocation[],
  team: Team,
  floatingPcaIds: Set<string>
): Slot[] {
  const slots: Slot[] = []
  for (const allocation of allocations) {
    if (!floatingPcaIds.has(allocation.staff_id)) continue
    for (const slot of VALID_SLOTS) {
      if (getSlotOwner(allocation, slot) === team) {
        slots.push(slot)
      }
    }
  }
  return slots.sort((a, b) => a - b)
}

function getRankedMissingSlots(
  allocations: PCAAllocation[],
  team: Team,
  teamPrefs: Record<Team, TeamPreferenceInfo>,
  floatingPcaIds: Set<string>,
  initialPendingFTE?: Record<Team, number>
): Slot[] {
  const current = new Set(getAssignedFloatingSlotsForTeam(allocations, team, floatingPcaIds))
  const targetSlotCount = Math.max(0, Math.round((((initialPendingFTE?.[team] ?? 0) as number) + 1e-9) / 0.25))
  return teamPrefs[team].rankedSlots
    .slice(0, targetSlotCount || undefined)
    .filter(
    (slot): slot is Slot =>
      (slot === 1 || slot === 2 || slot === 3 || slot === 4) && !current.has(slot)
  )
}

function getTeamPcaIds(allocations: PCAAllocation[], team: Team): string[] {
  const ids = new Set<string>()
  for (const allocation of allocations) {
    if (VALID_SLOTS.some((slot) => getSlotOwner(allocation, slot) === team)) {
      ids.add(allocation.staff_id)
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

function buildFloatingPcaIdSet(pcaPool: PCAData[]): Set<string> {
  return new Set(pcaPool.map((pca) => pca.id))
}

function buildRepairAssignments(
  before: PCAAllocation[],
  after: PCAAllocation[]
): RepairAssignment[] {
  const assignments: RepairAssignment[] = []
  const beforeByStaff = new Map(before.map((allocation) => [allocation.staff_id, allocation]))
  for (const allocation of [...after].sort((a, b) => String(a.staff_id).localeCompare(String(b.staff_id)))) {
    const previous = beforeByStaff.get(allocation.staff_id)
    for (const slot of VALID_SLOTS) {
      const previousOwner = getSlotOwner(previous, slot)
      const nextOwner = getSlotOwner(allocation, slot)
      if (nextOwner != null && nextOwner !== previousOwner) {
        assignments.push({
          team: nextOwner,
          pcaId: allocation.staff_id,
          slot,
        })
      }
    }
  }
  return assignments
}

function applyUpdates(
  allocations: PCAAllocation[],
  pcaPool: PCAData[],
  updates: SlotOwnerUpdate[]
): PCAAllocation[] | null {
  const next = cloneAllocations(allocations)
  for (const update of updates) {
    const allocation =
      getAllocationByStaffId(next, update.pcaId) ??
      getOrCreateRepairAllocation(next, pcaPool, update.pcaId, update.toTeam)
    if (!allocation) return null
    if (getSlotOwner(allocation, update.slot) !== update.fromTeam) {
      return null
    }
    setSlotOwner(allocation, update.slot, update.toTeam)
    updateDerivedAllocationFields(allocation)
    if (!isAllocationWithinCapacity(allocation)) {
      return null
    }
  }
  return next
}

function committedAnchorsStillHold(
  allocations: PCAAllocation[],
  anchors?: Step3CommittedFloatingAnchor[]
): boolean {
  if (!anchors?.length) return true
  for (const anchor of anchors) {
    const row = allocations.find((allocation) => allocation.staff_id === anchor.pcaId)
    if (getSlotOwner(row, anchor.slot) !== anchor.team) return false
  }
  return true
}

function buildCandidate(
  defectKind: RepairCandidateDefectKind,
  sortKey: string,
  allocations: PCAAllocation[],
  pcaPool: PCAData[],
  updates: SlotOwnerUpdate[],
  committedAnchors?: Step3CommittedFloatingAnchor[]
): RepairCandidate | null {
  const next = applyUpdates(allocations, pcaPool, updates)
  if (!next) return null
  if (!committedAnchorsStillHold(next, committedAnchors)) return null
  return {
    defectKind,
    reason: defectKind,
    sortKey,
    allocations: next,
    repairAssignments: buildRepairAssignments(allocations, next),
  }
}

export function applyOneSlotMove(args: {
  defectKind: RepairCandidateDefectKind
  sortKey: string
  allocations: PCAAllocation[]
  pcaPool: PCAData[]
  targetPcaId: string
  targetSlot: Slot
  fromTeam: Team
  toTeam: Team
  fallbackPcaId?: string
  fallbackSlot?: Slot
  fallbackTeam?: Team
  committedStep3Anchors?: Step3CommittedFloatingAnchor[]
}): RepairCandidate | null {
  const updates: SlotOwnerUpdate[] = [
    {
      pcaId: args.targetPcaId,
      slot: args.targetSlot,
      fromTeam: args.fromTeam,
      toTeam: args.toTeam,
    },
  ]

  if (args.fallbackPcaId && args.fallbackSlot && args.fallbackTeam) {
    updates.push({
      pcaId: args.fallbackPcaId,
      slot: args.fallbackSlot,
      fromTeam: null,
      toTeam: args.fallbackTeam,
    })
  }

  return buildCandidate(
    args.defectKind,
    args.sortKey,
    args.allocations,
    args.pcaPool,
    updates,
    args.committedStep3Anchors
  )
}

export function applyOneSlotSwap(args: {
  defectKind: RepairCandidateDefectKind
  sortKey: string
  allocations: PCAAllocation[]
  pcaPool: PCAData[]
  targetPcaId: string
  targetSlot: Slot
  targetOwner: Team
  newTargetOwner: Team
  donorPcaId: string
  donorSlot: Slot
  donorOwner: Team
  newDonorOwner: Team
  committedStep3Anchors?: Step3CommittedFloatingAnchor[]
}): RepairCandidate | null {
  return buildCandidate(args.defectKind, args.sortKey, args.allocations, args.pcaPool, [
    {
      pcaId: args.targetPcaId,
      slot: args.targetSlot,
      fromTeam: args.targetOwner,
      toTeam: args.newTargetOwner,
    },
    {
      pcaId: args.donorPcaId,
      slot: args.donorSlot,
      fromTeam: args.donorOwner,
      toTeam: args.newDonorOwner,
    },
  ], args.committedStep3Anchors)
}

export function applyContinuityCollapse(args: {
  sortKey: string
  allocations: PCAAllocation[]
  team: Team
  targetPcaId: string
  pcaPool: PCAData[]
  committedStep3Anchors?: Step3CommittedFloatingAnchor[]
}): RepairCandidate | null {
  const targetPca = getPcaById(args.pcaPool, args.targetPcaId)
  const targetAllocation = getAllocationByStaffId(args.allocations, args.targetPcaId)
  if (!targetPca || !targetAllocation) return null

  const supportedSlots = getNormalizedAvailableSlots(targetPca)
  const updates: SlotOwnerUpdate[] = []

  for (const allocation of [...args.allocations].sort((a, b) =>
    String(a.staff_id).localeCompare(String(b.staff_id))
  )) {
    if (allocation.staff_id === args.targetPcaId) continue
    for (const slot of VALID_SLOTS) {
      if (getSlotOwner(allocation, slot) !== args.team) continue
      if (!supportedSlots.includes(slot)) return null
      if (getSlotOwner(targetAllocation, slot) != null) return null
      updates.push({
        pcaId: allocation.staff_id,
        slot,
        fromTeam: args.team,
        toTeam: null,
      })
      updates.push({
        pcaId: args.targetPcaId,
        slot,
        fromTeam: null,
        toTeam: args.team,
      })
    }
  }

  if (updates.length === 0) return null
  return buildCandidate(
    'C1',
    args.sortKey,
    args.allocations,
    args.pcaPool,
    updates,
    args.committedStep3Anchors
  )
}

function isUsefulOpenSlotForTeam(
  allocations: PCAAllocation[],
  team: Team,
  slot: Slot,
  teamPrefs: Record<Team, TeamPreferenceInfo>
): boolean {
  if (!isSlotAllowedForTeam(team, slot, teamPrefs)) return false
  if (getAssignedSlotsForTeam(allocations, team).includes(slot)) return false
  const pref = teamPrefs[team]
  return pref.rankedSlots.includes(slot) || pref.unrankedNonGymSlots.includes(slot)
}

function isUsefulReplacementSlotForTeam(
  team: Team,
  slot: Slot,
  teamPrefs: Record<Team, TeamPreferenceInfo>
): boolean {
  if (!isSlotAllowedForTeam(team, slot, teamPrefs)) return false
  const pref = teamPrefs[team]
  return pref.rankedSlots.includes(slot) || pref.unrankedNonGymSlots.includes(slot)
}

function isFairnessFloorRescueSlotForTeam(
  allocations: PCAAllocation[],
  team: Team,
  slot: Slot,
  teamPrefs: Record<Team, TeamPreferenceInfo>,
  floatingPcaIds: Set<string>
): boolean {
  const pref = teamPrefs[team]
  const isGymLastResort = pref.avoidGym && pref.gymSlot === slot
  if (!isGymLastResort && !isSlotAllowedForTeam(team, slot, teamPrefs)) return false
  return !getAssignedFloatingSlotsForTeam(allocations, team, floatingPcaIds).includes(slot)
}

function getFairnessFloorRescueSlots(
  team: Team,
  teamPrefs: Record<Team, TeamPreferenceInfo>
): Slot[] {
  const pref = teamPrefs[team]
  const slots = [...pref.duplicateRankOrder.filter(isValidSlot)]
  if (pref.avoidGym && pref.gymSlot != null && isValidSlot(pref.gymSlot) && !slots.includes(pref.gymSlot)) {
    slots.push(pref.gymSlot)
  }
  return slots
}

function isValidSlot(value: number): value is Slot {
  return value === 1 || value === 2 || value === 3 || value === 4
}

function zeroPendingFTE(): Record<Team, number> {
  const record = {} as Record<Team, number>
  for (const team of TEAMS) {
    record[team] = 0
  }
  return record
}

function buildAuditStateForRepairCandidates(
  context: GenerateRepairCandidatesContext
): ReturnType<typeof buildRankedV2RepairAuditState> {
  const initial = context.initialPendingFTE ?? zeroPendingFTE()
  return buildRankedV2RepairAuditState({
    teamOrder: context.teamOrder ?? TEAMS,
    initialPendingFTE: initial,
    pendingFTE: context.pendingFTE ?? initial,
    allocations: context.allocations,
    pcaPool: context.pcaPool,
    teamPrefs: context.teamPrefs,
    baselineAllocations: context.baselineAllocations,
  })
}

function generateB1Candidates(context: GenerateRepairCandidatesContext): RepairCandidate[] {
  const { defect, allocations, pcaPool, teamPrefs } = context
  if (defect.kind !== 'B1') return []

  const requestingTeam = defect.team
  const candidates: RepairCandidate[] = []
  const sortedPcas = [...pcaPool].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const floatingPcaIds = buildFloatingPcaIdSet(pcaPool)
  const auditState = buildAuditStateForRepairCandidates(context)
  const anchors = context.committedStep3Anchors
  for (
    const targetSlot of getRankedMissingSlots(
      allocations,
      requestingTeam,
      teamPrefs,
      floatingPcaIds,
      context.initialPendingFTE
    )
  ) {
    for (const targetPca of sortedPcas) {
      if (!getNormalizedAvailableSlots(targetPca).includes(targetSlot)) continue
      const targetAllocation = getAllocationByStaffId(allocations, targetPca.id)
      const targetOwner = getSlotOwner(targetAllocation, targetSlot)
      if (!targetOwner || targetOwner === requestingTeam) continue

      if (
        donorHasTrueStep3Ownership(auditState, targetOwner, targetPca.id, targetSlot) &&
        teamCanDonateBoundedly(auditState, targetOwner, targetPca.id, targetSlot)
      ) {
        const donation = buildCandidate(
          'B1',
          `b1:donate:${targetPca.id}:${targetSlot}:${targetOwner}->${requestingTeam}`,
          allocations,
          pcaPool,
          [
            {
              pcaId: targetPca.id,
              slot: targetSlot,
              fromTeam: targetOwner,
              toTeam: requestingTeam,
            },
          ],
          anchors
        )
        if (donation) {
          candidates.push(donation)
        }
      }

      for (const fallbackPca of sortedPcas) {
        const fallbackAllocation = getAllocationByStaffId(allocations, fallbackPca.id)
        const supportedSlots = getNormalizedAvailableSlots(fallbackPca)
        for (const fallbackSlot of teamPrefs[targetOwner].duplicateRankOrder) {
          if (
            fallbackSlot !== 1 &&
            fallbackSlot !== 2 &&
            fallbackSlot !== 3 &&
            fallbackSlot !== 4
          ) {
            continue
          }
          if (!supportedSlots.includes(fallbackSlot)) {
            continue
          }
          if (!isUsefulOpenSlotForTeam(allocations, targetOwner, fallbackSlot, teamPrefs)) {
            continue
          }
          if (getSlotOwner(fallbackAllocation, fallbackSlot) != null) {
            continue
          }

          const candidate = applyOneSlotMove({
            defectKind: 'B1',
            sortKey: `b1:move:${targetPca.id}:${targetSlot}:${fallbackPca.id}:${fallbackSlot}`,
            allocations,
            pcaPool,
            targetPcaId: targetPca.id,
            targetSlot,
            fromTeam: targetOwner,
            toTeam: requestingTeam,
            fallbackPcaId: fallbackPca.id,
            fallbackSlot,
            fallbackTeam: targetOwner,
            committedStep3Anchors: anchors,
          })
          if (candidate) {
            candidates.push(candidate)
          }
        }
      }

      for (const donorAllocation of [...allocations].sort((a, b) =>
        String(a.staff_id).localeCompare(String(b.staff_id))
      )) {
        if (!floatingPcaIds.has(donorAllocation.staff_id)) continue
        for (const donorSlot of VALID_SLOTS) {
          if (getSlotOwner(donorAllocation, donorSlot) !== requestingTeam) continue
          if (!isUsefulReplacementSlotForTeam(targetOwner, donorSlot, teamPrefs)) {
            continue
          }
          const candidate = applyOneSlotSwap({
            defectKind: 'B1',
            sortKey: `b1:swap:${targetPca.id}:${targetSlot}:${donorAllocation.staff_id}:${donorSlot}`,
            allocations,
            pcaPool,
            targetPcaId: targetPca.id,
            targetSlot,
            targetOwner,
            newTargetOwner: requestingTeam,
            donorPcaId: donorAllocation.staff_id,
            donorSlot,
            donorOwner: requestingTeam,
            newDonorOwner: targetOwner,
            committedStep3Anchors: anchors,
          })
          if (candidate) {
            candidates.push(candidate)
          }
        }
      }
    }
  }

  return candidates
}

function generateA1Candidates(context: GenerateRepairCandidatesContext): RepairCandidate[] {
  const { defect, allocations, teamPrefs } = context
  if (defect.kind !== 'A1') return []

  const zeros = zeroPendingFTE()
  const pendingForRepairGates = context.pendingFTE ?? context.initialPendingFTE ?? zeros
  const shortBefore = countTeamsMaterialShort(pendingForRepairGates)

  const duplicateTeam = defect.team
  const anchors = context.committedStep3Anchors
  const candidates: RepairCandidate[] = []
  const teamSlots = getAssignedSlotsForTeam(allocations, duplicateTeam)
  const duplicateSlots = [...new Set(teamSlots.filter((slot, index) => teamSlots.indexOf(slot) !== index))].sort(
    (a, b) => a - b
  )
  const floatingPcaIds = buildFloatingPcaIdSet(context.pcaPool)

  const initialPendingForMonotone = context.initialPendingFTE
  const baselineAllocationsForMonotone = context.baselineAllocations
  const canApplyShortMonotonicity =
    initialPendingForMonotone != null && baselineAllocationsForMonotone != null
  const baselineAssignedSlots = canApplyShortMonotonicity
    ? countAssignedSlotsByTeamSnapshot(baselineAllocationsForMonotone)
    : null

  for (const slot of duplicateSlots) {
    for (const allocation of [...allocations].sort((a, b) =>
      String(a.staff_id).localeCompare(String(b.staff_id))
    )) {
      if (!floatingPcaIds.has(allocation.staff_id)) continue
      if (getSlotOwner(allocation, slot) !== duplicateTeam) continue
      for (const rescueTeam of (Object.keys(teamPrefs) as Team[]).sort((a, b) =>
        a.localeCompare(b)
      )) {
        if (rescueTeam === duplicateTeam) continue
        if (!teamHasMaterialRemainingFloatingPending(pendingForRepairGates, rescueTeam)) continue
        if (!isUsefulOpenSlotForTeam(allocations, rescueTeam, slot, teamPrefs)) continue

        const candidate = buildCandidate(
          'A1',
          `a1:peel:${allocation.staff_id}:${slot}:${duplicateTeam}->${rescueTeam}`,
          allocations,
          context.pcaPool,
          [
            {
              pcaId: allocation.staff_id,
              slot,
              fromTeam: duplicateTeam,
              toTeam: rescueTeam,
            },
          ],
          anchors
        )
        if (!candidate) continue
        if (canApplyShortMonotonicity && baselineAssignedSlots != null) {
          const candidatePendingFTE = computePendingFromAllocationsSnapshot(
            initialPendingForMonotone,
            baselineAssignedSlots,
            candidate.allocations
          )
          if (countTeamsMaterialShort(candidatePendingFTE) > shortBefore) continue
        }
        candidates.push(candidate)
      }
    }
  }

  const sortedFloatingAllocations = [...allocations]
    .filter((row) => floatingPcaIds.has(row.staff_id))
    .sort((a, b) => String(a.staff_id).localeCompare(String(b.staff_id)))
  const orderedRescueTeams = (Object.keys(teamPrefs) as Team[]).sort((a, b) => a.localeCompare(b))

  for (const slot of duplicateSlots) {
    for (const pDonor of sortedFloatingAllocations) {
      if (getSlotOwner(pDonor, slot) !== duplicateTeam) continue
      for (const rescueTeam of orderedRescueTeams) {
        if (rescueTeam === duplicateTeam) continue
        if (!teamHasMaterialRemainingFloatingPending(pendingForRepairGates, rescueTeam)) continue
        if (!isUsefulOpenSlotForTeam(allocations, rescueTeam, slot, teamPrefs)) continue

        for (const pRecipient of sortedFloatingAllocations) {
          if (pRecipient.staff_id === pDonor.staff_id) continue
          for (const slotOther of VALID_SLOTS) {
            if (getSlotOwner(pRecipient, slotOther) !== rescueTeam) continue
            if (!isUsefulReplacementSlotForTeam(duplicateTeam, slotOther, teamPrefs)) continue

            const sortKey = `a1:swap:${pDonor.staff_id}:${slot}:${pRecipient.staff_id}:${slotOther}:${duplicateTeam}->${rescueTeam}`
            const swapCandidate = buildCandidate(
              'A1',
              sortKey,
              allocations,
              context.pcaPool,
              [
                {
                  pcaId: pDonor.staff_id,
                  slot,
                  fromTeam: duplicateTeam,
                  toTeam: rescueTeam,
                },
                {
                  pcaId: pRecipient.staff_id,
                  slot: slotOther,
                  fromTeam: rescueTeam,
                  toTeam: duplicateTeam,
                },
              ],
              anchors
            )
            if (!swapCandidate) continue
            if (canApplyShortMonotonicity && baselineAssignedSlots != null) {
              const candidatePendingFTE = computePendingFromAllocationsSnapshot(
                initialPendingForMonotone,
                baselineAssignedSlots,
                swapCandidate.allocations
              )
              if (countTeamsMaterialShort(candidatePendingFTE) > shortBefore) continue
            }
            candidates.push(swapCandidate)
          }
        }
      }
    }
  }

  return candidates
}

function generateA2Candidates(context: GenerateRepairCandidatesContext): RepairCandidate[] {
  const { defect, allocations, pcaPool, teamPrefs } = context
  if (defect.kind !== 'A2') return []

  const anchors = context.committedStep3Anchors
  const targetAllocation = getAllocationByStaffId(allocations, defect.pcaId)
  if (!targetAllocation) return []

  const targetPca = getPcaById(pcaPool, defect.pcaId)
  if (!targetPca) return []

  const candidates: RepairCandidate[] = []
  const supportedSlots = getNormalizedAvailableSlots(targetPca)
  const orderedTeams = (Object.keys(teamPrefs) as Team[]).sort((a, b) => a.localeCompare(b))

  for (const rescueTeam of orderedTeams) {
    if (rescueTeam === defect.team) continue
    const rescuePref = teamPrefs[rescueTeam]
    const preferredPathSlots = rescuePref.preferredPCAIds.includes(defect.pcaId)
      ? rescuePref.unrankedNonGymSlots.filter(
          (slot): slot is Slot => slot === 1 || slot === 2 || slot === 3 || slot === 4
        )
      : []
    const rescueSlots = [...new Set([...rescuePref.rankedSlots, ...preferredPathSlots])]

    for (const slot of rescueSlots) {
      if (slot !== 1 && slot !== 2 && slot !== 3 && slot !== 4) continue
      if (!supportedSlots.includes(slot)) continue
      if (!isUsefulOpenSlotForTeam(allocations, rescueTeam, slot, teamPrefs)) continue

      if (getSlotOwner(targetAllocation, slot) === defect.team) {
        const directCandidate = buildCandidate(
          'A2',
          `a2:direct:${defect.pcaId}:${slot}:${defect.team}->${rescueTeam}`,
          allocations,
          pcaPool,
          [
            {
              pcaId: defect.pcaId,
              slot,
              fromTeam: defect.team,
              toTeam: rescueTeam,
            },
          ],
          anchors
        )
        if (directCandidate) candidates.push(directCandidate)
      }

      for (const ownedSlot of VALID_SLOTS) {
        if (getSlotOwner(targetAllocation, ownedSlot) !== defect.team) continue

        const fallbackCandidate = buildFallbackMoveCandidate({
          defectKind: 'A2',
          sortPrefix: 'a2',
          allocations,
          pcaPool,
          teamPrefs,
          sourcePcaId: defect.pcaId,
          sourceSlot: ownedSlot,
          sourceTeam: defect.team,
          rescuePcaId: defect.pcaId,
          rescueSlot: slot,
          rescueTeam,
          committedStep3Anchors: anchors,
        })
        if (fallbackCandidate) candidates.push(fallbackCandidate)
      }
    }
  }

  return candidates
}

function generateF1Candidates(context: GenerateRepairCandidatesContext): RepairCandidate[] {
  const { defect, allocations, pcaPool, teamPrefs } = context
  if (defect.kind !== 'F1') return []

  const anchors = context.committedStep3Anchors
  const candidates: RepairCandidate[] = []
  const orderedAllocations = [...allocations].sort((a, b) => String(a.staff_id).localeCompare(String(b.staff_id)))
  const floatingPcaIds = buildFloatingPcaIdSet(pcaPool)
  const auditState = buildAuditStateForRepairCandidates(context)

  for (const rescueSlot of getFairnessFloorRescueSlots(defect.team, teamPrefs)) {
    if (
      !isFairnessFloorRescueSlotForTeam(
        allocations,
        defect.team,
        rescueSlot,
        teamPrefs,
        floatingPcaIds
      )
    ) {
      continue
    }

    for (const rescuePca of [...pcaPool].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
      if (!getNormalizedAvailableSlots(rescuePca).includes(rescueSlot)) continue

      const rescueAllocation = getAllocationByStaffId(allocations, rescuePca.id)
      const rescueOwner = getSlotOwner(rescueAllocation, rescueSlot)

      if (rescueOwner == null) {
        const candidate = buildCandidate(
          'F1',
          `f1:open:${rescuePca.id}:${rescueSlot}:${defect.team}`,
          allocations,
          pcaPool,
          [
            {
              pcaId: rescuePca.id,
              slot: rescueSlot,
              fromTeam: null,
              toTeam: defect.team,
            },
          ],
          anchors
        )
        if (candidate) candidates.push(candidate)
        continue
      }

      if (rescueOwner === defect.team) continue

      if (
        rescueOwner != null &&
        donorHasTrueStep3Ownership(auditState, rescueOwner, rescuePca.id, rescueSlot) &&
        teamCanDonateBoundedly(auditState, rescueOwner, rescuePca.id, rescueSlot)
      ) {
        const donation = buildCandidate(
          'F1',
          `f1:donate:${rescuePca.id}:${rescueSlot}:${rescueOwner}->${defect.team}`,
          allocations,
          pcaPool,
          [
            {
              pcaId: rescuePca.id,
              slot: rescueSlot,
              fromTeam: rescueOwner,
              toTeam: defect.team,
            },
          ],
          anchors
        )
        if (donation) candidates.push(donation)
      }

      for (const donorAllocation of orderedAllocations) {
        if (!floatingPcaIds.has(donorAllocation.staff_id)) continue
        if (donorAllocation.staff_id === rescuePca.id) continue
        for (const donorSlot of VALID_SLOTS) {
          if (getSlotOwner(donorAllocation, donorSlot) !== defect.team) continue
          if (!isUsefulOpenSlotForTeam(allocations, rescueOwner, donorSlot, teamPrefs)) continue
          const candidate = applyOneSlotSwap({
            defectKind: 'F1',
            sortKey: `f1:swap:${rescuePca.id}:${rescueSlot}:${donorAllocation.staff_id}:${donorSlot}`,
            allocations,
            pcaPool,
            targetPcaId: rescuePca.id,
            targetSlot: rescueSlot,
            targetOwner: rescueOwner,
            newTargetOwner: defect.team,
            donorPcaId: donorAllocation.staff_id,
            donorSlot,
            donorOwner: defect.team,
            newDonorOwner: rescueOwner,
            committedStep3Anchors: anchors,
          })
          if (candidate) candidates.push(candidate)
        }
      }

      const fallbackCandidate = buildFallbackMoveCandidate({
        defectKind: 'F1',
        sortPrefix: 'f1',
        allocations,
        pcaPool,
        teamPrefs,
        sourcePcaId: rescuePca.id,
        sourceSlot: rescueSlot,
        sourceTeam: rescueOwner,
        rescuePcaId: rescuePca.id,
        rescueSlot,
        rescueTeam: defect.team,
        committedStep3Anchors: anchors,
      })
      if (fallbackCandidate) candidates.push(fallbackCandidate)
    }
  }

  return candidates
}

function buildFallbackMoveCandidate(args: {
  defectKind: RankedV2RepairDefect['kind']
  sortPrefix: string
  allocations: PCAAllocation[]
  pcaPool: PCAData[]
  teamPrefs: Record<Team, TeamPreferenceInfo>
  sourcePcaId: string
  sourceSlot: Slot
  sourceTeam: Team
  rescuePcaId: string
  rescueSlot: Slot
  rescueTeam: Team
  committedStep3Anchors?: Step3CommittedFloatingAnchor[]
}): RepairCandidate | null {
  const sortedPcas = [...args.pcaPool].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  for (const fallbackPca of sortedPcas) {
    const fallbackAllocation = getAllocationByStaffId(args.allocations, fallbackPca.id)
    const supportedSlots = getNormalizedAvailableSlots(fallbackPca)
    for (const fallbackSlot of args.teamPrefs[args.sourceTeam].duplicateRankOrder) {
      if (fallbackSlot !== 1 && fallbackSlot !== 2 && fallbackSlot !== 3 && fallbackSlot !== 4) {
        continue
      }
      if (!supportedSlots.includes(fallbackSlot)) continue
      if (!isUsefulOpenSlotForTeam(args.allocations, args.sourceTeam, fallbackSlot, args.teamPrefs)) continue
      if (getSlotOwner(fallbackAllocation, fallbackSlot) != null) continue

      const candidate = applyOneSlotMove({
        defectKind: args.defectKind,
        sortKey: `${args.sortPrefix}:move:${args.sourcePcaId}:${args.sourceSlot}:${fallbackPca.id}:${fallbackSlot}:${args.rescueTeam}`,
        allocations: args.allocations,
        pcaPool: args.pcaPool,
        targetPcaId: args.sourcePcaId,
        targetSlot: args.sourceSlot,
        fromTeam: args.sourceTeam,
        toTeam: args.rescueTeam,
        fallbackPcaId: fallbackPca.id,
        fallbackSlot,
        fallbackTeam: args.sourceTeam,
        committedStep3Anchors: args.committedStep3Anchors,
      })
      if (candidate) return candidate
    }
  }

  return null
}

function generateC1Candidates(context: GenerateRepairCandidatesContext): RepairCandidate[] {
  const { defect, allocations, pcaPool } = context
  if (defect.kind !== 'C1') return []

  const team = defect.team
  const floatingPcaIds = buildFloatingPcaIdSet(pcaPool)
  const teamPcaIds = getTeamPcaIds(allocations, team).filter((pcaId) => floatingPcaIds.has(pcaId))
  const candidates: RepairCandidate[] = []

  for (const targetPcaId of teamPcaIds) {
    const candidate = applyContinuityCollapse({
      sortKey: `c1:${targetPcaId}:${team}`,
      allocations,
      team,
      targetPcaId,
      pcaPool,
      committedStep3Anchors: context.committedStep3Anchors,
    })
    if (candidate) candidates.push(candidate)
  }

  return candidates
}

const MAX_OPTIONAL_PROMOTION_CANDIDATES = 400

function countAssignedSlotsByTeamSnapshot(allocations: PCAAllocation[]): Record<Team, number> {
  const counts = {} as Record<Team, number>
  for (const team of TEAMS) {
    counts[team] = 0
  }
  for (const allocation of allocations) {
    if (allocation.slot1) counts[allocation.slot1] += 1
    if (allocation.slot2) counts[allocation.slot2] += 1
    if (allocation.slot3) counts[allocation.slot3] += 1
    if (allocation.slot4) counts[allocation.slot4] += 1
  }
  return counts
}

function computePendingFromAllocationsSnapshot(
  initialPendingFTE: Record<Team, number>,
  baselineAssignedSlots: Record<Team, number>,
  allocations: PCAAllocation[]
): Record<Team, number> {
  const finalAssignedCounts = countAssignedSlotsByTeamSnapshot(allocations)
  const next = {} as Record<Team, number>
  for (const team of TEAMS) {
    const pendingSlotsAtStep34Start = Math.round(((initialPendingFTE[team] ?? 0) + 1e-9) / 0.25)
    const newlyCoveredSlots = finalAssignedCounts[team] - baselineAssignedSlots[team]
    const remainingSlots = Math.max(0, pendingSlotsAtStep34Start - newlyCoveredSlots)
    next[team] = remainingSlots * 0.25
  }
  return next
}

function isTrueStep3FloatingCell(
  allocations: PCAAllocation[],
  baselineByStaffId: Map<string, PCAAllocation | undefined>,
  floatingPcaIds: Set<string>,
  team: Team,
  pcaId: string,
  slot: Slot
): boolean {
  if (!floatingPcaIds.has(pcaId)) return false
  const allocation = getAllocationByStaffId(allocations, pcaId)
  if (!allocation) return false
  const baseline = baselineByStaffId.get(pcaId)
  if (getSlotOwner(allocation, slot) !== team) return false
  if (getSlotOwner(baseline, slot) === team) return false
  return true
}

type AnchoredTrueStep3OutsideSlotsMode = 'anchorsOnly' | 'anchorsPlusDuplicateRankOrder'

/** When pending is satisfied, true Step 3 floating for anchored teams must stay on allowed clock slots. */
function findAnchoredSatisfiedTrueStep3OutsideAnchorSlotsViolation(
  next: PCAAllocation[],
  nextPending: Record<Team, number>,
  anchors: Step3CommittedFloatingAnchor[] | undefined,
  baselineAllocations: PCAAllocation[],
  pcaPool: PCAData[],
  opts?: {
    /**
     * `anchorsOnly` (default): optional-promotion bar — true Step 3 may only occupy committed anchor slots.
     * `anchorsPlusDuplicateRankOrder`: gym-avoidance repair may place floating on any team duplicate-rank
     * slot (ranked ∪ unranked non-gym, gym omitted when avoided) while keeping anchors; see f124.
     */
    allowedSlotsMode?: AnchoredTrueStep3OutsideSlotsMode
    teamPrefs?: Record<Team, TeamPreferenceInfo>
  }
): {
  team: Team
  disallowedSlot: Slot
  allowedAnchorSlots: Slot[]
  afterTrueStep3Slots: Slot[]
} | null {
  if (!anchors?.length) return null
  const baselineByStaffId = new Map<string, PCAAllocation | undefined>()
  for (const row of baselineAllocations) {
    baselineByStaffId.set(row.staff_id, row)
  }
  const floatingPcaIds = buildFloatingPcaIdSet(pcaPool)
  const sortedPcas = [...pcaPool].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const mode: AnchoredTrueStep3OutsideSlotsMode = opts?.allowedSlotsMode ?? 'anchorsOnly'

  for (const team of TEAMS) {
    if (!anchors.some((a) => a.team === team)) continue
    if (roundToNearestQuarterWithMidpoint(nextPending[team] ?? 0) >= 0.25) continue
    const allowedAnchorSlots = [
      ...new Set(anchors.filter((a) => a.team === team).map((a) => a.slot)),
    ].sort((a, b) => a - b)
    const allowed = new Set<Slot>(allowedAnchorSlots)
    if (mode === 'anchorsPlusDuplicateRankOrder' && opts?.teamPrefs) {
      const pref = opts.teamPrefs[team]
      for (const raw of pref?.duplicateRankOrder ?? []) {
        if (raw === 1 || raw === 2 || raw === 3 || raw === 4) {
          allowed.add(raw)
        }
      }
    }
    const afterTrueStep3Slots = new Set<Slot>()
    for (const pca of sortedPcas) {
      for (const slot of VALID_SLOTS) {
        if (isTrueStep3FloatingCell(next, baselineByStaffId, floatingPcaIds, team, pca.id, slot)) {
          afterTrueStep3Slots.add(slot)
        }
      }
    }
    for (const slot of afterTrueStep3Slots) {
      if (!allowed.has(slot)) {
        return {
          team,
          disallowedSlot: slot,
          allowedAnchorSlots,
          afterTrueStep3Slots: [...afterTrueStep3Slots].sort((a, b) => a - b),
        }
      }
    }
  }
  return null
}

export type OptionalPromotionDetectionArgs = {
  teamOrder: Team[]
  initialPendingFTE: Record<Team, number>
  pendingFTE: Record<Team, number>
  allocations: PCAAllocation[]
  pcaPool: PCAData[]
  teamPrefs: Record<Team, TeamPreferenceInfo>
  baselineAllocations: PCAAllocation[]
  committedStep3Anchors?: Step3CommittedFloatingAnchor[]
}

export function generateOptionalPromotionCandidates(
  args: OptionalPromotionDetectionArgs
): RepairCandidate[] {
  const baselineByStaffId = new Map<string, PCAAllocation | undefined>()
  for (const row of args.baselineAllocations) {
    baselineByStaffId.set(row.staff_id, row)
  }
  const floatingPcaIds = buildFloatingPcaIdSet(args.pcaPool)
  const anchors = args.committedStep3Anchors
  const sortedPcas = [...args.pcaPool].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const candidates: RepairCandidate[] = []
  const teamOrder = args.teamOrder ?? TEAMS
  const baselineAssignedSlots = countAssignedSlotsByTeamSnapshot(args.baselineAllocations)

  const isValidPromotionOutcome = (next: PCAAllocation[]): boolean => {
    if (!committedAnchorsStillHold(next, anchors)) return false
    const nextPending = computePendingFromAllocationsSnapshot(
      args.initialPendingFTE,
      baselineAssignedSlots,
      next
    )
    const defects = detectRankedV2RepairDefects({
      teamOrder,
      initialPendingFTE: args.initialPendingFTE,
      pendingFTE: nextPending,
      allocations: next,
      pcaPool: args.pcaPool,
      teamPrefs: args.teamPrefs,
      baselineAllocations: args.baselineAllocations,
      committedStep3Anchors: anchors,
    })
    if (defects.length > 0) return false

    if (anchors && anchors.length > 0) {
      const beforeCounts = countTrueStep3FloatingSlotsByTeam({
        teamOrder,
        initialPendingFTE: args.initialPendingFTE,
        pendingFTE: args.pendingFTE,
        allocations: args.allocations,
        pcaPool: args.pcaPool,
        teamPrefs: args.teamPrefs,
        baselineAllocations: args.baselineAllocations,
        committedStep3Anchors: anchors,
      })
      const afterCounts = countTrueStep3FloatingSlotsByTeam({
        teamOrder,
        initialPendingFTE: args.initialPendingFTE,
        pendingFTE: nextPending,
        allocations: next,
        pcaPool: args.pcaPool,
        teamPrefs: args.teamPrefs,
        baselineAllocations: args.baselineAllocations,
        committedStep3Anchors: anchors,
      })
      for (const team of TEAMS) {
        if (!anchors.some((a) => a.team === team)) continue
        const nextPRounded = roundToNearestQuarterWithMidpoint(nextPending[team] ?? 0)
        if (nextPRounded >= 0.25) {
          continue
        }
        if (afterCounts[team] > beforeCounts[team]) {
          return false
        }
      }
      // Satisfied pending + Step 3.2/3.3 anchors: true Step 3 floating may only occupy committed
      // anchor clock slots (net-count alone allows rank-improving swaps onto non-anchor slots).
      const anchorSlotViol = findAnchoredSatisfiedTrueStep3OutsideAnchorSlotsViolation(
        next,
        nextPending,
        anchors,
        args.baselineAllocations,
        args.pcaPool
      )
      if (anchorSlotViol) {
        return false
      }
    }

    return true
  }

  const tryPush = (candidate: RepairCandidate | null) => {
    if (!candidate) return
    if (!isValidPromotionOutcome(candidate.allocations)) return
    if (candidates.length >= MAX_OPTIONAL_PROMOTION_CANDIDATES) return
    candidates.push(candidate)
  }

  for (const pcaA of sortedPcas) {
    const allocA = getAllocationByStaffId(args.allocations, pcaA.id)
    if (!allocA) continue
    for (const slotA of VALID_SLOTS) {
      const ownerA = getSlotOwner(allocA, slotA)
      if (!ownerA) continue
      if (
        !isTrueStep3FloatingCell(
          args.allocations,
          baselineByStaffId,
          floatingPcaIds,
          ownerA,
          pcaA.id,
          slotA
        )
      ) {
        continue
      }

      for (const pcaB of sortedPcas) {
        if (pcaA.id >= pcaB.id) continue
        const allocB = getAllocationByStaffId(args.allocations, pcaB.id)
        if (!allocB) continue
        for (const slotB of VALID_SLOTS) {
          const ownerB = getSlotOwner(allocB, slotB)
          if (!ownerB) continue
          if (ownerA === ownerB) continue
          if (
            !isTrueStep3FloatingCell(
              args.allocations,
              baselineByStaffId,
              floatingPcaIds,
              ownerB,
              pcaB.id,
              slotB
            )
          ) {
            continue
          }

          tryPush(
            applyOneSlotSwap({
              defectKind: 'P1',
              sortKey: `p1:cross:${pcaA.id}:${slotA}:${pcaB.id}:${slotB}`,
              allocations: args.allocations,
              pcaPool: args.pcaPool,
              targetPcaId: pcaA.id,
              targetSlot: slotA,
              targetOwner: ownerA,
              newTargetOwner: ownerB,
              donorPcaId: pcaB.id,
              donorSlot: slotB,
              donorOwner: ownerB,
              newDonorOwner: ownerA,
              committedStep3Anchors: anchors,
            })
          )
        }
      }
    }
  }

  const sortedTeams = [...TEAMS].sort((a, b) => a.localeCompare(b))

  for (const team of sortedTeams) {
    const occupied: Array<{ pcaId: string; slot: Slot }> = []
    for (const pca of sortedPcas) {
      for (const slot of VALID_SLOTS) {
        if (
          isTrueStep3FloatingCell(
            args.allocations,
            baselineByStaffId,
            floatingPcaIds,
            team,
            pca.id,
            slot
          )
        ) {
          occupied.push({ pcaId: pca.id, slot })
        }
      }
    }
    for (let i = 0; i < occupied.length; i += 1) {
      for (let j = i + 1; j < occupied.length; j += 1) {
        const a = occupied[i]
        const b = occupied[j]
        if (a.pcaId === b.pcaId || a.slot === b.slot) continue
        tryPush(
          buildCandidate(
            'P1',
            `p1:sameteam:${team}:${a.pcaId}:${a.slot}:${b.pcaId}:${b.slot}`,
            args.allocations,
            args.pcaPool,
            [
              { pcaId: a.pcaId, slot: a.slot, fromTeam: team, toTeam: null },
              { pcaId: b.pcaId, slot: b.slot, fromTeam: team, toTeam: null },
              { pcaId: a.pcaId, slot: b.slot, fromTeam: null, toTeam: team },
              { pcaId: b.pcaId, slot: a.slot, fromTeam: null, toTeam: team },
            ],
            anchors
          )
        )
      }
    }
  }

  for (const pca of sortedPcas) {
    const allocation = getAllocationByStaffId(args.allocations, pca.id)
    if (!allocation) continue
    for (const slotA of VALID_SLOTS) {
      for (const slotB of VALID_SLOTS) {
        if (slotA >= slotB) continue
        const ownerA = getSlotOwner(allocation, slotA)
        const ownerB = getSlotOwner(allocation, slotB)
        if (!ownerA || !ownerB) continue
        if (ownerA === ownerB) continue
        if (
          !isTrueStep3FloatingCell(
            args.allocations,
            baselineByStaffId,
            floatingPcaIds,
            ownerA,
            pca.id,
            slotA
          )
        ) {
          continue
        }
        if (
          !isTrueStep3FloatingCell(
            args.allocations,
            baselineByStaffId,
            floatingPcaIds,
            ownerB,
            pca.id,
            slotB
          )
        ) {
          continue
        }

        tryPush(
          buildCandidate(
            'P1',
            `p1:samepca:${pca.id}:${slotA}:${slotB}:${ownerA}:${ownerB}`,
            args.allocations,
            args.pcaPool,
            [
              { pcaId: pca.id, slot: slotA, fromTeam: ownerA, toTeam: ownerB },
              { pcaId: pca.id, slot: slotB, fromTeam: ownerB, toTeam: ownerA },
            ],
            anchors
          )
        )
      }
    }
  }

  candidates.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  return candidates
}

export function detectOptionalRankedPromotionOpportunities(
  args: OptionalPromotionDetectionArgs
): RankedV2OptionalPromotionOpportunity[] {
  const teamOrder = args.teamOrder ?? TEAMS
  const defects = detectRankedV2RepairDefects({
    teamOrder,
    initialPendingFTE: args.initialPendingFTE,
    pendingFTE: args.pendingFTE,
    allocations: args.allocations,
    pcaPool: args.pcaPool,
    teamPrefs: args.teamPrefs,
    baselineAllocations: args.baselineAllocations,
    committedStep3Anchors: args.committedStep3Anchors,
  })
  if (defects.length > 0) return []

  const cands = generateOptionalPromotionCandidates(args)
  if (cands.length === 0) return []

  const teams = new Set<Team>()
  for (const candidate of cands) {
    for (const assignment of candidate.repairAssignments) {
      teams.add(assignment.team)
    }
  }
  return [...teams]
    .sort((a, b) => a.localeCompare(b))
    .map((team) => ({ kind: 'P1' as const, team }))
}

export function generateRepairCandidates(
  context: GenerateRepairCandidatesContext
): RepairCandidate[] {
  const candidates =
    context.defect.kind === 'B1'
      ? generateB1Candidates(context)
      : context.defect.kind === 'A1'
        ? generateA1Candidates(context)
        : context.defect.kind === 'A2'
          ? generateA2Candidates(context)
        : context.defect.kind === 'C1'
          ? generateC1Candidates(context)
          : context.defect.kind === 'F1'
            ? generateF1Candidates(context)
          : []

  if (context.defect.kind === 'A1') {
    candidates.sort((a, b) => compareA1RepairSortKeysForScanOrder(a.sortKey, b.sortKey))
  } else {
    candidates.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  }
  return candidates
}

/** Part III gym pass cap (spec); keep ≤ `MAX_REPAIR_ITERATIONS` in allocator. */
export const MAX_GYM_AVOIDANCE_REPAIR_ITERATIONS = 6

function countAssignedSlotsByTeamForGymRepairLoop(allocations: PCAAllocation[]): Record<Team, number> {
  const counts = zeroPendingFTE()
  for (const allocation of allocations) {
    if (allocation.slot1) counts[allocation.slot1] += 1
    if (allocation.slot2) counts[allocation.slot2] += 1
    if (allocation.slot3) counts[allocation.slot3] += 1
    if (allocation.slot4) counts[allocation.slot4] += 1
  }
  return counts
}

function computePendingFTEForGymRepairLoop(
  initialPendingFTE: Record<Team, number>,
  baselineAssignedSlots: Record<Team, number>,
  allocations: PCAAllocation[]
): Record<Team, number> {
  const finalAssignedCounts = countAssignedSlotsByTeamForGymRepairLoop(allocations)
  const next = zeroPendingFTE()
  for (const team of TEAMS) {
    const pendingSlotsAtStep34Start = Math.round(((initialPendingFTE[team] ?? 0) + 1e-9) / 0.25)
    const newlyCoveredSlots = finalAssignedCounts[team] - baselineAssignedSlots[team]
    const remainingSlots = Math.max(0, pendingSlotsAtStep34Start - newlyCoveredSlots)
    next[team] = remainingSlots * 0.25
  }
  return next
}

export type RunGymAvoidanceRepairLoopArgs = {
  teamOrder: Team[]
  initialPendingFTE: Record<Team, number>
  pendingFTE: Record<Team, number>
  allocations: PCAAllocation[]
  pcaPool: PCAData[]
  teamPrefs: Record<Team, TeamPreferenceInfo>
  baselineAllocations?: PCAAllocation[]
  baselineAssignedSlots: Record<Team, number>
  committedStep3Anchors?: Step3CommittedFloatingAnchor[]
  onAcceptedMove?: (candidate: RepairCandidate) => void
  /** Defaults to `MAX_GYM_AVOIDANCE_REPAIR_ITERATIONS` (6). Allocator passes this explicitly for spec traceability (Task C3). */
  maxIterations?: number
}

/**
 * Part III bounded gym-avoidance repair: accepts moves that improve the gym story for a `G1`
 * target while keeping required-repair defects clear (same bar as feasibility in `repairAudit`).
 * Respects [committedStep3Anchors] identically to required repair / optional promotion (Constraint 6c).
 */
export function runGymAvoidanceRepairLoop(args: RunGymAvoidanceRepairLoopArgs): number {
  let accepted = 0
  const gymIterationCap = args.maxIterations ?? MAX_GYM_AVOIDANCE_REPAIR_ITERATIONS
  for (let iteration = 0; iteration < gymIterationCap; iteration += 1) {
    const gymCtx = {
      teamOrder: args.teamOrder,
      initialPendingFTE: args.initialPendingFTE,
      pendingFTE: args.pendingFTE,
      allocations: args.allocations,
      pcaPool: args.pcaPool,
      teamPrefs: args.teamPrefs,
      baselineAllocations: args.baselineAllocations,
      committedStep3Anchors: args.committedStep3Anchors,
    }

    const gymDefects = detectRankedV2GymAvoidableDefects(gymCtx)
    if (gymDefects.length === 0) break

    type BestRow = {
      candidate: RepairCandidate
      targetOffGym: boolean
      globalGymLastResort: number
      sortKey: string
    }
    let best: BestRow | null = null

    const sortedG1 = [...gymDefects]
      .filter((d): d is Extract<RankedV2RepairDefect, { kind: 'G1' }> => d.kind === 'G1')
      .sort((a, b) => String(a.team).localeCompare(String(b.team)))

    for (const defect of sortedG1) {
      const batches = listRankedV2GymFeasibilityValidReshuffleBatches(
        gymCtx,
        defect.team,
        MAX_GYM_FEASIBILITY_PROBE_CANDIDATES
      )
      for (const batch of batches) {
        const sortKey = gymFeasibilityBatchSortKey(defect.team, batch)
        const updates: SlotOwnerUpdate[] = batch.map((u) => ({
          pcaId: u.pcaId,
          slot: u.slot,
          fromTeam: u.fromTeam,
          toTeam: u.toTeam,
        }))
        const candidate = buildCandidate(
          'G1',
          sortKey,
          args.allocations,
          args.pcaPool,
          updates,
          args.committedStep3Anchors
        )
        if (!candidate) continue

        const nextPending = computePendingFTEForGymRepairLoop(
          args.initialPendingFTE,
          args.baselineAssignedSlots,
          candidate.allocations
        )
        const requiredAfter = detectRankedV2RepairDefects({
          teamOrder: args.teamOrder,
          initialPendingFTE: args.initialPendingFTE,
          pendingFTE: nextPending,
          allocations: candidate.allocations,
          pcaPool: args.pcaPool,
          teamPrefs: args.teamPrefs,
          baselineAllocations: args.baselineAllocations,
          committedStep3Anchors: args.committedStep3Anchors,
        })
        if (requiredAfter.length > 0) continue

        const gymAnchorViol = findAnchoredSatisfiedTrueStep3OutsideAnchorSlotsViolation(
          candidate.allocations,
          nextPending,
          args.committedStep3Anchors,
          args.baselineAllocations ?? [],
          args.pcaPool,
          {
            allowedSlotsMode: 'anchorsPlusDuplicateRankOrder',
            teamPrefs: args.teamPrefs,
          }
        )
        if (gymAnchorViol) {
          continue
        }

        const metrics = getRankedV2GymAvoidanceRepairOutcomeMetrics(candidate.allocations, defect.team, {
          teamPrefs: args.teamPrefs,
          baselineAllocations: args.baselineAllocations,
          pcaPool: args.pcaPool,
        })
        const row: BestRow = {
          candidate,
          targetOffGym: !metrics.targetOnConfiguredGym,
          globalGymLastResort: metrics.globalGymLastResortCount,
          sortKey,
        }
        if (!best) {
          best = row
          continue
        }
        const cmp = compareRankedV2GymAvoidanceRepairOutcomes(
          {
            targetOffGym: row.targetOffGym,
            globalGymLastResort: row.globalGymLastResort,
            sortKey: row.sortKey,
          },
          {
            targetOffGym: best.targetOffGym,
            globalGymLastResort: best.globalGymLastResort,
            sortKey: best.sortKey,
          }
        )
        if (cmp < 0) {
          best = row
        }
      }
    }

    if (!best) break

    args.allocations.splice(
      0,
      args.allocations.length,
      ...best.candidate.allocations.map((allocation) => ({ ...allocation }))
    )
    Object.assign(
      args.pendingFTE,
      computePendingFTEForGymRepairLoop(
        args.initialPendingFTE,
        args.baselineAssignedSlots,
        args.allocations
      )
    )
    accepted += 1
    args.onAcceptedMove?.(best.candidate)
  }

  return accepted
}
