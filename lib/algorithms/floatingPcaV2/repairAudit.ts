import type { Team } from '@/types/staff'
import type { PCAAllocation } from '@/types/schedule'
import type { PCAData } from '@/lib/algorithms/pcaAllocationTypes'
import { TEAMS, type TeamPreferenceInfo } from '@/lib/utils/floatingPCAHelpers'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'

type Slot = 1 | 2 | 3 | 4

const VALID_SLOTS: Slot[] = [1, 2, 3, 4]

export type RankedV2RepairDefect =
  | { kind: 'B1'; team: Team }
  | { kind: 'A1'; team: Team }
  | { kind: 'A2'; team: Team; pcaId: string }
  | { kind: 'C1'; team: Team }
  | { kind: 'F1'; team: Team }

/** Optional ranked promotion opportunity (Constraint 5 — not a B1 defect). */
export type RankedV2OptionalPromotionOpportunity = { kind: 'P1'; team: Team }

export type DetectRankedV2RepairDefectsContext = {
  teamOrder: Team[]
  initialPendingFTE: Record<Team, number>
  pendingFTE: Record<Team, number>
  allocations: PCAAllocation[]
  pcaPool: PCAData[]
  teamPrefs: Record<Team, TeamPreferenceInfo>
  baselineAllocations?: PCAAllocation[]
}

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

  // #region agent log (H1) FO multi-rank defect snapshot
  if (state.teamPrefs.FO.rankedSlots.length > 1) {
    const rankedSlots = state.teamPrefs.FO.rankedSlots.filter((slot): slot is Slot => isValidSlot(slot))
    const coveredRankedSlots = rankedSlots.filter((slot) => teamHasFloatingCoverageOnSlot(state, 'FO', slot))
    const missingRankedSlots = getMissingRankedSlots(state, 'FO')
    const initialTargetSlots = Math.round(((state.initialPendingFTE.FO ?? 0) + 1e-9) / 0.25)
    const firstCoveredRank = rankedSlots.findIndex((slot) => coveredRankedSlots.includes(slot))
    const coveredHigherRankSlots = rankedSlots.slice(0, Math.max(firstCoveredRank, 0))
    ;(typeof fetch === 'function'
      ? fetch('http://127.0.0.1:7321/ingest/76ac89bc-8813-496d-9eb0-551725b988b5', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '9381e2' },
          body: JSON.stringify({
            sessionId: '9381e2',
            runId: 'fo-4-3-investigation',
            hypothesisId: 'H1',
            location: 'lib/algorithms/floatingPcaV2/repairAudit.ts:detectRankedV2RepairDefects',
            message: 'FO multi-rank B1 defect snapshot',
            data: {
              team: 'FO',
              initialPendingFTE: state.initialPendingFTE.FO ?? null,
              pendingFTE: state.pendingFTE.FO ?? null,
              initialTargetSlots,
              rankedSlots,
              coveredRankedSlots,
              missingRankedSlots,
              recoverableMissingRankedSlots: missingRankedSlots.map((slot) => ({
                slot,
                canRescue: canRescueSlotForTeam(state, 'FO', slot),
              })),
              assignedSlots: state.assignedSlotsByTeam.FO,
              trueStep3AssignedSlots: state.trueStep3AssignedSlotsByTeam.FO,
              alreadyHasLowerRankedCoverageWhileHigherMissing:
                coveredRankedSlots.length > 0 && coveredHigherRankSlots.some((slot) => missingRankedSlots.includes(slot)),
              wouldTriggerB1: missingRankedSlots.some((slot) => canRescueSlotForTeam(state, 'FO', slot)),
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
      : Promise.resolve())
  }
  // #endregion

  for (const team of state.orderedTeams) {
    if (!teamHadMeaningfulPending(state, team)) continue
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

function getRepairSlotOrder(pref: TeamPreferenceInfo): Slot[] {
  const rankedNonGym = pref.rankedSlots.filter(
    (slot): slot is Slot => isValidSlot(slot) && !(pref.avoidGym && pref.gymSlot === slot)
  )
  const unrankedNonGym = pref.unrankedNonGymSlots.filter(isValidSlot)
  const gymLastResort =
    pref.gymSlot != null && isValidSlot(pref.gymSlot) ? [pref.gymSlot] : []

  return [...rankedNonGym, ...unrankedNonGym, ...gymLastResort]
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
  const pref = state.teamPrefs[team]
  const slotOrder = getRepairSlotOrder(pref).filter((slot) => slot !== blockedSlot)

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
  const requestingPref = state.teamPrefs[requestingTeam]
  const owningPref = state.teamPrefs[owningTeam]

  const requestingAcceptable = getRepairSlotOrder(requestingPref)
  const owningAcceptable = getRepairSlotOrder(owningPref).filter((slot) => slot !== targetSlot)

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
    if (teamHasUsefulNonDuplicateSlot(state, otherTeam)) continue
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
  const fairnessSlots = getRepairSlotOrder(pref)

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
