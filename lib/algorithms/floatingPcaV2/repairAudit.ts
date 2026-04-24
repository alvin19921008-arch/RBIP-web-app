import type { Team } from '@/types/staff'
import type { PCAAllocation } from '@/types/schedule'
import type { PCAData } from '@/lib/algorithms/pcaAllocationTypes'
import { TEAMS, type TeamPreferenceInfo } from '@/lib/utils/floatingPCAHelpers'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { teamHasMaterialRemainingFloatingPending } from './duplicateRepairPolicy'

type Slot = 1 | 2 | 3 | 4

const VALID_SLOTS: Slot[] = [1, 2, 3, 4]

export type RankedV2RepairDefect =
  | { kind: 'B1'; team: Team }
  | { kind: 'A1'; team: Team }
  | { kind: 'A2'; team: Team; pcaId: string }
  | { kind: 'C1'; team: Team }
  | { kind: 'F1'; team: Team }
  /** Part III gym-avoidable audit only — never returned from `detectRankedV2RepairDefects` (Constraint 6e). */
  | { kind: 'G1'; team: Team }

/** Optional ranked promotion opportunity (Constraint 5 — not a B1 defect). */
export type RankedV2OptionalPromotionOpportunity = { kind: 'P1'; team: Team }

/** Same fields as `Step3CommittedFloatingAnchor` in `repairMoves` (defined here to avoid circular imports). */
export type RankedV2CommittedStep3FloatingAnchor = {
  team: Team
  slot: Slot
  pcaId: string
}

export type DetectRankedV2RepairDefectsContext = {
  teamOrder: Team[]
  initialPendingFTE: Record<Team, number>
  pendingFTE: Record<Team, number>
  allocations: PCAAllocation[]
  pcaPool: PCAData[]
  teamPrefs: Record<Team, TeamPreferenceInfo>
  baselineAllocations?: PCAAllocation[]
  /** Step 3.2 / 3.3 user commits — refines B1 when remaining pending is already satisfied. */
  committedStep3Anchors?: RankedV2CommittedStep3FloatingAnchor[]
}

export type DetectRankedV2GymAvoidableDefectsContext = DetectRankedV2RepairDefectsContext

export type RankedV2RepairAuditState = {
  orderedTeams: Team[]
  orderedPcas: PCAData[]
  floatingPcaIds: Set<string>
  allocationByStaffId: Map<string, PCAAllocation>
  baselineAllocationByStaffId: Map<string, PCAAllocation>
  slotCountsByTeam: Record<Team, Map<Slot, number>>
  trueStep3SlotCountsByTeam: Record<Team, Map<Slot, number>>
  assignedSlotsByTeam: Record<Team, Slot[]>
  trueStep3AssignedSlotsByTeam: Record<Team, Slot[]>
  distinctPcaIdsByTeam: Record<Team, string[]>
  distinctTrueStep3PcaIdsByTeam: Record<Team, string[]>
  initialPendingFTE: Record<Team, number>
  pendingFTE: Record<Team, number>
  teamPrefs: Record<Team, TeamPreferenceInfo>
}

/** @internal alias */
type AuditState = RankedV2RepairAuditState

export function buildRankedV2RepairAuditState(
  context: DetectRankedV2RepairDefectsContext
): RankedV2RepairAuditState {
  return buildAuditState(context)
}

/** True Step 3 floating slot instances per team (for optional-promotion net-slot gates). */
export function countTrueStep3FloatingSlotsByTeam(
  context: DetectRankedV2RepairDefectsContext
): Record<Team, number> {
  const state = buildAuditState(context)
  const result = {} as Record<Team, number>
  for (const team of TEAMS) {
    result[team] = countTrueStep3FloatingSlotInstances(state, team)
  }
  return result
}

function teamHasCommittedStep3FloatingAnchor(
  anchors: RankedV2CommittedStep3FloatingAnchor[] | undefined,
  team: Team
): boolean {
  return (anchors ?? []).some((anchor) => anchor.team === team)
}

/**
 * True when the donor team holds [slot] on [donorPcaId] as Step 3 floating (not baseline/upstream ownership).
 */
export function donorHasTrueStep3Ownership(
  state: RankedV2RepairAuditState,
  donorTeam: Team,
  donorPcaId: string,
  slot: Slot
): boolean {
  if (!state.floatingPcaIds.has(donorPcaId)) return false
  return getTrueStep3TeamSlotsOnPca(state, donorTeam, donorPcaId).includes(slot)
}

function countTrueStep3FloatingSlotInstances(state: RankedV2RepairAuditState, team: Team): number {
  let count = 0
  for (const pcaId of state.distinctTrueStep3PcaIdsByTeam[team]) {
    if (!state.floatingPcaIds.has(pcaId)) continue
    count += getTrueStep3TeamSlotsOnPca(state, team, pcaId).length
  }
  return count
}

/**
 * After hypothetically donating [slot] on [donorPcaId] from [donorTeam]:
 * - teams with meaningful pending must still satisfy the fairness floor (non-gym when avoided); or
 * - teams without meaningful pending must not be stripped of all true Step 3 floating slots.
 */
export function donationWouldBreakDonorFairnessFloor(
  state: RankedV2RepairAuditState,
  donorTeam: Team,
  donorPcaId: string,
  slot: Slot
): boolean {
  if (!donorHasTrueStep3Ownership(state, donorTeam, donorPcaId, slot)) return false
  const after = hypotheticalStateAfterDonation(state, donorTeam, donorPcaId, slot)
  if (teamHadMeaningfulPending(state, donorTeam)) {
    return !teamHasFairnessFloorCoverage(after, donorTeam)
  }
  return countTrueStep3FloatingSlotInstances(after, donorTeam) === 0
}

/**
 * Donor would lose all true Step 3 floating coverage on ranked preference slots after donating.
 */
export function donationWouldBreakDonorRankCoverage(
  state: RankedV2RepairAuditState,
  donorTeam: Team,
  donorPcaId: string,
  slot: Slot
): boolean {
  if (!teamHadMeaningfulPending(state, donorTeam)) return false
  if (!donorHasTrueStep3Ownership(state, donorTeam, donorPcaId, slot)) return false
  const pref = state.teamPrefs[donorTeam]
  const rankedSet = new Set(
    pref.rankedSlots.filter((s): s is Slot => isValidSlot(s) && !(pref.avoidGym && pref.gymSlot === s))
  )
  if (rankedSet.size === 0) return false

  const beforeRanked = collectTrueStep3RankedSlotsForTeam(state, donorTeam, rankedSet)
  if (beforeRanked.size === 0) return false

  const after = hypotheticalStateAfterDonation(state, donorTeam, donorPcaId, slot)
  const afterRanked = collectTrueStep3RankedSlotsForTeam(after, donorTeam, rankedSet)
  return afterRanked.size === 0
}

export function teamCanDonateBoundedly(
  state: RankedV2RepairAuditState,
  donorTeam: Team,
  donorPcaId: string,
  slot: Slot
): boolean {
  if (!donorHasTrueStep3Ownership(state, donorTeam, donorPcaId, slot)) return false
  // Do not treat "shedding" a duplicate stacked on the same clock slot as a bounded donation rescue.
  if ((state.trueStep3SlotCountsByTeam[donorTeam].get(slot) ?? 0) > 1) return false
  if (donationWouldBreakDonorFairnessFloor(state, donorTeam, donorPcaId, slot)) return false
  if (donationWouldBreakDonorRankCoverage(state, donorTeam, donorPcaId, slot)) return false
  return true
}

function collectTrueStep3RankedSlotsForTeam(
  state: RankedV2RepairAuditState,
  team: Team,
  rankedSet: Set<Slot>
): Set<Slot> {
  const covered = new Set<Slot>()
  for (const pcaId of state.distinctTrueStep3PcaIdsByTeam[team]) {
    if (!state.floatingPcaIds.has(pcaId)) continue
    for (const s of getTrueStep3TeamSlotsOnPca(state, team, pcaId)) {
      if (rankedSet.has(s)) covered.add(s)
    }
  }
  return covered
}

function cloneAuditStateSkeleton(source: RankedV2RepairAuditState): RankedV2RepairAuditState {
  return {
    ...source,
    floatingPcaIds: new Set(source.floatingPcaIds),
    allocationByStaffId: new Map(source.allocationByStaffId),
    baselineAllocationByStaffId: new Map(source.baselineAllocationByStaffId),
    slotCountsByTeam: createTeamRecord(() => createSlotCountMap()),
    trueStep3SlotCountsByTeam: createTeamRecord(() => createSlotCountMap()),
    assignedSlotsByTeam: createTeamRecord<Slot[]>(() => []),
    trueStep3AssignedSlotsByTeam: createTeamRecord<Slot[]>(() => []),
    distinctPcaIdsByTeam: createTeamRecord<string[]>(() => []),
    distinctTrueStep3PcaIdsByTeam: createTeamRecord<string[]>(() => []),
    initialPendingFTE: { ...source.initialPendingFTE },
    pendingFTE: { ...source.pendingFTE },
    teamPrefs: source.teamPrefs,
  }
}

/**
 * Hypothetical audit state after a direct donation: donor releases [slot] on [donorPcaId] (slot becomes empty on that PCA).
 */
function hypotheticalStateAfterDonation(
  state: RankedV2RepairAuditState,
  donorTeam: Team,
  donorPcaId: string,
  slot: Slot
): RankedV2RepairAuditState {
  const next = cloneAuditStateSkeleton(state)
  const baseAlloc = state.allocationByStaffId.get(donorPcaId)
  if (!baseAlloc) return next
  const edited: PCAAllocation = { ...baseAlloc }
  if (getSlotTeam(edited, slot) !== donorTeam) return next
  if (slot === 1) edited.slot1 = null
  else if (slot === 2) edited.slot2 = null
  else if (slot === 3) edited.slot3 = null
  else edited.slot4 = null

  next.allocationByStaffId.set(donorPcaId, edited)
  recomputeDerivedTeamSlotMaps(next)
  return next
}

function recomputeDerivedTeamSlotMaps(state: RankedV2RepairAuditState): void {
  for (const team of TEAMS) {
    state.slotCountsByTeam[team] = createSlotCountMap()
    state.trueStep3SlotCountsByTeam[team] = createSlotCountMap()
    state.assignedSlotsByTeam[team] = []
    state.trueStep3AssignedSlotsByTeam[team] = []
    state.distinctPcaIdsByTeam[team] = []
    state.distinctTrueStep3PcaIdsByTeam[team] = []
  }

  for (const allocation of state.allocationByStaffId.values()) {
    const baselineAllocation = state.baselineAllocationByStaffId.get(allocation.staff_id)
    for (const slot of VALID_SLOTS) {
      const team = getSlotTeam(allocation, slot)
      if (!team) continue
      state.slotCountsByTeam[team].set(slot, (state.slotCountsByTeam[team].get(slot) ?? 0) + 1)
      state.assignedSlotsByTeam[team].push(slot)
      if (!state.distinctPcaIdsByTeam[team].includes(allocation.staff_id)) {
        state.distinctPcaIdsByTeam[team].push(allocation.staff_id)
        state.distinctPcaIdsByTeam[team].sort((a, b) => a.localeCompare(b))
      }
      if (!state.floatingPcaIds.has(allocation.staff_id)) continue
      if (getSlotTeam(baselineAllocation, slot) === team) continue
      state.trueStep3SlotCountsByTeam[team].set(
        slot,
        (state.trueStep3SlotCountsByTeam[team].get(slot) ?? 0) + 1
      )
      state.trueStep3AssignedSlotsByTeam[team].push(slot)
      if (!state.distinctTrueStep3PcaIdsByTeam[team].includes(allocation.staff_id)) {
        state.distinctTrueStep3PcaIdsByTeam[team].push(allocation.staff_id)
        state.distinctTrueStep3PcaIdsByTeam[team].sort((a, b) => a.localeCompare(b))
      }
    }
  }

  for (const team of TEAMS) {
    state.assignedSlotsByTeam[team].sort((a, b) => a - b)
    state.trueStep3AssignedSlotsByTeam[team].sort((a, b) => a - b)
  }
}

export function detectRankedV2RepairDefects(
  context: DetectRankedV2RepairDefectsContext
): RankedV2RepairDefect[] {
  const state = buildAuditState(context)
  const defects: RankedV2RepairDefect[] = []

  for (const team of state.orderedTeams) {
    if (!teamHadMeaningfulPending(state, team)) continue
    const pendingRounded = roundToNearestQuarterWithMidpoint(state.pendingFTE[team] ?? 0)
    // When remaining pending is already satisfied, only suppress B1 if the user explicitly
    // committed Step 3.2/3.3 floating anchors for that team (draft-only low-rank coverage must
    // still surface B1 for repair).
    if (
      pendingRounded < 0.25 &&
      teamHasCommittedStep3FloatingAnchor(context.committedStep3Anchors, team)
    ) {
      continue
    }
    if (hasRecoverableHigherRankedSlot(state, team)) {
      defects.push({ kind: 'B1', team })
    }
  }

  for (const team of state.orderedTeams) {
    if (hasDuplicateVersusUsefulSlotDefect(state, team)) {
      defects.push({ kind: 'A1', team })
    }
  }

  for (const team of state.orderedTeams) {
    for (const pcaId of getAuditRelevantPcaIds(state, team)) {
      if (isGloballyValuablePcaConsumed(state, team, pcaId)) {
        defects.push({ kind: 'A2', team, pcaId })
      }
    }
  }

  for (const team of state.orderedTeams) {
    if (hasCollapsibleSplitDefect(state, team)) {
      defects.push({ kind: 'C1', team })
    }
  }

  for (const team of state.orderedTeams) {
    if (hasFairnessFloorViolation(state, team)) {
      defects.push({ kind: 'F1', team })
    }
  }

  return defects
}

function buildAuditState(context: DetectRankedV2RepairDefectsContext): AuditState {
  const orderedTeams = getOrderedTeams(context.teamOrder)
  const orderedPcas = [...context.pcaPool].sort((a, b) =>
    String(a.id).localeCompare(String(b.id))
  )
  const floatingPcaIds = new Set(orderedPcas.map((pca) => pca.id))
  const allocationByStaffId = new Map<string, PCAAllocation>()
  const baselineAllocationByStaffId = new Map<string, PCAAllocation>()

  for (const allocation of [...context.allocations].sort((a, b) =>
    String(a.staff_id).localeCompare(String(b.staff_id))
  )) {
    if (!allocationByStaffId.has(allocation.staff_id)) {
      allocationByStaffId.set(allocation.staff_id, allocation)
    }
  }
  for (const allocation of [...(context.baselineAllocations ?? [])].sort((a, b) =>
    String(a.staff_id).localeCompare(String(b.staff_id))
  )) {
    if (!baselineAllocationByStaffId.has(allocation.staff_id)) {
      baselineAllocationByStaffId.set(allocation.staff_id, allocation)
    }
  }

  const slotCountsByTeam = createTeamRecord(() => createSlotCountMap())
  const trueStep3SlotCountsByTeam = createTeamRecord(() => createSlotCountMap())
  const assignedSlotsByTeam = createTeamRecord<Slot[]>(() => [])
  const trueStep3AssignedSlotsByTeam = createTeamRecord<Slot[]>(() => [])
  const distinctPcaIdsByTeam = createTeamRecord<string[]>(() => [])
  const distinctTrueStep3PcaIdsByTeam = createTeamRecord<string[]>(() => [])

  for (const allocation of allocationByStaffId.values()) {
    const baselineAllocation = baselineAllocationByStaffId.get(allocation.staff_id)
    for (const slot of VALID_SLOTS) {
      const team = getSlotTeam(allocation, slot)
      if (!team) continue
      slotCountsByTeam[team].set(slot, (slotCountsByTeam[team].get(slot) ?? 0) + 1)
      assignedSlotsByTeam[team].push(slot)
      if (!distinctPcaIdsByTeam[team].includes(allocation.staff_id)) {
        distinctPcaIdsByTeam[team].push(allocation.staff_id)
        distinctPcaIdsByTeam[team].sort((a, b) => a.localeCompare(b))
      }
      if (!floatingPcaIds.has(allocation.staff_id)) continue
      if (getSlotTeam(baselineAllocation, slot) === team) continue
      trueStep3SlotCountsByTeam[team].set(slot, (trueStep3SlotCountsByTeam[team].get(slot) ?? 0) + 1)
      trueStep3AssignedSlotsByTeam[team].push(slot)
      if (!distinctTrueStep3PcaIdsByTeam[team].includes(allocation.staff_id)) {
        distinctTrueStep3PcaIdsByTeam[team].push(allocation.staff_id)
        distinctTrueStep3PcaIdsByTeam[team].sort((a, b) => a.localeCompare(b))
      }
    }
  }

  for (const team of TEAMS) {
    assignedSlotsByTeam[team].sort((a, b) => a - b)
    trueStep3AssignedSlotsByTeam[team].sort((a, b) => a - b)
  }

  return {
    orderedTeams,
    orderedPcas,
    floatingPcaIds,
    allocationByStaffId,
    baselineAllocationByStaffId,
    slotCountsByTeam,
    trueStep3SlotCountsByTeam,
    assignedSlotsByTeam,
    trueStep3AssignedSlotsByTeam,
    distinctPcaIdsByTeam,
    distinctTrueStep3PcaIdsByTeam,
    initialPendingFTE: { ...context.initialPendingFTE },
    pendingFTE: { ...context.pendingFTE },
    teamPrefs: context.teamPrefs,
  }
}

function getOrderedTeams(teamOrder: Team[]): Team[] {
  const seen = new Set<Team>()
  const ordered: Team[] = []

  for (const team of [...teamOrder, ...TEAMS]) {
    if (seen.has(team)) continue
    seen.add(team)
    ordered.push(team)
  }

  return ordered
}

function createTeamRecord<T>(factory: () => T): Record<Team, T> {
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

function createSlotCountMap(): Map<Slot, number> {
  return new Map<Slot, number>([
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ])
}

function getSlotTeam(allocation: PCAAllocation | undefined, slot: Slot): Team | null {
  if (!allocation) return null
  if (slot === 1) return allocation.slot1
  if (slot === 2) return allocation.slot2
  if (slot === 3) return allocation.slot3
  return allocation.slot4
}

function getNormalizedAvailableSlots(pca: PCAData): Slot[] {
  if (!Array.isArray(pca.availableSlots)) return [...VALID_SLOTS]
  return pca.availableSlots.filter((slot): slot is Slot =>
    slot === 1 || slot === 2 || slot === 3 || slot === 4
  )
}

function getRemainingAssignableSlots(pca: PCAData, allocation: PCAAllocation | undefined): number {
  const remainingFte = allocation?.fte_remaining ?? pca.fte_pca
  return Math.max(0, Math.floor((remainingFte + 1e-9) / 0.25))
}

function getCurrentTeamSlotsOnPca(
  state: AuditState,
  team: Team,
  pcaId: string
): Slot[] {
  const allocation = state.allocationByStaffId.get(pcaId)
  if (!allocation) return []
  return VALID_SLOTS.filter((slot) => getSlotTeam(allocation, slot) === team)
}

function getTrueStep3TeamSlotsOnPca(
  state: AuditState,
  team: Team,
  pcaId: string
): Slot[] {
  const allocation = state.allocationByStaffId.get(pcaId)
  const baselineAllocation = state.baselineAllocationByStaffId.get(pcaId)
  if (!allocation) return []
  return VALID_SLOTS.filter((slot) => {
    if (getSlotTeam(allocation, slot) !== team) return false
    return getSlotTeam(baselineAllocation, slot) !== team
  })
}

function dedupeSlotsPreserveOrder(slots: Slot[]): Slot[] {
  const seen = new Set<Slot>()
  const out: Slot[] = []
  for (const slot of slots) {
    if (seen.has(slot)) continue
    seen.add(slot)
    out.push(slot)
  }
  return out
}

/**
 * Bounded-repair / fairness probe slot order for [team]:
 * non-gym non-duplicate ranked → non-gym non-duplicate unranked → duplicate ranked → duplicate unranked → gym last resort (if configured).
 */
function getRepairSlotOrder(state: AuditState, team: Team): Slot[] {
  const pref = state.teamPrefs[team]
  const rankedNonGym = pref.rankedSlots.filter(
    (slot): slot is Slot => isValidSlot(slot) && !(pref.avoidGym && pref.gymSlot === slot)
  )
  const unrankedNonGym = pref.unrankedNonGymSlots.filter(isValidSlot)
  const dup = (slot: Slot) => (state.trueStep3SlotCountsByTeam[team].get(slot) ?? 0) > 1

  const ordered: Slot[] = [
    ...rankedNonGym.filter((s) => !dup(s)),
    ...unrankedNonGym.filter((s) => !dup(s)),
    ...rankedNonGym.filter((s) => dup(s)),
    ...unrankedNonGym.filter((s) => dup(s)),
  ]
  if (pref.gymSlot != null && isValidSlot(pref.gymSlot)) {
    ordered.push(pref.gymSlot)
  }
  return dedupeSlotsPreserveOrder(ordered)
}

function isValidSlot(value: number): value is Slot {
  return value === 1 || value === 2 || value === 3 || value === 4
}

function getDuplicatedSlots(state: AuditState, team: Team): Slot[] {
  return VALID_SLOTS.filter((slot) => (state.trueStep3SlotCountsByTeam[team].get(slot) ?? 0) > 1)
}

function teamHadMeaningfulPending(state: AuditState, team: Team): boolean {
  return roundToNearestQuarterWithMidpoint(state.initialPendingFTE[team] ?? 0) >= 0.25
}

function teamHasUsefulNonDuplicateSlot(state: AuditState, team: Team): boolean {
  const pref = state.teamPrefs[team]
  for (const pcaId of state.distinctTrueStep3PcaIdsByTeam[team]) {
    if (!state.floatingPcaIds.has(pcaId)) continue
    for (const slot of getTrueStep3TeamSlotsOnPca(state, team, pcaId)) {
      if ((state.trueStep3SlotCountsByTeam[team].get(slot) ?? 0) > 1) continue
      if (pref.avoidGym && pref.gymSlot === slot) continue
      return true
    }
  }
  return false
}

function teamHasFairnessFloorCoverage(state: AuditState, team: Team): boolean {
  const pref = state.teamPrefs[team]
  for (const pcaId of state.distinctTrueStep3PcaIdsByTeam[team]) {
    if (!state.floatingPcaIds.has(pcaId)) continue
    for (const slot of getTrueStep3TeamSlotsOnPca(state, team, pcaId)) {
      if (pref.avoidGym && pref.gymSlot === slot) continue
      return true
    }
  }
  return false
}

function teamHasFloatingCoverageOnSlot(state: AuditState, team: Team, slot: Slot): boolean {
  for (const pcaId of state.distinctPcaIdsByTeam[team]) {
    if (!state.floatingPcaIds.has(pcaId)) continue
    if (getCurrentTeamSlotsOnPca(state, team, pcaId).includes(slot)) {
      return true
    }
  }
  return false
}

function getRelevantRankedSlots(state: AuditState, team: Team): Slot[] {
  const targetSlotCount = Math.max(0, Math.round(((state.initialPendingFTE[team] ?? 0) + 1e-9) / 0.25))
  return state.teamPrefs[team].rankedSlots
    .filter((slot): slot is Slot => isValidSlot(slot))
    .slice(0, targetSlotCount)
}

function getMissingRankedSlots(state: AuditState, team: Team): Slot[] {
  return getRelevantRankedSlots(state, team).filter((slot) => !teamHasFloatingCoverageOnSlot(state, team, slot))
}

function hasRecoverableHigherRankedSlot(state: AuditState, team: Team): boolean {
  for (const slot of getMissingRankedSlots(state, team)) {
    if (canRescueSlotForTeam(state, team, slot)) {
      return true
    }
  }
  return false
}

function canRescueSlotForTeam(state: AuditState, team: Team, slot: Slot): boolean {
  for (const pca of state.orderedPcas) {
    if (!getNormalizedAvailableSlots(pca).includes(slot)) continue

    const allocation = state.allocationByStaffId.get(pca.id)
    const owner = getSlotTeam(allocation, slot)

    if (owner === team) continue
    if (owner == null && getRemainingAssignableSlots(pca, allocation) >= 1) {
      return true
    }
    if (
      owner != null &&
      owner !== team &&
      donorHasTrueStep3Ownership(state, owner, pca.id, slot) &&
      teamCanDonateBoundedly(state, owner, pca.id, slot)
    ) {
      return true
    }
    if (owner != null && canTeamMoveToAlternativeSlot(state, owner, slot)) {
      return true
    }
    if (owner != null && canTeamsSwapSlots(state, team, owner, slot)) {
      return true
    }
  }

  return false
}

function canTeamMoveToAlternativeSlot(
  state: AuditState,
  team: Team,
  blockedSlot: Slot
): boolean {
  const slotOrder = getRepairSlotOrder(state, team).filter((slot) => slot !== blockedSlot)

  for (const slot of slotOrder) {
    for (const pca of state.orderedPcas) {
      if (!getNormalizedAvailableSlots(pca).includes(slot)) continue

      const allocation = state.allocationByStaffId.get(pca.id)
      const owner = getSlotTeam(allocation, slot)
      if (owner != null) continue
      if (getRemainingAssignableSlots(pca, allocation) < 1) continue
      return true
    }
  }

  return false
}

function canTeamsSwapSlots(
  state: AuditState,
  requestingTeam: Team,
  owningTeam: Team,
  targetSlot: Slot
): boolean {
  const requestingAcceptable = getRepairSlotOrder(state, requestingTeam)
  const owningAcceptable = getRepairSlotOrder(state, owningTeam).filter((slot) => slot !== targetSlot)

  if (!requestingAcceptable.includes(targetSlot)) return false
  if ((state.slotCountsByTeam[owningTeam].get(targetSlot) ?? 0) === 0) return false

  for (const requesterSlot of state.assignedSlotsByTeam[requestingTeam]) {
    if (requesterSlot === targetSlot) continue
    if (!owningAcceptable.includes(requesterSlot)) continue
    if ((state.slotCountsByTeam[requestingTeam].get(requesterSlot) ?? 0) === 0) continue
    return true
  }

  return false
}

function hasDuplicateVersusUsefulSlotDefect(state: AuditState, team: Team): boolean {
  const duplicatedSlots = getDuplicatedSlots(state, team)
  if (duplicatedSlots.length === 0) return false

  for (const otherTeam of state.orderedTeams) {
    if (otherTeam === team) continue
    if (!teamHadMeaningfulPending(state, otherTeam)) continue
    // docs/superpowers/plans/2026-04-24-floating-pca-v2-a1-global-duplicate-repair-plan.md — NSM/DRO:
    // clean true Step 3 row but still ≥ 0.25 pending (after quarter round) → do not skip; duplicate relief may apply.
    if (
      teamHasUsefulNonDuplicateSlot(state, otherTeam) &&
      !teamHasMaterialRemainingFloatingPending(state.pendingFTE, otherTeam)
    ) {
      continue
    }
    if (!canAcquireUsefulNonDuplicateSlot(state, otherTeam)) continue
    if (!canDuplicateTeamRescueOtherTeam(state, team, otherTeam, duplicatedSlots)) continue
    return true
  }

  return false
}

function canDuplicateTeamRescueOtherTeam(
  state: AuditState,
  duplicateTeam: Team,
  otherTeam: Team,
  duplicatedSlots: Slot[]
): boolean {
  for (const slot of duplicatedSlots) {
    if (!isUsefulNonDuplicateSlotForTeam(state, otherTeam, slot)) continue

    for (const pcaId of state.distinctTrueStep3PcaIdsByTeam[duplicateTeam]) {
      if (!state.floatingPcaIds.has(pcaId)) continue
      if (!getTrueStep3TeamSlotsOnPca(state, duplicateTeam, pcaId).includes(slot)) continue

      const pca = state.orderedPcas.find((candidate) => candidate.id === pcaId)
      if (!pca) continue
      if (!getNormalizedAvailableSlots(pca).includes(slot)) continue
      return true
    }
  }

  return false
}

function canAcquireDirectlyFromTrueDuplicate(
  state: AuditState,
  team: Team,
  slot: Slot
): boolean {
  if (!isUsefulNonDuplicateSlotForTeam(state, team, slot)) return false

  for (const otherTeam of state.orderedTeams) {
    if (otherTeam === team) continue
    if ((state.trueStep3SlotCountsByTeam[otherTeam].get(slot) ?? 0) < 2) continue

    for (const pcaId of state.distinctTrueStep3PcaIdsByTeam[otherTeam]) {
      if (!getTrueStep3TeamSlotsOnPca(state, otherTeam, pcaId).includes(slot)) continue
      const pca = state.orderedPcas.find((candidate) => candidate.id === pcaId)
      if (!pca) continue
      if (!getNormalizedAvailableSlots(pca).includes(slot)) continue
      return true
    }
  }

  return false
}

function getAuditRelevantPcaIds(state: AuditState, team: Team): string[] {
  const relevant = new Set<string>()

  for (const pcaId of state.distinctTrueStep3PcaIdsByTeam[team]) {
    const teamSlots = getTrueStep3TeamSlotsOnPca(state, team, pcaId)
    const duplicated = teamSlots.some(
      (slot) => (state.trueStep3SlotCountsByTeam[team].get(slot) ?? 0) > 1
    )
    if (duplicated || teamSlots.length > 1) {
      relevant.add(pcaId)
    }
  }

  return [...relevant].sort((a, b) => a.localeCompare(b))
}

function isGloballyValuablePcaConsumed(
  state: AuditState,
  team: Team,
  pcaId: string
): boolean {
  const pca = state.orderedPcas.find((candidate) => candidate.id === pcaId)
  if (!pca) return false

  const supportedSlots = getNormalizedAvailableSlots(pca)

  for (const otherTeam of state.orderedTeams) {
    if (otherTeam === team) continue
    if (!teamHadMeaningfulPending(state, otherTeam)) continue

    const otherPref = state.teamPrefs[otherTeam]
    if (otherPref.preferredPCAIds.includes(pcaId)) {
      return true
    }

    if (getMissingRankedSlots(state, otherTeam).some((slot) => supportedSlots.includes(slot))) {
      return true
    }
  }

  return false
}

function hasCollapsibleSplitDefect(state: AuditState, team: Team): boolean {
  const teamSlots = state.trueStep3AssignedSlotsByTeam[team]
  if (teamSlots.length < 2) return false
  if (state.distinctTrueStep3PcaIdsByTeam[team].length < 2) return false
  if (getDuplicatedSlots(state, team).length > 0) return false

  for (const pca of state.orderedPcas) {
    const currentSlotsOnPca = getTrueStep3TeamSlotsOnPca(state, team, pca.id)
    if (currentSlotsOnPca.length === teamSlots.length) continue
    if (!canPcaHostAllTeamSlots(state, team, pca, teamSlots)) continue
    if (isGloballyValuablePcaConsumed(state, team, pca.id)) continue
    return true
  }

  return false
}

function canPcaHostAllTeamSlots(
  state: AuditState,
  team: Team,
  pca: PCAData,
  teamSlots: Slot[]
): boolean {
  const supportedSlots = getNormalizedAvailableSlots(pca)
  if (!teamSlots.every((slot) => supportedSlots.includes(slot))) {
    return false
  }

  const allocation = state.allocationByStaffId.get(pca.id)
  const currentTeamSlots = getCurrentTeamSlotsOnPca(state, team, pca.id)
  for (const slot of teamSlots) {
    const owner = getSlotTeam(allocation, slot)
    if (owner != null && owner !== team) {
      return false
    }
  }

  return currentTeamSlots.length + getRemainingAssignableSlots(pca, allocation) >= teamSlots.length
}

function hasFairnessFloorViolation(state: AuditState, team: Team): boolean {
  if (!teamHadMeaningfulPending(state, team)) return false
  if (teamHasFairnessFloorCoverage(state, team)) return false
  return canAcquireFairnessFloorCoverage(state, team)
}

function canAcquireFairnessFloorCoverage(state: AuditState, team: Team): boolean {
  const pref = state.teamPrefs[team]
  const fairnessSlots = getRepairSlotOrder(state, team)

  for (const slot of fairnessSlots) {
    if (canRescueSlotForTeam(state, team, slot) || canAcquireDirectlyFromTrueDuplicate(state, team, slot)) {
      return true
    }
  }

  if (pref.avoidGym && pref.gymSlot != null && isValidSlot(pref.gymSlot)) {
    const gymSlot = pref.gymSlot
    if (canRescueSlotForTeam(state, team, gymSlot) || canAcquireDirectlyFromTrueDuplicate(state, team, gymSlot)) {
      return true
    }
  }

  return false
}

function isUsefulNonDuplicateSlotForTeam(state: AuditState, team: Team, slot: Slot): boolean {
  const pref = state.teamPrefs[team]
  if (pref.avoidGym && pref.gymSlot === slot) return false
  if ((state.trueStep3SlotCountsByTeam[team].get(slot) ?? 0) > 0) return false

  const rankedNonGym = pref.rankedSlots.filter(
    (candidate): candidate is Slot => isValidSlot(candidate) && !(pref.avoidGym && pref.gymSlot === candidate)
  )
  const usefulSlots = new Set<Slot>([
    ...rankedNonGym,
    ...pref.unrankedNonGymSlots.filter(isValidSlot),
  ])

  return usefulSlots.has(slot)
}

function canAcquireUsefulNonDuplicateSlot(state: AuditState, team: Team): boolean {
  const pref = state.teamPrefs[team]
  const rankedNonGym = pref.rankedSlots.filter(
    (slot): slot is Slot => isValidSlot(slot) && !(pref.avoidGym && pref.gymSlot === slot)
  )
  const usefulSlots = [...rankedNonGym, ...pref.unrankedNonGymSlots.filter(isValidSlot)]

  for (const slot of usefulSlots) {
    if (canRescueSlotForTeam(state, team, slot) || canAcquireDirectlyFromTrueDuplicate(state, team, slot)) {
      return true
    }
  }

  return false
}

/** Upper bound on generated gym-feasibility patterns per team (existence + repair listing). */
export const MAX_GYM_FEASIBILITY_PROBE_CANDIDATES = 400

export type RankedV2GymFeasibilitySlotUpdate = {
  pcaId: string
  slot: Slot
  fromTeam: Team | null
  toTeam: Team | null
}

type GymFeasibilitySlotUpdate = RankedV2GymFeasibilitySlotUpdate

function cloneAllocationsForGymProbe(allocations: PCAAllocation[]): PCAAllocation[] {
  return allocations.map((allocation) => ({ ...allocation }))
}

function setSlotTeamOnAllocation(allocation: PCAAllocation, slot: Slot, team: Team | null): void {
  if (slot === 1) allocation.slot1 = team
  else if (slot === 2) allocation.slot2 = team
  else if (slot === 3) allocation.slot3 = team
  else allocation.slot4 = team
}

function countAssignedSlotsOnAllocationForGym(allocation: PCAAllocation): number {
  return VALID_SLOTS.filter((slot) => getSlotTeam(allocation, slot) != null).length
}

function updateDerivedAllocationFieldsForGym(allocation: PCAAllocation): void {
  const assigned = countAssignedSlotsOnAllocationForGym(allocation)
  allocation.slot_assigned = assigned * 0.25
  allocation.fte_remaining = Math.max(0, allocation.fte_pca - allocation.slot_assigned)
}

function isAllocationWithinCapacityForGym(allocation: PCAAllocation): boolean {
  return countAssignedSlotsOnAllocationForGym(allocation) * 0.25 <= allocation.fte_pca + 1e-9
}

function getOrCreateAllocationForGymProbe(
  allocations: PCAAllocation[],
  pcaPool: PCAData[],
  pcaId: string
): PCAAllocation | null {
  const existing = allocations.find((allocation) => allocation.staff_id === pcaId)
  if (existing) return existing
  const pca = pcaPool.find((candidate) => candidate.id === pcaId)
  if (!pca) return null
  const created: PCAAllocation = {
    id: `gym-probe-${String(pca.id)}`,
    schedule_id: '',
    staff_id: pca.id,
    team: 'FO',
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

function applyGymFeasibilityUpdates(
  base: PCAAllocation[],
  pcaPool: PCAData[],
  updates: GymFeasibilitySlotUpdate[]
): PCAAllocation[] | null {
  const next = cloneAllocationsForGymProbe(base)
  for (const update of updates) {
    const allocation = getOrCreateAllocationForGymProbe(next, pcaPool, update.pcaId)
    if (!allocation) return null
    if (getSlotTeam(allocation, update.slot) !== update.fromTeam) return null
    setSlotTeamOnAllocation(allocation, update.slot, update.toTeam)
    updateDerivedAllocationFieldsForGym(allocation)
    if (!isAllocationWithinCapacityForGym(allocation)) return null
  }
  return next
}

function committedAnchorsStillHoldForGymProbe(
  allocations: PCAAllocation[],
  anchors?: RankedV2CommittedStep3FloatingAnchor[]
): boolean {
  if (!anchors?.length) return true
  for (const anchor of anchors) {
    const row = allocations.find((allocation) => allocation.staff_id === anchor.pcaId)
    if (getSlotTeam(row, anchor.slot) !== anchor.team) return false
  }
  return true
}

function countAssignedSlotsByTeamForGym(allocations: PCAAllocation[]): Record<Team, number> {
  const counts = createTeamRecord(() => 0)
  for (const allocation of allocations) {
    for (const slot of VALID_SLOTS) {
      const owner = getSlotTeam(allocation, slot)
      if (owner) counts[owner] += 1
    }
  }
  return counts
}

function computePendingFromAllocationsForGymProbe(
  initialPendingFTE: Record<Team, number>,
  baselineAssignedSlots: Record<Team, number>,
  allocations: PCAAllocation[]
): Record<Team, number> {
  const finalAssignedCounts = countAssignedSlotsByTeamForGym(allocations)
  const next = createTeamRecord(() => 0)
  for (const team of TEAMS) {
    const pendingSlotsAtStep34Start = Math.round(((initialPendingFTE[team] ?? 0) + 1e-9) / 0.25)
    const newlyCoveredSlots = finalAssignedCounts[team] - baselineAssignedSlots[team]
    const remainingSlots = Math.max(0, pendingSlotsAtStep34Start - newlyCoveredSlots)
    next[team] = remainingSlots * 0.25
  }
  return next
}

function isTrueStep3FloatingCellForGym(
  allocations: PCAAllocation[],
  baselineByStaffId: Map<string, PCAAllocation | undefined>,
  floatingPcaIds: Set<string>,
  team: Team,
  pcaId: string,
  slot: Slot
): boolean {
  if (!floatingPcaIds.has(pcaId)) return false
  const row = allocations.find((allocation) => allocation.staff_id === pcaId)
  const baseline = baselineByStaffId.get(pcaId)
  if (!row || getSlotTeam(row, slot) !== team) return false
  if (getSlotTeam(baseline, slot) === team) return false
  return true
}

function countGlobalGymLastResortTrueStep3ForGym(
  allocations: PCAAllocation[],
  teamPrefs: Record<Team, TeamPreferenceInfo>,
  baselineByStaffId: Map<string, PCAAllocation | undefined>,
  floatingPcaIds: Set<string>
): number {
  let count = 0
  for (const allocation of allocations) {
    if (!floatingPcaIds.has(allocation.staff_id)) continue
    const baseline = baselineByStaffId.get(allocation.staff_id)
    for (const slot of VALID_SLOTS) {
      const owner = getSlotTeam(allocation, slot)
      if (!owner) continue
      const pref = teamPrefs[owner]
      if (!pref?.avoidGym || pref.gymSlot == null || !isValidSlot(pref.gymSlot)) continue
      if (pref.gymSlot !== slot) continue
      if (getSlotTeam(baseline, slot) === owner) continue
      count += 1
    }
  }
  return count
}

function teamHasTrueStep3OnConfiguredGymSlot(
  allocations: PCAAllocation[],
  baselineByStaffId: Map<string, PCAAllocation | undefined>,
  floatingPcaIds: Set<string>,
  team: Team,
  gymSlot: Slot
): boolean {
  for (const allocation of allocations) {
    if (!floatingPcaIds.has(allocation.staff_id)) continue
    if (isTrueStep3FloatingCellForGym(allocations, baselineByStaffId, floatingPcaIds, team, allocation.staff_id, gymSlot)) {
      return true
    }
  }
  return false
}

function isNonGymSlotForAvoidTeam(teamPrefs: Record<Team, TeamPreferenceInfo>, team: Team, slot: Slot): boolean {
  const pref = teamPrefs[team]
  if (pref.avoidGym && pref.gymSlot === slot) return false
  return true
}

function gymStoryImprovesForTargetTeam(
  beforeAllocations: PCAAllocation[],
  afterAllocations: PCAAllocation[],
  targetTeam: Team,
  teamPrefs: Record<Team, TeamPreferenceInfo>,
  baselineByStaffId: Map<string, PCAAllocation | undefined>,
  floatingPcaIds: Set<string>,
  initialPendingFTE: Record<Team, number>,
  baselineAssignedSlots: Record<Team, number>
): boolean {
  const pref = teamPrefs[targetTeam]
  if (!pref?.avoidGym || pref.gymSlot == null || !isValidSlot(pref.gymSlot)) return false
  const gymSlot = pref.gymSlot

  const onBefore = teamHasTrueStep3OnConfiguredGymSlot(
    beforeAllocations,
    baselineByStaffId,
    floatingPcaIds,
    targetTeam,
    gymSlot
  )
  const onAfter = teamHasTrueStep3OnConfiguredGymSlot(
    afterAllocations,
    baselineByStaffId,
    floatingPcaIds,
    targetTeam,
    gymSlot
  )
  const globalBefore = countGlobalGymLastResortTrueStep3ForGym(
    beforeAllocations,
    teamPrefs,
    baselineByStaffId,
    floatingPcaIds
  )
  const globalAfter = countGlobalGymLastResortTrueStep3ForGym(
    afterAllocations,
    teamPrefs,
    baselineByStaffId,
    floatingPcaIds
  )

  const nextPending = computePendingFromAllocationsForGymProbe(
    initialPendingFTE,
    baselineAssignedSlots,
    afterAllocations
  )
  const targetMeetsPending =
    roundToNearestQuarterWithMidpoint(nextPending[targetTeam] ?? 0) < 0.25

  if (onBefore && !onAfter) return true
  if (onBefore && onAfter) {
    return globalAfter < globalBefore && targetMeetsPending
  }
  return false
}

function requiredRepairDefectsClearForGymProbe(
  ctx: DetectRankedV2RepairDefectsContext,
  nextAllocations: PCAAllocation[],
  nextPendingFTE: Record<Team, number>
): boolean {
  return (
    detectRankedV2RepairDefects({
      teamOrder: ctx.teamOrder,
      initialPendingFTE: ctx.initialPendingFTE,
      pendingFTE: nextPendingFTE,
      allocations: nextAllocations,
      pcaPool: ctx.pcaPool,
      teamPrefs: ctx.teamPrefs,
      baselineAllocations: ctx.baselineAllocations,
      committedStep3Anchors: ctx.committedStep3Anchors,
    }).length === 0
  )
}

function tryGymFeasibilityOutcome(
  beforeAllocations: PCAAllocation[],
  nextAllocations: PCAAllocation[] | null,
  targetTeam: Team,
  ctx: DetectRankedV2GymAvoidableDefectsContext,
  baselineByStaffId: Map<string, PCAAllocation | undefined>,
  floatingPcaIds: Set<string>,
  baselineAssignedSlots: Record<Team, number>
): boolean {
  if (!nextAllocations) return false
  if (!committedAnchorsStillHoldForGymProbe(nextAllocations, ctx.committedStep3Anchors)) return false

  const nextPending = computePendingFromAllocationsForGymProbe(
    ctx.initialPendingFTE,
    baselineAssignedSlots,
    nextAllocations
  )
  if (!requiredRepairDefectsClearForGymProbe(ctx, nextAllocations, nextPending)) return false
  if (
    !gymStoryImprovesForTargetTeam(
      beforeAllocations,
      nextAllocations,
      targetTeam,
      ctx.teamPrefs,
      baselineByStaffId,
      floatingPcaIds,
      ctx.initialPendingFTE,
      baselineAssignedSlots
    )
  ) {
    return false
  }

  return true
}

/** Slot update batch for Part III gym-avoidance repair (same bounded family as G1 feasibility). */
export type RankedV2GymFeasibilityReshuffleBatch = ReadonlyArray<RankedV2GymFeasibilitySlotUpdate>

function forEachRankedV2GymFeasibilityValidBatch(
  ctx: DetectRankedV2GymAvoidableDefectsContext,
  targetTeam: Team,
  auditState: RankedV2RepairAuditState,
  onValidBatch: (updates: GymFeasibilitySlotUpdate[]) => boolean
): boolean {
  const beforeAllocations = ctx.allocations
  const baselineRows = ctx.baselineAllocations ?? []
  const baselineByStaffId = new Map<string, PCAAllocation | undefined>()
  for (const row of baselineRows) {
    baselineByStaffId.set(row.staff_id, row)
  }
  const floatingPcaIds = new Set(auditState.orderedPcas.map((pca) => pca.id))
  const baselineAssignedSlots = countAssignedSlotsByTeamForGym(baselineRows)

  let generated = 0

  const probeValid = (updates: GymFeasibilitySlotUpdate[]): boolean => {
    if (generated >= MAX_GYM_FEASIBILITY_PROBE_CANDIDATES) return false
    generated += 1
    const next = applyGymFeasibilityUpdates(beforeAllocations, ctx.pcaPool, updates)
    if (
      !tryGymFeasibilityOutcome(
        beforeAllocations,
        next,
        targetTeam,
        ctx,
        baselineByStaffId,
        floatingPcaIds,
        baselineAssignedSlots
      )
    ) {
      return false
    }
    return onValidBatch(updates)
  }

  const pref = ctx.teamPrefs[targetTeam]
  const gymSlot = pref.gymSlot
  if (gymSlot == null || !isValidSlot(gymSlot)) return false

  /** Same tiering as bounded repair (non-dup ranked → …) but only non-gym destinations for gym shuffle. */
  const gymShuffleSlotOrder = getRepairSlotOrder(auditState, targetTeam).filter(
    (slot) => slot !== gymSlot && isNonGymSlotForAvoidTeam(ctx.teamPrefs, targetTeam, slot)
  )

  const sortedPcaIds = [...auditState.orderedPcas]
    .map((pca) => pca.id)
    .sort((a, b) => String(a).localeCompare(String(b)))

  for (const pcaId of sortedPcaIds) {
    if (
      !isTrueStep3FloatingCellForGym(
        beforeAllocations,
        baselineByStaffId,
        floatingPcaIds,
        targetTeam,
        pcaId,
        gymSlot
      )
    ) {
      continue
    }

    const pcaData = auditState.orderedPcas.find((p) => p.id === pcaId)
    if (!pcaData) continue
    const supported = getNormalizedAvailableSlots(pcaData)

    for (const destSlot of gymShuffleSlotOrder) {
      if (!supported.includes(destSlot)) continue

      const destRow = beforeAllocations.find((a) => a.staff_id === pcaId)
      if (!destRow || getSlotTeam(destRow, destSlot) != null) continue

      if (
        probeValid([
          { pcaId, slot: gymSlot, fromTeam: targetTeam, toTeam: null },
          { pcaId, slot: destSlot, fromTeam: null, toTeam: targetTeam },
        ])
      ) {
        return true
      }
    }
  }

  for (const pcaId of sortedPcaIds) {
    if (
      !isTrueStep3FloatingCellForGym(
        beforeAllocations,
        baselineByStaffId,
        floatingPcaIds,
        targetTeam,
        pcaId,
        gymSlot
      )
    ) {
      continue
    }

    const pcaData = auditState.orderedPcas.find((p) => p.id === pcaId)
    if (!pcaData) continue
    const supported = getNormalizedAvailableSlots(pcaData)
    const row = beforeAllocations.find((a) => a.staff_id === pcaId)
    if (!row) continue

    for (const otherSlot of gymShuffleSlotOrder) {
      if (!supported.includes(otherSlot) || !supported.includes(gymSlot)) continue

      const ownerOther = getSlotTeam(row, otherSlot)
      if (!ownerOther || ownerOther === targetTeam) continue
      if (
        !isTrueStep3FloatingCellForGym(
          beforeAllocations,
          baselineByStaffId,
          floatingPcaIds,
          ownerOther,
          pcaId,
          otherSlot
        )
      ) {
        continue
      }

      if (
        probeValid([
          { pcaId, slot: gymSlot, fromTeam: targetTeam, toTeam: ownerOther },
          { pcaId, slot: otherSlot, fromTeam: ownerOther, toTeam: targetTeam },
        ])
      ) {
        return true
      }
    }
  }

  for (const pcaA of sortedPcaIds) {
    if (
      !isTrueStep3FloatingCellForGym(
        beforeAllocations,
        baselineByStaffId,
        floatingPcaIds,
        targetTeam,
        pcaA,
        gymSlot
      )
    ) {
      continue
    }

    const rowA = beforeAllocations.find((a) => a.staff_id === pcaA)
    const pcaDataA = auditState.orderedPcas.find((p) => p.id === pcaA)
    if (!rowA || !pcaDataA) continue
    if (!getNormalizedAvailableSlots(pcaDataA).includes(gymSlot)) continue

    for (const pcaB of sortedPcaIds) {
      if (pcaA === pcaB) continue
      const rowB = beforeAllocations.find((a) => a.staff_id === pcaB)
      const pcaDataB = auditState.orderedPcas.find((p) => p.id === pcaB)
      if (!rowB || !pcaDataB) continue

      for (const slotB of gymShuffleSlotOrder) {
        const ownerB = getSlotTeam(rowB, slotB)
        if (!ownerB || ownerB === targetTeam) continue
        if (
          !isTrueStep3FloatingCellForGym(
            beforeAllocations,
            baselineByStaffId,
            floatingPcaIds,
            ownerB,
            pcaB,
            slotB
          )
        ) {
          continue
        }
        if (!getNormalizedAvailableSlots(pcaDataB).includes(slotB)) continue

        if (
          probeValid([
            { pcaId: pcaA, slot: gymSlot, fromTeam: targetTeam, toTeam: ownerB },
            { pcaId: pcaB, slot: slotB, fromTeam: ownerB, toTeam: targetTeam },
          ])
        ) {
          return true
        }
      }
    }
  }

  for (const pcaId of sortedPcaIds) {
    if (
      !donorHasTrueStep3Ownership(auditState, targetTeam, pcaId, gymSlot) ||
      !teamCanDonateBoundedly(auditState, targetTeam, pcaId, gymSlot)
    ) {
      continue
    }

    for (const recipient of TEAMS) {
      if (recipient === targetTeam) continue
      if (probeValid([{ pcaId, slot: gymSlot, fromTeam: targetTeam, toTeam: recipient }])) {
        return true
      }
    }
  }

  return false
}

/**
 * Lists update batches that satisfy Part III feasibility (anchors, required-repair clear, gym story)
 * in the same enumeration order as `detectRankedV2GymAvoidableDefects` feasibility.
 */
export function listRankedV2GymFeasibilityValidReshuffleBatches(
  ctx: DetectRankedV2GymAvoidableDefectsContext,
  targetTeam: Team,
  maxBatches: number
): RankedV2GymFeasibilitySlotUpdate[][] {
  const auditState = buildAuditState(ctx)
  const out: RankedV2GymFeasibilitySlotUpdate[][] = []
  forEachRankedV2GymFeasibilityValidBatch(ctx, targetTeam, auditState, (updates) => {
    out.push([...updates])
    return out.length >= maxBatches
  })
  return out
}

/** Lexicographic gym-only outcome comparison for Part III repair candidate selection (lower is better). */
export function compareRankedV2GymAvoidanceRepairOutcomes(
  a: { targetOffGym: boolean; globalGymLastResort: number; sortKey: string },
  b: { targetOffGym: boolean; globalGymLastResort: number; sortKey: string }
): number {
  if (a.targetOffGym !== b.targetOffGym) {
    return a.targetOffGym ? -1 : 1
  }
  if (a.globalGymLastResort !== b.globalGymLastResort) {
    return a.globalGymLastResort - b.globalGymLastResort
  }
  return a.sortKey.localeCompare(b.sortKey)
}

export function gymFeasibilityBatchSortKey(
  targetTeam: Team,
  updates: ReadonlyArray<RankedV2GymFeasibilitySlotUpdate>
): string {
  return `g1:${targetTeam}:${updates
    .map((u) => `${u.pcaId}:${u.slot}:${String(u.fromTeam)}->${String(u.toTeam)}`)
    .join('|')}`
}

/** Gym-only scoring keys for Part III repair candidate ordering (lower global / off-gym preferred). */
export function getRankedV2GymAvoidanceRepairOutcomeMetrics(
  allocations: PCAAllocation[],
  targetTeam: Team,
  ctx: Pick<DetectRankedV2GymAvoidableDefectsContext, 'teamPrefs' | 'baselineAllocations' | 'pcaPool'>
): { targetOnConfiguredGym: boolean; globalGymLastResortCount: number } {
  const baselineRows = ctx.baselineAllocations ?? []
  const baselineByStaffId = new Map<string, PCAAllocation | undefined>()
  for (const row of baselineRows) {
    baselineByStaffId.set(row.staff_id, row)
  }
  const floatingPcaIds = new Set(ctx.pcaPool.map((pca) => pca.id))
  const pref = ctx.teamPrefs[targetTeam]
  const gymSlot = pref?.gymSlot
  const targetOnConfiguredGym =
    gymSlot != null && isValidSlot(gymSlot)
      ? teamHasTrueStep3OnConfiguredGymSlot(
          allocations,
          baselineByStaffId,
          floatingPcaIds,
          targetTeam,
          gymSlot
        )
      : false
  return {
    targetOnConfiguredGym,
    globalGymLastResortCount: countGlobalGymLastResortTrueStep3ForGym(
      allocations,
      ctx.teamPrefs,
      baselineByStaffId,
      floatingPcaIds
    ),
  }
}

function enumerateFeasibleNonGymReshuffleExists(
  ctx: DetectRankedV2GymAvoidableDefectsContext,
  targetTeam: Team,
  auditState: RankedV2RepairAuditState
): boolean {
  return forEachRankedV2GymFeasibilityValidBatch(ctx, targetTeam, auditState, () => true)
}

/**
 * Part III (`G1`) — teams with avoid-gym on a configured gym clock slot, Step-3–owned floating
 * on that slot, and a feasible bounded reshuffle (swap / bounded safe donation / sway) that
 * keeps committed Step 3.2/3.3 anchors when provided, clears required repair defects, and improves
 * the gym story for the target team per `gymStoryImprovesForTargetTeam`.
 *
 * Not used by `detectOptionalRankedPromotionOpportunities` / required-repair gates (Constraint 6e).
 */
export function detectRankedV2GymAvoidableDefects(
  ctx: DetectRankedV2GymAvoidableDefectsContext
): RankedV2RepairDefect[] {
  const auditState = buildAuditState(ctx)
  const defects: RankedV2RepairDefect[] = []

  for (const team of auditState.orderedTeams) {
    const pref = auditState.teamPrefs[team]
    if (!pref?.avoidGym || pref.gymSlot == null || !isValidSlot(pref.gymSlot)) continue

    const gymSlot = pref.gymSlot
    const baselineRows = ctx.baselineAllocations ?? []
    const baselineByStaffId = new Map<string, PCAAllocation | undefined>()
    for (const row of baselineRows) {
      baselineByStaffId.set(row.staff_id, row)
    }
    const floatingPcaIds = new Set(auditState.orderedPcas.map((pca) => pca.id))

    if (
      !teamHasTrueStep3OnConfiguredGymSlot(
        ctx.allocations,
        baselineByStaffId,
        floatingPcaIds,
        team,
        gymSlot
      )
    ) {
      continue
    }

    if (enumerateFeasibleNonGymReshuffleExists(ctx, team, auditState)) {
      defects.push({ kind: 'G1', team })
    }
  }

  return defects
}
