/**
 * Step 3.4 Floating PCA allocation algorithm.
 * Submodule of the PCA allocation pipeline.
 */

import type { Team } from '@/types/staff'
import type { AllocationTracker, PCAAllocation } from '@/types/schedule'
import type { PCAPreference, SpecialProgram } from '@/types/allocation'
import type { PCAData } from './pcaAllocationTypes'
import {
  TEAMS,
  createEmptyTracker,
  recordAssignment,
  finalizeTrackerSummary,
  buildPreferredPCAMap,
  getTeamPreferenceInfo,
  findAvailablePCAs,
  getOrCreateAllocation,
  getTeamExistingSlots,
  assignOneSlotAndUpdatePending,
  assignUpToPendingAndUpdatePending,
  assignSlotsToTeam,
  getAvailableSlotsForTeam,
  assignSlotIfValid,
  isFloorPCAForTeam,
  getTeamSlotsFromAllocation,
  type TeamPreferenceInfo,
} from '@/lib/utils/floatingPCAHelpers'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'

export type FloatingPCAAllocationMode = 'standard' | 'balanced'

/**
 * Context for the revised floating PCA allocation algorithm v2.
 */
export interface FloatingPCAAllocationContextV2 {
  teamOrder: Team[]  // User-defined team priority order from Step 3.1
  currentPendingFTE: Record<Team, number>  // Updated pending FTE from Step 3.2/3.3
  existingAllocations: PCAAllocation[]  // Allocations from Step 2, 3.2, 3.3
  pcaPool: PCAData[]  // All floating PCAs
  pcaPreferences: PCAPreference[]  // Team preferences
  specialPrograms: SpecialProgram[]  // Special programs (for context only)
  mode?: FloatingPCAAllocationMode // Step 3.4 allocation mode
  /**
   * Optional: after ALL pending requirements are fulfilled, continue assigning remaining PCA slots
   * as "extra coverage" using a deterministic policy.
   */
  extraCoverageMode?: 'none' | 'round-robin-team-order'
  /**
   * Preference handling policy for Step 3.4 Standard mode:
   * - 'legacy': use DB preferences directly (historical behavior)
   * - 'selected_only': only selected Step 3.2 picks are treated as active preferences
   */
  preferenceSelectionMode?: 'legacy' | 'selected_only'
  /**
   * How strict to protect selected preferred PCAs in Step 3.4 Standard mode.
   * - 'exclusive': selected PCA is protected from other teams (whole-PCA lock)
   * - 'share': selected slot stays with the team, but remaining PCA slots are shareable
   */
  preferenceProtectionMode?: 'exclusive' | 'share'
  /**
   * User-selected Step 3.2/3.3 assignments. Used when preferenceSelectionMode='selected_only'.
   * Only Step 3.2 selections participate in Step 3.4 "preferred" protection.
   */
  selectedPreferenceAssignments?: Array<{
    team: Team
    slot: number
    pcaId: string
    source?: 'step32' | 'step33'
  }>
}

/**
 * Result of the revised floating PCA allocation algorithm v2.
 */
export interface FloatingPCAAllocationResultV2 {
  allocations: PCAAllocation[]
  pendingPCAFTEPerTeam: Record<Team, number>
  tracker: AllocationTracker
  /** Which slots were assigned as "extra coverage" (display-only marker; persisted via staffOverrides). */
  extraCoverageByStaffId?: Record<string, Array<1 | 2 | 3 | 4>>
  errors?: {
    preferredSlotUnassigned?: string[]
  }
}

function buildSelectionDrivenPreferences(
  basePreferences: PCAPreference[],
  selectedAssignments: Array<{ team: Team; pcaId: string }>
): PCAPreference[] {
  const baseByTeam = new Map<Team, PCAPreference>()
  for (const pref of basePreferences) {
    if (!baseByTeam.has(pref.team)) {
      baseByTeam.set(pref.team, pref)
    }
  }

  const selectedPcaByTeam = new Map<Team, Set<string>>()
  for (const assignment of selectedAssignments) {
    const existing = selectedPcaByTeam.get(assignment.team) ?? new Set<string>()
    existing.add(assignment.pcaId)
    selectedPcaByTeam.set(assignment.team, existing)
  }

  return TEAMS.map((team) => {
    const base = baseByTeam.get(team)
    const selectedPcaIds = Array.from(selectedPcaByTeam.get(team) ?? new Set<string>())
    return {
      ...(base ?? {
        id: `__effective_pref_${team}`,
        team,
      }),
      team,
      preferred_pca_ids: selectedPcaIds,
      // Selection-driven mode treats manual picks as the source of truth.
      // Preferred slots were already assigned in Step 3.2/3.3 if selected.
      preferred_slots: [],
    }
  })
}

/**
 * Legacy allocator core shared by V1/V2 wrappers during migration.
 * Current behavior is still the condition/cycle-based implementation.
 */
async function allocateFloatingPCAClassic(
  context: FloatingPCAAllocationContextV2
): Promise<FloatingPCAAllocationResultV2> {
  const {
    mode = 'standard',
    teamOrder,
    currentPendingFTE: initialPendingFTE,
    existingAllocations,
    pcaPool,
    pcaPreferences,
    extraCoverageMode = 'none',
    preferenceSelectionMode = 'legacy',
    preferenceProtectionMode = 'exclusive',
    selectedPreferenceAssignments = [],
  } = context

  // Clone allocations and pending FTE to avoid mutating originals
  const allocations = existingAllocations.map(a => ({ ...a }))
  const pendingFTE = { ...initialPendingFTE }
  const extraCoverageByStaffId: Record<string, Array<1 | 2 | 3 | 4>> = {}

  // Hot-path index for repeated allocation lookup by staff ID.
  let allocationIndexSize = -1
  let allocationByStaffId = new Map<string, PCAAllocation>()
  const getAllocationByStaffId = (staffId: string): PCAAllocation | undefined => {
    if (allocationIndexSize !== allocations.length) {
      const next = new Map<string, PCAAllocation>()
      allocations.forEach((allocation) => {
        if (!next.has(allocation.staff_id)) {
          next.set(allocation.staff_id, allocation)
        }
      })
      allocationByStaffId = next
      allocationIndexSize = allocations.length
    }
    return allocationByStaffId.get(staffId)
  }

  // Initialize tracker
  const tracker = createEmptyTracker()
  // Stamp mode for UI display (even if a team gets 0 slots in Step 3).
  for (const team of TEAMS) {
    tracker[team].summary.allocationMode = mode
  }
  
  // Track allocation order (1st, 2nd, etc.) - based on team order from Step 3.1, not chronological assignment
  // Build a map from team to its position in teamOrder (1-based)
  const allocationOrderMap = new Map<Team, number>()
  teamOrder.forEach((team, index) => {
    allocationOrderMap.set(team, index + 1) // 1-based: 1st, 2nd, 3rd, etc.
  })
  
  // Helper to record assignment with allocation order tracking
  const recordAssignmentWithOrder = (team: Team, log: Parameters<typeof recordAssignment>[2]) => {
    // Get allocation order from teamOrder position (not chronological)
    const order = allocationOrderMap.get(team)!
    
    // Add allocation order to log
    recordAssignment(tracker, team, {
      ...log,
      allocationOrder: order,
    })
  }
  
  // Track errors
  const errors: { preferredSlotUnassigned?: string[] } = {}
  
  const useSelectionDrivenPreferences = mode === 'standard' && preferenceSelectionMode === 'selected_only'
  const selectedStep32Assignments = selectedPreferenceAssignments.filter(
    (assignment) => assignment.source !== 'step33'
  )
  const effectivePreferences = useSelectionDrivenPreferences
    ? buildSelectionDrivenPreferences(
        pcaPreferences,
        selectedStep32Assignments.map((a) => ({ team: a.team, pcaId: a.pcaId }))
      )
    : pcaPreferences

  const buildProtectedPCAMap = (): Map<string, Team[]> => {
    if (!useSelectionDrivenPreferences) {
      return buildPreferredPCAMap(effectivePreferences, pendingFTE)
    }

    if (preferenceProtectionMode !== 'exclusive') {
      return new Map<string, Team[]>()
    }

    const map = new Map<string, Team[]>()
    for (const assignment of selectedStep32Assignments) {
      if ((pendingFTE[assignment.team] ?? 0) <= 0) continue
      const teams = map.get(assignment.pcaId) ?? []
      if (!teams.includes(assignment.team)) {
        teams.push(assignment.team)
      }
      map.set(assignment.pcaId, teams)
    }
    return map
  }

  // Build preference maps
  const preferredPCAMap = buildProtectedPCAMap()
  
  // Get team preference info for all teams
  const teamPrefs: Record<Team, TeamPreferenceInfo> = {} as Record<Team, TeamPreferenceInfo>
  for (const team of TEAMS) {
    teamPrefs[team] = getTeamPreferenceInfo(team, effectivePreferences)
  }

  const applyExtraCoverageRoundRobin = () => {
    if (extraCoverageMode !== 'round-robin-team-order') return

    // Only start extra coverage once ALL teams are satisfied at slot granularity.
    const allSatisfied = TEAMS.every((t) => (pendingFTE[t] ?? 0) < 0.25)
    if (!allSatisfied) return

    const zeroPending: Record<Team, number> = {} as any
    TEAMS.forEach((t) => (zeroPending[t] = 0))

    const preferredOfOtherTeams = new Map<string, Team[]>() // none; extra coverage ignores preferred reservations

    let madeProgress = true
    while (madeProgress) {
      madeProgress = false

      for (const team of teamOrder) {
        const pref = teamPrefs[team]
        const candidates = findAvailablePCAs({
          pcaPool,
          team,
          teamFloor: pref.teamFloor,
          floorMatch: 'any',
          excludePreferredOfOtherTeams: false,
          preferredPCAIdsOfOtherTeams: preferredOfOtherTeams,
          pendingFTEPerTeam: zeroPending,
          existingAllocations: allocations,
          gymSlot: pref.gymSlot ?? null,
          avoidGym: pref.avoidGym ?? false,
        })

        if (candidates.length === 0) continue

        // Deterministic tie-break: fte remaining desc, then staff id asc.
        const sorted = [...candidates].sort((a, b) => {
          const aAlloc = getAllocationByStaffId(a.id)
          const bAlloc = getAllocationByStaffId(b.id)
          const aFte = (aAlloc?.fte_remaining ?? a.fte_pca) as number
          const bFte = (bAlloc?.fte_remaining ?? b.fte_pca) as number
          if (bFte !== aFte) return bFte - aFte
          return String(a.id).localeCompare(String(b.id))
        })
        const pca = sorted[0]

        const allocation = getOrCreateAllocation(
          pca.id,
          pca.name,
          pca.fte_pca,
          pca.leave_type,
          team,
          allocations
        )

        const teamExistingSlots = getTeamExistingSlots(team, allocations)
        const res = assignSlotsToTeam({
          pca,
          allocation,
          team,
          pendingFTE: 0.25,
          teamExistingSlots,
          gymSlot: pref.gymSlot ?? null,
          avoidGym: pref.avoidGym ?? false,
        })

        if (res.slotsAssigned.length === 0) continue

        madeProgress = true

        for (const slot of res.slotsAssigned) {
          if (slot === 1 || slot === 2 || slot === 3 || slot === 4) {
            const list = extraCoverageByStaffId[pca.id] ?? []
            list.push(slot)
            extraCoverageByStaffId[pca.id] = list
          }

          recordAssignment(tracker, team, {
            slot,
            pcaId: pca.id,
            pcaName: pca.name,
            assignedIn: 'step34',
            cycle: 3,
            assignmentTag: 'extra',
            wasFloorPCA: isFloorPCAForTeam(pca as any, pref.teamFloor),
          })
        }
      }
    }
  }

  // Helper to check if allocation is complete
  const isAllocationComplete = () => {
    // Check if all teams have pendingFTE = 0
    const allTeamsSatisfied = TEAMS.every(t => pendingFTE[t] <= 0)
    if (allTeamsSatisfied) return true
    
    // Check if all PCAs have no available slots
    const anyPCAHasSlots = pcaPool.some(pca => {
      if (pca.fte_pca <= 0) return false
      const alloc = getAllocationByStaffId(pca.id)
      if (!alloc) return true // No allocation yet, has slots
      return alloc.fte_remaining > 0
    })
    
    return !anyPCAHasSlots
  }

  // ========================================================================
  // MODE: Balanced (take-turns, one slot per team per pass)
  // ========================================================================
  if (mode === 'balanced') {
    await allocateFloatingPCA_balanced({
      teamOrder,
      allocations,
      pendingFTE,
      pcaPool,
      pcaPreferences,
      teamPrefs,
      preferredPCAMap,
      tracker,
      recordAssignmentWithOrder,
      isAllocationComplete,
    })

    applyExtraCoverageRoundRobin()
    applyInvalidSlotPairingForDisplay(allocations, pcaPool)
    for (const team of TEAMS) {
      tracker[team].summary.pendingMet = roundToNearestQuarterWithMidpoint(pendingFTE[team] ?? 0) < 0.25
    }
    finalizeTrackerSummary(tracker)

    return {
      allocations,
      pendingPCAFTEPerTeam: pendingFTE,
      tracker,
      extraCoverageByStaffId: Object.keys(extraCoverageByStaffId).length > 0 ? extraCoverageByStaffId : undefined,
      errors: undefined,
    }
  }

  // ========================================================================
  // CYCLE 1: Team-centric with preference priority
  // ========================================================================
  
  // Sort teams by pendingFTE (descending)
  const cycle1Teams = [...teamOrder].sort((a, b) => pendingFTE[b] - pendingFTE[a])
  
  for (const team of cycle1Teams) {
    if (pendingFTE[team] <= 0) continue
    if (isAllocationComplete()) break
    
    const pref = teamPrefs[team]
    
    
    // Process based on condition
    switch (pref.condition) {
      case 'A':
        // Condition A: Preferred PCA + Preferred Slot
        await processConditionA(
          team,
          pref,
          allocations,
          pendingFTE,
          pcaPool,
          effectivePreferences,
          buildProtectedPCAMap(),
          tracker,
          errors,
          recordAssignmentWithOrder,
          buildProtectedPCAMap
        )
        break
      case 'B':
        // Condition B: Preferred Slot only
        await processConditionB(
          team,
          pref,
          allocations,
          pendingFTE,
          pcaPool,
          effectivePreferences,
          buildProtectedPCAMap(),
          tracker,
          errors,
          recordAssignmentWithOrder,
          buildProtectedPCAMap
        )
        break
      case 'C':
        // Condition C: Preferred PCA only
        await processConditionC(
          team,
          pref,
          allocations,
          pendingFTE,
          pcaPool,
          effectivePreferences,
          buildProtectedPCAMap(),
          tracker,
          recordAssignmentWithOrder,
          buildProtectedPCAMap
        )
        break
      case 'D':
        // Condition D: No preferences
        await processConditionD(
          team,
          pref,
          allocations,
          pendingFTE,
          pcaPool,
          effectivePreferences,
          buildProtectedPCAMap(),
          tracker,
          recordAssignmentWithOrder,
          buildProtectedPCAMap
        )
        break
    }
    
  }
  
  // ========================================================================
  // CYCLE 2: Fallback with lifted restrictions
  // ========================================================================
  
  if (!isAllocationComplete()) {
    // Re-sort teams by pendingFTE
    const cycle2Teams = [...teamOrder].sort((a, b) => pendingFTE[b] - pendingFTE[a])
    
    // Phase 2a: Floor PCA (restrictions lifted - allow preferred of other teams)
    for (const team of cycle2Teams) {
      if (pendingFTE[team] <= 0) continue
      if (isAllocationComplete()) break
      
      const pref = teamPrefs[team]
      await processFloorPCAFallback(
        team,
        pref,
        allocations,
        pendingFTE,
        pcaPool,
        effectivePreferences,
        tracker,
        2,
        recordAssignmentWithOrder,
        undefined,
        buildProtectedPCAMap
      )
    }
    
    // Phase 2b: Non-Floor PCA
    if (!isAllocationComplete()) {
      const cycle2bTeams = [...teamOrder].sort((a, b) => pendingFTE[b] - pendingFTE[a])
      
      for (const team of cycle2bTeams) {
        if (pendingFTE[team] <= 0) continue
        if (isAllocationComplete()) break
        
        const pref = teamPrefs[team]
        await processNonFloorPCAFallback(
          team,
          pref,
          allocations,
          pendingFTE,
          pcaPool,
          effectivePreferences,
          tracker,
          recordAssignmentWithOrder,
          buildProtectedPCAMap
        )
      }
    }
  }
  
  // ========================================================================
  // CYCLE 3: PCA-centric cleanup
  // ========================================================================
  
  if (!isAllocationComplete()) {
    await processCycle3Cleanup(allocations, pendingFTE, pcaPool, pcaPreferences, teamPrefs, tracker, recordAssignmentWithOrder)
  }
  
  applyExtraCoverageRoundRobin()

  // Ensure invalid slots are paired for display (does NOT consume FTE / pending).
  applyInvalidSlotPairingForDisplay(allocations, pcaPool)

  // Finalize tracker summary
  for (const team of TEAMS) {
    tracker[team].summary.pendingMet = roundToNearestQuarterWithMidpoint(pendingFTE[team] ?? 0) < 0.25
  }
  finalizeTrackerSummary(tracker)

  return {
    allocations,
    pendingPCAFTEPerTeam: pendingFTE,
    tracker,
    extraCoverageByStaffId: Object.keys(extraCoverageByStaffId).length > 0 ? extraCoverageByStaffId : undefined,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  }
}

type RankedSlotSelectionPhase =
  | 'ranked-unused'
  | 'unranked-unused'
  | 'ranked-duplicate'
  | 'gym-last-resort'

type RankedPcaTier = 'preferred' | 'floor' | 'non-floor'

type RankedTarget = {
  phase: RankedSlotSelectionPhase
  slot: 1 | 2 | 3 | 4
  futureSlots: Array<1 | 2 | 3 | 4>
}

function toValidSlot(value: number): 1 | 2 | 3 | 4 | null {
  if (value === 1 || value === 2 || value === 3 || value === 4) return value
  return null
}

function buildSlotCount(team: Team, allocations: PCAAllocation[]): Map<1 | 2 | 3 | 4, number> {
  const counts = new Map<1 | 2 | 3 | 4, number>([
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ])
  const existing = getTeamExistingSlots(team, allocations)
  for (const value of existing) {
    const slot = toValidSlot(value)
    if (!slot) continue
    counts.set(slot, (counts.get(slot) ?? 0) + 1)
  }
  return counts
}

function rankTierForPca(pca: PCAData, pref: TeamPreferenceInfo): RankedPcaTier {
  if (pref.preferredPCAIds.includes(pca.id)) return 'preferred'
  if (isFloorPCAForTeam(pca as any, pref.teamFloor)) return 'floor'
  return 'non-floor'
}

function rankTierWeight(tier: RankedPcaTier): number {
  if (tier === 'preferred') return 0
  if (tier === 'floor') return 1
  return 2
}

function findRankedTargets(args: {
  team: Team
  pref: TeamPreferenceInfo
  allocations: PCAAllocation[]
}): RankedTarget[] {
  const { team, pref, allocations } = args
  const counts = buildSlotCount(team, allocations)
  const isUsed = (slot: number): boolean => {
    const valid = toValidSlot(slot)
    if (!valid) return false
    return (counts.get(valid) ?? 0) > 0
  }
  const isGym = (slot: number): boolean => pref.gymSlot != null && slot === pref.gymSlot

  const rankedUnused = pref.rankedSlots
    .filter((slot) => !isUsed(slot))
    .filter((slot) => !(pref.avoidGym && isGym(slot)))
    .map((slot) => toValidSlot(slot))
    .filter((slot): slot is 1 | 2 | 3 | 4 => slot != null)

  const unrankedUnused = pref.unrankedNonGymSlots
    .filter((slot) => !isUsed(slot))
    .map((slot) => toValidSlot(slot))
    .filter((slot): slot is 1 | 2 | 3 | 4 => slot != null)

  const rankedDuplicates = pref.duplicateRankOrder
    .filter((slot) => isUsed(slot))
    .map((slot) => toValidSlot(slot))
    .filter((slot): slot is 1 | 2 | 3 | 4 => slot != null)

  const gymLastResort =
    pref.avoidGym && pref.gymSlot != null && toValidSlot(pref.gymSlot) != null
      ? [toValidSlot(pref.gymSlot)!]
      : []

  const phases: Array<{ phase: RankedSlotSelectionPhase; slots: Array<1 | 2 | 3 | 4> }> = [
    { phase: 'ranked-unused', slots: rankedUnused },
    { phase: 'unranked-unused', slots: unrankedUnused },
    { phase: 'ranked-duplicate', slots: rankedDuplicates },
    { phase: 'gym-last-resort', slots: gymLastResort },
  ]

  const flattened = phases.flatMap(({ slots }) => slots)
  let offset = 0
  const targets: RankedTarget[] = []
  for (const bucket of phases) {
    for (let i = 0; i < bucket.slots.length; i++) {
      const slot = bucket.slots[i]
      const futureSlots = flattened.slice(offset + i + 1)
      targets.push({ phase: bucket.phase, slot, futureSlots })
    }
    offset += bucket.slots.length
  }
  return targets
}

function pickRankedCandidateForTarget(args: {
  team: Team
  target: RankedTarget
  pref: TeamPreferenceInfo
  allocations: PCAAllocation[]
  pendingFTE: Record<Team, number>
  pcaPool: PCAData[]
}): {
  pca: PCAData
  tier: RankedPcaTier
  usedContinuity: boolean
} | null {
  const { team, target, pref, allocations, pendingFTE, pcaPool } = args
  const avoidGym = target.phase === 'gym-last-resort' ? false : pref.avoidGym
  const gymSlot = pref.gymSlot ?? null

  const candidates = findAvailablePCAs({
    pcaPool,
    team,
    teamFloor: pref.teamFloor,
    floorMatch: 'any',
    excludePreferredOfOtherTeams: false,
    preferredPCAIdsOfOtherTeams: new Map<string, Team[]>(),
    pendingFTEPerTeam: pendingFTE,
    requiredSlot: target.slot,
    existingAllocations: allocations,
    gymSlot,
    avoidGym,
  })

  if (candidates.length === 0) return null

  const scored = candidates.map((pca) => {
    const allocation = getOrCreateAllocation(
      pca.id,
      pca.name,
      pca.fte_pca,
      pca.leave_type,
      team,
      allocations
    )
    const teamSlotsForPca = getTeamSlotsFromAllocation(allocation, team)
    const usedContinuity = teamSlotsForPca.length > 0

    const pcaAvail = Array.isArray(pca.availableSlots)
      ? pca.availableSlots.filter((s): s is 1 | 2 | 3 | 4 => s === 1 || s === 2 || s === 3 || s === 4)
      : null
    const baseAvailable = getAvailableSlotsForTeam(allocation, gymSlot, avoidGym)
    const usableAvailable = pcaAvail ? baseAvailable.filter((slot) => pcaAvail.includes(slot)) : baseAvailable
    const canContinue = target.futureSlots.some((slot) => usableAvailable.includes(slot))
    const tier = rankTierForPca(pca, pref)
    const remainingFte = allocation.fte_remaining ?? pca.fte_pca

    return {
      pca,
      tier,
      usedContinuity,
      canContinue,
      remainingFte,
    }
  })

  scored.sort((a, b) => {
    if (a.canContinue !== b.canContinue) return a.canContinue ? -1 : 1
    if (a.usedContinuity !== b.usedContinuity) return a.usedContinuity ? -1 : 1
    const tierDiff = rankTierWeight(a.tier) - rankTierWeight(b.tier)
    if (tierDiff !== 0) return tierDiff
    if (b.remainingFte !== a.remainingFte) return b.remainingFte - a.remainingFte
    return String(a.pca.id).localeCompare(String(b.pca.id))
  })

  const winner = scored[0]
  if (!winner) return null
  return {
    pca: winner.pca,
    tier: winner.tier,
    usedContinuity: winner.usedContinuity,
  }
}

async function allocateFloatingPCARankedV2(
  context: FloatingPCAAllocationContextV2
): Promise<FloatingPCAAllocationResultV2> {
  const {
    teamOrder,
    currentPendingFTE: initialPendingFTE,
    existingAllocations,
    pcaPool,
    pcaPreferences,
    extraCoverageMode = 'none',
    preferenceSelectionMode = 'legacy',
    selectedPreferenceAssignments = [],
  } = context
  // V2 is spec-defined on ranked-slot standard mode only.
  const mode = 'standard' as const

  const allocations = existingAllocations.map((allocation) => ({ ...allocation }))
  const pendingFTE = { ...initialPendingFTE }
  const tracker = createEmptyTracker()
  const extraCoverageByStaffId: Record<string, Array<1 | 2 | 3 | 4>> = {}

  for (const team of TEAMS) {
    tracker[team].summary.allocationMode = mode
  }

  const allocationOrderMap = new Map<Team, number>()
  teamOrder.forEach((team, index) => {
    allocationOrderMap.set(team, index + 1)
  })

  const recordAssignmentWithOrder = (team: Team, log: Parameters<typeof recordAssignment>[2]) => {
    recordAssignment(tracker, team, {
      ...log,
      allocationOrder: allocationOrderMap.get(team),
    })
  }

  const useSelectionDrivenPreferences = preferenceSelectionMode === 'selected_only'
  const selectedStep32Assignments = selectedPreferenceAssignments.filter(
    (assignment) => assignment.source !== 'step33'
  )
  const effectivePreferences = useSelectionDrivenPreferences
    ? buildSelectionDrivenPreferences(
        pcaPreferences,
        selectedStep32Assignments.map((a) => ({ team: a.team, pcaId: a.pcaId }))
      )
    : pcaPreferences

  const teamPrefs: Record<Team, TeamPreferenceInfo> = {} as Record<Team, TeamPreferenceInfo>
  for (const team of TEAMS) {
    teamPrefs[team] = getTeamPreferenceInfo(team, effectivePreferences)
  }

  for (const team of teamOrder) {
    while (roundToNearestQuarterWithMidpoint(pendingFTE[team] ?? 0) >= 0.25) {
      const pref = teamPrefs[team]
      const targets = findRankedTargets({
        team,
        pref,
        allocations,
      })
      if (targets.length === 0) break

      let winner:
        | {
            pca: PCAData
            tier: RankedPcaTier
            usedContinuity: boolean
          }
        | null = null
      let target: RankedTarget | null = null
      for (const candidateTarget of targets) {
        const candidateWinner = pickRankedCandidateForTarget({
          team,
          target: candidateTarget,
          pref,
          allocations,
          pendingFTE,
          pcaPool,
        })
        if (candidateWinner) {
          winner = candidateWinner
          target = candidateTarget
          break
        }
      }
      if (!winner || !target) break

      const allocation = getOrCreateAllocation(
        winner.pca.id,
        winner.pca.name,
        winner.pca.fte_pca,
        winner.pca.leave_type,
        team,
        allocations
      )

      const avoidGym = target.phase === 'gym-last-resort' ? false : pref.avoidGym
      const result = assignOneSlotAndUpdatePending({
        pca: winner.pca,
        allocation,
        team,
        teamExistingSlots: getTeamExistingSlots(team, allocations),
        gymSlot: pref.gymSlot ?? null,
        avoidGym,
        preferredSlot: target.slot,
        pendingFTEByTeam: pendingFTE,
        context: 'Cleanup pass → one slot at a time',
      })

      if (result.slotsAssigned.length === 0) break

      const assignedSlot = result.slotsAssigned[0] as 1 | 2 | 3 | 4
      const rankIndex = pref.rankedSlots.indexOf(assignedSlot)
      recordAssignmentWithOrder(team, {
        slot: assignedSlot,
        pcaId: winner.pca.id,
        pcaName: winner.pca.name,
        assignedIn: 'step34',
        cycle: 1,
        wasPreferredSlot: assignedSlot === (pref.preferredSlot ?? -1),
        wasPreferredPCA: winner.tier === 'preferred',
        wasFloorPCA: winner.tier === 'floor' ? true : winner.tier === 'non-floor' ? false : undefined,
        amPmBalanceAchieved: result.amPmBalanced,
        gymSlotAvoided: pref.gymSlot != null ? assignedSlot !== pref.gymSlot : undefined,
        fulfilledSlotRank: rankIndex >= 0 ? rankIndex + 1 : null,
        slotSelectionPhase: target.phase,
        pcaSelectionTier: winner.tier,
        usedContinuity: winner.usedContinuity,
        duplicateSlot: target.phase === 'ranked-duplicate',
      })
    }
  }

  const applyExtraCoverageRoundRobin = () => {
    if (extraCoverageMode !== 'round-robin-team-order') return
    const allSatisfied = TEAMS.every((team) => roundToNearestQuarterWithMidpoint(pendingFTE[team] ?? 0) < 0.25)
    if (!allSatisfied) return

    const zeroPending = TEAMS.reduce((record, team) => {
      ;(record as any)[team] = 0
      return record
    }, {} as Record<Team, number>)

    let madeProgress = true
    while (madeProgress) {
      madeProgress = false
      for (const team of teamOrder) {
        const pref = teamPrefs[team]
        const candidates = findAvailablePCAs({
          pcaPool,
          team,
          teamFloor: pref.teamFloor,
          floorMatch: 'any',
          excludePreferredOfOtherTeams: false,
          preferredPCAIdsOfOtherTeams: new Map<string, Team[]>(),
          pendingFTEPerTeam: zeroPending,
          existingAllocations: allocations,
          gymSlot: pref.gymSlot ?? null,
          avoidGym: pref.avoidGym ?? false,
        })
        if (candidates.length === 0) continue

        const winner = [...candidates].sort((a, b) => {
          const aAlloc = allocations.find((allocation) => allocation.staff_id === a.id)
          const bAlloc = allocations.find((allocation) => allocation.staff_id === b.id)
          const aFte = aAlloc?.fte_remaining ?? a.fte_pca
          const bFte = bAlloc?.fte_remaining ?? b.fte_pca
          if (bFte !== aFte) return bFte - aFte
          return String(a.id).localeCompare(String(b.id))
        })[0]

        const allocation = getOrCreateAllocation(
          winner.id,
          winner.name,
          winner.fte_pca,
          winner.leave_type,
          team,
          allocations
        )

        const extraResult = assignSlotsToTeam({
          pca: winner,
          allocation,
          team,
          pendingFTE: 0.25,
          teamExistingSlots: getTeamExistingSlots(team, allocations),
          gymSlot: pref.gymSlot ?? null,
          avoidGym: pref.avoidGym ?? false,
        })

        if (extraResult.slotsAssigned.length === 0) continue
        madeProgress = true

        for (const slot of extraResult.slotsAssigned) {
          if (slot === 1 || slot === 2 || slot === 3 || slot === 4) {
            const existing = extraCoverageByStaffId[winner.id] ?? []
            existing.push(slot)
            extraCoverageByStaffId[winner.id] = existing
          }
          recordAssignmentWithOrder(team, {
            slot,
            pcaId: winner.id,
            pcaName: winner.name,
            assignedIn: 'step34',
            cycle: 3,
            assignmentTag: 'extra',
            wasFloorPCA: isFloorPCAForTeam(winner as any, pref.teamFloor),
          })
        }
      }
    }
  }

  applyExtraCoverageRoundRobin()
  applyInvalidSlotPairingForDisplay(allocations, pcaPool)
  for (const team of TEAMS) {
    tracker[team].summary.pendingMet = roundToNearestQuarterWithMidpoint(pendingFTE[team] ?? 0) < 0.25
  }
  finalizeTrackerSummary(tracker)

  return {
    allocations,
    pendingPCAFTEPerTeam: pendingFTE,
    tracker,
    extraCoverageByStaffId: Object.keys(extraCoverageByStaffId).length > 0 ? extraCoverageByStaffId : undefined,
    errors: undefined,
  }
}

/**
 * V1 (legacy) entry point.
 * Kept stable so we can preserve the existing allocator while V2 evolves.
 */
export async function allocateFloatingPCA_v1(
  context: FloatingPCAAllocationContextV2
): Promise<FloatingPCAAllocationResultV2> {
  return allocateFloatingPCAClassic(context)
}

/**
 * V2 entry point (default).
 * Uses ranked-slot ladder for standard mode and keeps legacy balanced mode.
 */
export async function allocateFloatingPCA_v2(
  context: FloatingPCAAllocationContextV2
): Promise<FloatingPCAAllocationResultV2> {
  return allocateFloatingPCARankedV2(context)
}

function isTeamSlotAlreadyAssigned(team: Team, slot: number, allocations: PCAAllocation[]): boolean {
  for (const alloc of allocations) {
    if (slot === 1 && alloc.slot1 === team) return true
    if (slot === 2 && alloc.slot2 === team) return true
    if (slot === 3 && alloc.slot3 === team) return true
    if (slot === 4 && alloc.slot4 === team) return true
  }
  return false
}

function applyInvalidSlotPairingForDisplay(allocations: PCAAllocation[], pcaPool: PCAData[]): void {
  const getSlotTeam = (alloc: PCAAllocation, slot: number): Team | null => {
    if (slot === 1) return alloc.slot1
    if (slot === 2) return alloc.slot2
    if (slot === 3) return alloc.slot3
    if (slot === 4) return alloc.slot4
    return null
  }

  const allocationByStaffId = new Map<string, PCAAllocation>()
  allocations.forEach((allocation) => {
    if (!allocationByStaffId.has(allocation.staff_id)) {
      allocationByStaffId.set(allocation.staff_id, allocation)
    }
  })

  for (const pca of pcaPool) {
    const invalidSlot = (pca as any)?.invalidSlot as number | null | undefined
    if (invalidSlot == null) continue
    if (![1, 2, 3, 4].includes(invalidSlot)) continue

    const alloc = allocationByStaffId.get(pca.id)
    if (!alloc) continue

    const pairedSlot = invalidSlot === 1 ? 2 : invalidSlot === 2 ? 1 : invalidSlot === 3 ? 4 : 3
    const pairedTeam = getSlotTeam(alloc, pairedSlot)
    if (!pairedTeam) continue

    // Display-only: show invalid slot under its paired half-day team.
    // This must NOT consume pending/FTE (algorithm already excluded invalid slot from availableSlots).
    assignSlotIfValid({
      allocation: alloc,
      slot: invalidSlot,
      team: pairedTeam,
      skipFteCheck: true,
      allowOverwrite: true,
    })
    ;(alloc as any).invalid_slot = invalidSlot
  }
}

type BalancedAllocatorParams = {
  teamOrder: Team[]
  allocations: PCAAllocation[]
  pendingFTE: Record<Team, number>
  pcaPool: PCAData[]
  pcaPreferences: PCAPreference[]
  teamPrefs: Record<Team, TeamPreferenceInfo>
  preferredPCAMap: Map<string, Team[]>
  tracker: AllocationTracker
  recordAssignmentWithOrder: (team: Team, log: Parameters<typeof recordAssignment>[2]) => void
  isAllocationComplete: () => boolean
}

/**
 * Balanced allocation mode: give teams turns (one slot at a time) to reduce the chance
 * a high-need team ends with near-zero floating PCA when manpower is tight.
 *
 * - Gym avoidance remains a hard constraint.
 * - Floor matching and “reserved preferred PCA” are treated as soft constraints via staged relaxation.
 */
async function allocateFloatingPCA_balanced(params: BalancedAllocatorParams): Promise<void> {
  const {
    teamOrder,
    allocations,
    pendingFTE,
    pcaPool,
    pcaPreferences,
    teamPrefs,
    tracker,
    recordAssignmentWithOrder,
    isAllocationComplete,
  } = params

  const tryAssignOneForTeam = (team: Team, stage: 1 | 2): boolean => {
    if ((pendingFTE[team] ?? 0) < 0.25) return false

    const pref = teamPrefs[team]
    const { teamFloor, gymSlot, avoidGym } = pref

    const preferredPCAMapLive = buildPreferredPCAMap(pcaPreferences, pendingFTE)

    const floorMatch: 'same' | 'any' = stage === 1 && teamFloor ? 'same' : 'any'
    const excludePreferred = stage === 1

    const candidates = findAvailablePCAs({
      pcaPool,
      team,
      teamFloor,
      floorMatch,
      excludePreferredOfOtherTeams: excludePreferred,
      preferredPCAIdsOfOtherTeams: preferredPCAMapLive,
      pendingFTEPerTeam: pendingFTE,
      existingAllocations: allocations,
      gymSlot,
      avoidGym,
    })

    for (const pca of candidates) {
      const allocation = getOrCreateAllocation(pca.id, pca.name, pca.fte_pca, pca.leave_type, team, allocations)
      if (allocation.fte_remaining <= 0) continue

      const existingSlots = getTeamExistingSlots(team, allocations)
      const result = assignOneSlotAndUpdatePending({
        pca,
        allocation,
        team,
        teamExistingSlots: existingSlots,
        gymSlot,
        avoidGym,
        pendingFTEByTeam: pendingFTE,
        context: 'Cleanup pass → one slot at a time',
      })

      if (result.slotsAssigned.length === 0) continue

      const wasExcludedInCycle1 = stage === 2 && preferredPCAMapLive.has(pca.id)
      for (const slot of result.slotsAssigned) {
        recordAssignmentWithOrder(team, {
          slot,
          pcaId: pca.id,
          pcaName: pca.name,
          assignedIn: 'step34',
          cycle: stage,
          wasPreferredSlot: false,
          wasPreferredPCA: pref.preferredPCAIds.includes(pca.id),
          wasFloorPCA: teamFloor ? isFloorPCAForTeam(pca, teamFloor) : undefined,
          wasExcludedInCycle1,
          amPmBalanceAchieved: result.amPmBalanced,
          gymSlotAvoided: gymSlot !== null && slot !== gymSlot,
        })
      }

      return true
    }

    return false
  }

  const runStage = async (stage: 1 | 2) => {
    while (!isAllocationComplete()) {
      let progressed = false
      for (const team of teamOrder) {
        if ((pendingFTE[team] ?? 0) < 0.25) continue
        if (isAllocationComplete()) break
        const ok = tryAssignOneForTeam(team, stage)
        if (ok) progressed = true
      }
      if (!progressed) break
    }
  }

  // Stage 1: stricter (tries to avoid borrowing other teams' preferred PCAs; prefers floor-matched).
  await runStage(1)
  // Stage 2: relaxed (borrowing allowed; floor softened).
  if (!isAllocationComplete()) {
    await runStage(2)
  }

  // Stage 3: reuse existing cleanup behavior (PCA-centric one-slot assignment).
  if (!isAllocationComplete()) {
    await processCycle3Cleanup(allocations, pendingFTE, pcaPool, pcaPreferences, teamPrefs, tracker, recordAssignmentWithOrder)
  }
}

// ============================================================================
// Condition A: Preferred PCA + Preferred Slot
// ============================================================================

async function processConditionA(
  team: Team,
  pref: TeamPreferenceInfo,
  allocations: PCAAllocation[],
  pendingFTE: Record<Team, number>,
  pcaPool: PCAData[],
  pcaPreferences: PCAPreference[],
  preferredPCAMap: Map<string, Team[]>,
  tracker: AllocationTracker,
  errors: { preferredSlotUnassigned?: string[] },
  recordAssignmentWithOrder: (team: Team, log: Parameters<typeof recordAssignment>[2]) => void,
  getProtectedPCAMap?: () => Map<string, Team[]>
): Promise<void> {
  const { preferredPCAIds, preferredSlot, teamFloor, gymSlot, avoidGym } = pref

  if (!preferredSlot) return
  
  let preferredSlotAssigned = false
  const preferredSlotAlreadyFilled = isTeamSlotAlreadyAssigned(team, preferredSlot, allocations)
  
  // Step 1: Try preferred PCA(s) for preferred slot
  for (const pcaId of preferredPCAIds) {
    if (pendingFTE[team] <= 0) break
    if (preferredSlotAssigned) break
    
    const pca = pcaPool.find(p => p.id === pcaId)
    if (!pca || pca.fte_pca <= 0) continue
    
    const allocation = getOrCreateAllocation(pca.id, pca.name, pca.fte_pca, pca.leave_type, team, allocations)
    
    // Check if preferred slot is available
    const existingSlots = getTeamExistingSlots(team, allocations)
    const result = assignOneSlotAndUpdatePending({
      pca,
      allocation,
      team,
      teamExistingSlots: existingSlots,
      gymSlot,
      avoidGym,
      preferredSlot,
      pendingFTEByTeam: pendingFTE,
      context: 'Preferred PCA + preferred slot → preferred slot from preferred PCA',
    })
    
    // Record ALL slots assigned, even if preferred slot is not included
    // This handles the case where preferred slot was already assigned in Step 3.2,
    // but other slots from the preferred PCA are still assigned in Step 1
    if (result.slotsAssigned.length > 0) {
      // Check if preferred slot was assigned (for preferredSlotAssigned flag)
      if (result.slotsAssigned.includes(preferredSlot)) {
        preferredSlotAssigned = true
      }
      
      // Record ALL slots assigned (not just when preferred slot is included)
      for (const slot of result.slotsAssigned) {
        recordAssignmentWithOrder(team, {
          slot,
          pcaId: pca.id,
          pcaName: pca.name,
          assignedIn: 'step34',
          cycle: 1,
          condition: 'A',
          wasPreferredSlot: slot === preferredSlot,
          wasPreferredPCA: true,
          wasFloorPCA: undefined,  // Not from floor/non-floor loop - from preferred PCA
          amPmBalanceAchieved: result.amPmBalanced,
          gymSlotAvoided: gymSlot !== null && slot !== gymSlot,
        })
      }
    }
  }
  
  // Step 2: Try floor PCA for preferred slot (if not assigned)
  if (!preferredSlotAssigned && pendingFTE[team] > 0) {
    const floorPCAs = findAvailablePCAs({
      pcaPool,
      team,
      teamFloor,
      floorMatch: 'same',
      excludePreferredOfOtherTeams: true,
      preferredPCAIdsOfOtherTeams: preferredPCAMap,
      pendingFTEPerTeam: pendingFTE,
      requiredSlot: preferredSlot,
      existingAllocations: allocations,
      gymSlot,
      avoidGym,
    })
    
    for (const pca of floorPCAs) {
      if (preferredSlotAssigned) break
      
      const allocation = getOrCreateAllocation(pca.id, pca.name, pca.fte_pca, pca.leave_type, team, allocations)
      const existingSlots = getTeamExistingSlots(team, allocations)
      const result = assignOneSlotAndUpdatePending({
        pca,
        allocation,
        team,
        teamExistingSlots: existingSlots,
        gymSlot,
        avoidGym,
        preferredSlot,
        pendingFTEByTeam: pendingFTE,
        context: 'Preferred PCA + preferred slot → preferred slot from floor PCA',
      })
      
      if (result.slotsAssigned.includes(preferredSlot)) {
        preferredSlotAssigned = true
        
        // Record ALL slots assigned (not just the preferred slot)
        for (const slot of result.slotsAssigned) {
          recordAssignmentWithOrder(team, {
            slot,
            pcaId: pca.id,
            pcaName: pca.name,
            assignedIn: 'step34',
            cycle: 1,
            condition: 'A',
            wasPreferredSlot: slot === preferredSlot,
            wasPreferredPCA: false,
            wasFloorPCA: true,
            amPmBalanceAchieved: result.amPmBalanced,
            gymSlotAvoided: gymSlot !== null && slot !== gymSlot,
          })
        }
      }
    }
  }
  
  // Step 3: Try non-floor PCA for preferred slot (if not assigned)
  if (!preferredSlotAssigned && pendingFTE[team] > 0) {
    const nonFloorPCAs = findAvailablePCAs({
      pcaPool,
      team,
      teamFloor,
      floorMatch: 'different',
      excludePreferredOfOtherTeams: false,  // Allow any PCA for preferred slot
      preferredPCAIdsOfOtherTeams: preferredPCAMap,
      pendingFTEPerTeam: pendingFTE,
      requiredSlot: preferredSlot,
      existingAllocations: allocations,
      gymSlot,
      avoidGym,
    })
    
    for (const pca of nonFloorPCAs) {
      if (preferredSlotAssigned) break
      
      const allocation = getOrCreateAllocation(pca.id, pca.name, pca.fte_pca, pca.leave_type, team, allocations)
      const existingSlots = getTeamExistingSlots(team, allocations)
      const result = assignOneSlotAndUpdatePending({
        pca,
        allocation,
        team,
        teamExistingSlots: existingSlots,
        gymSlot,
        avoidGym,
        preferredSlot,
        pendingFTEByTeam: pendingFTE,
        context: 'Preferred PCA + preferred slot → preferred slot from non-floor PCA',
      })
      
      if (result.slotsAssigned.includes(preferredSlot)) {
        preferredSlotAssigned = true
        
        // Record ALL slots assigned (not just the preferred slot)
        for (const slot of result.slotsAssigned) {
          recordAssignmentWithOrder(team, {
            slot,
            pcaId: pca.id,
            pcaName: pca.name,
            assignedIn: 'step34',
            cycle: 1,
            condition: 'A',
            wasPreferredSlot: slot === preferredSlot,
            wasPreferredPCA: false,
            wasFloorPCA: false,
            amPmBalanceAchieved: result.amPmBalanced,
            gymSlotAvoided: gymSlot !== null && slot !== gymSlot,
          })
        }
      }
    }
  }
  
  // Record error if preferred slot could not be assigned
  // Suppress noise if Step 3.2 (or earlier) already filled the preferred slot.
  if (!preferredSlotAssigned && !preferredSlotAlreadyFilled) {
    if (!errors.preferredSlotUnassigned) errors.preferredSlotUnassigned = []
    errors.preferredSlotUnassigned.push(`${team}: Could not assign preferred slot ${preferredSlot}`)
  }
  
  // Step 4: Fill remaining slots from preferred PCA(s)
  // Continue assigning from the same PCA until team's pending FTE = 0 or PCA has no more slots
  // NOTE: assignSlotsToTeam() already limits assignments to the team's pending FTE, so it will NOT
  // over-assign. For example, if team needs 0.5 FTE (2 slots) and PCA has 0.75 FTE (3 slots),
  // it will only assign 2 slots (0.5 FTE), not 3 slots (0.75 FTE).
  if (pendingFTE[team] > 0) {
    for (const pcaId of preferredPCAIds) {
      if (pendingFTE[team] <= 0) break
      
      const pca = pcaPool.find(p => p.id === pcaId)
      if (!pca) continue

      // Get or create allocation for this PCA
      const allocation = getOrCreateAllocation(pca.id, pca.name, pca.fte_pca, pca.leave_type, team, allocations)

      // Continue assigning from this PCA until team's pending FTE is exhausted or PCA has no more slots
      // The while loop ensures we stay on the same PCA and keep assigning until one condition is met:
      // 1. Team's pending FTE reaches 0 (team requirement fulfilled)
      // 2. PCA's fte_remaining reaches 0 (PCA exhausted)
      // 3. PCA has no more available slots for this team
      while (pendingFTE[team] > 0 && allocation.fte_remaining > 0) {
        // Check if PCA has any available slots for this team
        const existingSlots = getTeamExistingSlots(team, allocations)
        const availableSlots = getAvailableSlotsForTeam(allocation, gymSlot, avoidGym)

        // If no available slots, break (PCA is exhausted for this team)
        if (availableSlots.length === 0) break
        
        // Assign ONE slot (0.25 FTE) at a time from this PCA.
        // This avoids AM/PM balancing heuristics "skipping" a remaining usable slot
        // when the team still has pending FTE (e.g. slot 4 remains usable while slot 3 is blocked by avoidGym).
        const result = assignOneSlotAndUpdatePending({
          pca,
          allocation,
          team,
          teamExistingSlots: existingSlots,
          gymSlot,
          avoidGym,
          pendingFTEByTeam: pendingFTE,
          context: 'Preferred PCA + preferred slot → fill remaining from preferred PCA',
        })

        // If no slots were assigned, break (shouldn't happen, but safety check)
        if (result.slotsAssigned.length === 0) break
        
        // Record all slots assigned
        for (const slot of result.slotsAssigned) {
          recordAssignmentWithOrder(team, {
            slot,
            pcaId: pca.id,
            pcaName: pca.name,
            assignedIn: 'step34',
            cycle: 1,
            condition: 'A',
            assignmentTag: 'remaining',
            wasPreferredSlot: false,
            wasPreferredPCA: true,
            wasFloorPCA: undefined,  // Not from floor/non-floor loop - from preferred PCA
            amPmBalanceAchieved: result.amPmBalanced,
            gymSlotAvoided: gymSlot !== null && slot !== gymSlot,
          })
        }
      }
    }
  }
  
  // Step 5: Fill remaining from floor PCA (excluding preferred of other teams)
  if (pendingFTE[team] > 0) {
    await processFloorPCAFallback(
      team,
      pref,
      allocations,
      pendingFTE,
      pcaPool,
      pcaPreferences,
      tracker,
      1,
      recordAssignmentWithOrder,
      'A',
      getProtectedPCAMap
    )
  }
}

// ============================================================================
// Condition B: Preferred Slot only (no preferred PCA)
// ============================================================================

async function processConditionB(
  team: Team,
  pref: TeamPreferenceInfo,
  allocations: PCAAllocation[],
  pendingFTE: Record<Team, number>,
  pcaPool: PCAData[],
  pcaPreferences: PCAPreference[],
  preferredPCAMap: Map<string, Team[]>,
  tracker: AllocationTracker,
  errors: { preferredSlotUnassigned?: string[] },
  recordAssignmentWithOrder: (team: Team, log: Parameters<typeof recordAssignment>[2]) => void,
  getProtectedPCAMap?: () => Map<string, Team[]>
): Promise<void> {
  const { preferredSlot, teamFloor, gymSlot, avoidGym } = pref
  
  if (!preferredSlot) return
  
  let preferredSlotAssigned = false
  const preferredSlotAlreadyFilled = isTeamSlotAlreadyAssigned(team, preferredSlot, allocations)
  let lastUsedPCA: PCAData | null = null
  
  // Step 1: Try floor PCA for preferred slot
  const floorPCAs = findAvailablePCAs({
    pcaPool,
    team,
    teamFloor,
    floorMatch: 'same',
    excludePreferredOfOtherTeams: true,
    preferredPCAIdsOfOtherTeams: preferredPCAMap,
    pendingFTEPerTeam: pendingFTE,
    requiredSlot: preferredSlot,
    existingAllocations: allocations,
    gymSlot,
    avoidGym,
  })
  
  for (const pca of floorPCAs) {
    if (preferredSlotAssigned) break
    
    const allocation = getOrCreateAllocation(pca.id, pca.name, pca.fte_pca, pca.leave_type, team, allocations)
    const existingSlots = getTeamExistingSlots(team, allocations)
    const result = assignOneSlotAndUpdatePending({
      pca,
      allocation,
      team,
      teamExistingSlots: existingSlots,
      gymSlot,
      avoidGym,
      preferredSlot,
      pendingFTEByTeam: pendingFTE,
      context: 'Preferred slot only → preferred slot from floor PCA',
    })
    
    if (result.slotsAssigned.includes(preferredSlot)) {
      preferredSlotAssigned = true
      lastUsedPCA = pca

      // Record ALL slots assigned (not just the preferred slot)
      for (const slot of result.slotsAssigned) {
        recordAssignmentWithOrder(team, {
          slot,
          pcaId: pca.id,
          pcaName: pca.name,
          assignedIn: 'step34',
          cycle: 1,
          condition: 'B',
          wasPreferredSlot: slot === preferredSlot,
          wasPreferredPCA: false,
          wasFloorPCA: true,
          amPmBalanceAchieved: result.amPmBalanced,
          gymSlotAvoided: gymSlot !== null && slot !== gymSlot,
        })
      }
      
      // Fill remaining from same PCA
      if (pendingFTE[team] > 0 && allocation.fte_remaining > 0) {
        const moreSlots = assignUpToPendingAndUpdatePending({
          pca,
          allocation,
          team,
          teamExistingSlots: [...existingSlots, ...result.slotsAssigned],
          gymSlot,
          avoidGym,
          pendingFTEByTeam: pendingFTE,
          context: 'Preferred slot only → fill remaining from same PCA',
        })
        
        for (const slot of moreSlots.slotsAssigned) {
          recordAssignmentWithOrder(team, {
            slot,
            pcaId: pca.id,
            pcaName: pca.name,
            assignedIn: 'step34',
            cycle: 1,
            condition: 'B',
            assignmentTag: 'remaining',
            wasPreferredSlot: false,
            wasPreferredPCA: false,
            wasFloorPCA: true,
            amPmBalanceAchieved: moreSlots.amPmBalanced,
            gymSlotAvoided: gymSlot !== null && slot !== gymSlot,
          })
        }
      }
    }
  }
  
  // Step 2: Try non-floor PCA for preferred slot (if not assigned)
  if (!preferredSlotAssigned && pendingFTE[team] > 0) {
    const nonFloorPCAs = findAvailablePCAs({
      pcaPool,
      team,
      teamFloor,
      floorMatch: 'different',
      excludePreferredOfOtherTeams: false,
      preferredPCAIdsOfOtherTeams: preferredPCAMap,
      pendingFTEPerTeam: pendingFTE,
      requiredSlot: preferredSlot,
      existingAllocations: allocations,
      gymSlot,
      avoidGym,
    })
    
    for (const pca of nonFloorPCAs) {
      if (preferredSlotAssigned) break
      
      const allocation = getOrCreateAllocation(pca.id, pca.name, pca.fte_pca, pca.leave_type, team, allocations)
      const existingSlots = getTeamExistingSlots(team, allocations)
      const result = assignOneSlotAndUpdatePending({
        pca,
        allocation,
        team,
        teamExistingSlots: existingSlots,
        gymSlot,
        avoidGym,
        preferredSlot,
        pendingFTEByTeam: pendingFTE,
        context: 'Preferred slot only → preferred slot from non-floor PCA',
      })
      
      if (result.slotsAssigned.includes(preferredSlot)) {
        preferredSlotAssigned = true
        lastUsedPCA = pca

        // Record ALL slots assigned (not just the preferred slot)
        for (const slot of result.slotsAssigned) {
          recordAssignmentWithOrder(team, {
            slot,
            pcaId: pca.id,
            pcaName: pca.name,
            assignedIn: 'step34',
            cycle: 1,
            condition: 'B',
            wasPreferredSlot: slot === preferredSlot,
            wasPreferredPCA: false,
            wasFloorPCA: false,
            amPmBalanceAchieved: result.amPmBalanced,
            gymSlotAvoided: gymSlot !== null && slot !== gymSlot,
          })
        }
        
        // Fill remaining from same PCA
        if (pendingFTE[team] > 0 && allocation.fte_remaining > 0) {
          const moreSlots = assignUpToPendingAndUpdatePending({
            pca,
            allocation,
            team,
            teamExistingSlots: [...existingSlots, ...result.slotsAssigned],
            gymSlot,
            avoidGym,
            pendingFTEByTeam: pendingFTE,
            context: 'Preferred slot only → fill remaining from same PCA',
          })
          
          for (const slot of moreSlots.slotsAssigned) {
            recordAssignmentWithOrder(team, {
              slot,
              pcaId: pca.id,
              pcaName: pca.name,
              assignedIn: 'step34',
              cycle: 1,
              condition: 'B',
              assignmentTag: 'remaining',
              wasPreferredSlot: false,
              wasPreferredPCA: false,
              wasFloorPCA: false,
              amPmBalanceAchieved: moreSlots.amPmBalanced,
              gymSlotAvoided: gymSlot !== null && slot !== gymSlot,
            })
          }
        }
      }
    }
  }
  
  // Record error if preferred slot could not be assigned
  // Suppress noise if Step 3.2 (or earlier) already filled the preferred slot.
  if (!preferredSlotAssigned && !preferredSlotAlreadyFilled) {
    if (!errors.preferredSlotUnassigned) errors.preferredSlotUnassigned = []
    errors.preferredSlotUnassigned.push(`${team}: Could not assign preferred slot ${preferredSlot}`)
  }
  
  // Step 3: Continue filling from floor PCAs
  if (pendingFTE[team] > 0) {
    await processFloorPCAFallback(
      team,
      pref,
      allocations,
      pendingFTE,
      pcaPool,
      pcaPreferences,
      tracker,
      1,
      recordAssignmentWithOrder,
      'B',
      getProtectedPCAMap
    )
  }
}

// ============================================================================
// Condition C: Preferred PCA only (no preferred slot)
// ============================================================================

async function processConditionC(
  team: Team,
  pref: TeamPreferenceInfo,
  allocations: PCAAllocation[],
  pendingFTE: Record<Team, number>,
  pcaPool: PCAData[],
  pcaPreferences: PCAPreference[],
  preferredPCAMap: Map<string, Team[]>,
  tracker: AllocationTracker,
  recordAssignmentWithOrder: (team: Team, log: Parameters<typeof recordAssignment>[2]) => void,
  getProtectedPCAMap?: () => Map<string, Team[]>
): Promise<void> {
  const { preferredPCAIds, teamFloor, gymSlot, avoidGym } = pref
  
  // Step 1: Fill from preferred PCA(s)
  for (const pcaId of preferredPCAIds) {
    if (pendingFTE[team] <= 0) break
    
    const pca = pcaPool.find(p => p.id === pcaId)
    if (!pca || pca.fte_pca <= 0) continue
    
    const allocation = getOrCreateAllocation(pca.id, pca.name, pca.fte_pca, pca.leave_type, team, allocations)
    if (allocation.fte_remaining <= 0) continue
    
    const existingSlots = getTeamExistingSlots(team, allocations)
    const result = assignUpToPendingAndUpdatePending({
      pca,
      allocation,
      team,
      teamExistingSlots: existingSlots,
      gymSlot,
      avoidGym,
      pendingFTEByTeam: pendingFTE,
      context: 'Preferred PCA only → fill from preferred PCA',
    })
    
      // Condition C: Preferred PCA only - don't set wasFloorPCA (not from floor/non-floor loop)
      for (const slot of result.slotsAssigned) {
        recordAssignmentWithOrder(team, {
          slot,
          pcaId: pca.id,
          pcaName: pca.name,
          assignedIn: 'step34',
          cycle: 1,
          condition: 'C',
          wasPreferredSlot: false,
          wasPreferredPCA: true,
          wasFloorPCA: undefined,  // Not from floor/non-floor loop - from preferred PCA
          amPmBalanceAchieved: result.amPmBalanced,
          gymSlotAvoided: gymSlot !== null && slot !== gymSlot,
        })
      }
    
  }
  
  // Step 2: Fill remaining from floor PCA
  if (pendingFTE[team] > 0) {
    await processFloorPCAFallback(
      team,
      pref,
      allocations,
      pendingFTE,
      pcaPool,
      pcaPreferences,
      tracker,
      1,
      recordAssignmentWithOrder,
      'C',
      getProtectedPCAMap
    )
  }
}

// ============================================================================
// Condition D: No preferences
// ============================================================================

async function processConditionD(
  team: Team,
  pref: TeamPreferenceInfo,
  allocations: PCAAllocation[],
  pendingFTE: Record<Team, number>,
  pcaPool: PCAData[],
  pcaPreferences: PCAPreference[],
  preferredPCAMap: Map<string, Team[]>,
  tracker: AllocationTracker,
  recordAssignmentWithOrder: (team: Team, log: Parameters<typeof recordAssignment>[2]) => void,
  getProtectedPCAMap?: () => Map<string, Team[]>
): Promise<void> {
  // Just use floor PCA fallback directly
  await processFloorPCAFallback(
    team,
    pref,
    allocations,
    pendingFTE,
    pcaPool,
    pcaPreferences,
    tracker,
    1,
    recordAssignmentWithOrder,
    'D',
    getProtectedPCAMap
  )
}

// ============================================================================
// Floor PCA Fallback (used in Cycle 1 and Cycle 2)
// ============================================================================

async function processFloorPCAFallback(
  team: Team,
  pref: TeamPreferenceInfo,
  allocations: PCAAllocation[],
  pendingFTE: Record<Team, number>,
  pcaPool: PCAData[],
  pcaPreferences: PCAPreference[],
  tracker: AllocationTracker,
  cycle: 1 | 2,
  recordAssignmentWithOrder: (team: Team, log: Parameters<typeof recordAssignment>[2]) => void,
  condition?: 'A' | 'B' | 'C' | 'D',
  getProtectedPCAMap?: () => Map<string, Team[]>
): Promise<void> {
  const { teamFloor, gymSlot, avoidGym } = pref
  
  const preferredPCAMap = getProtectedPCAMap
    ? getProtectedPCAMap()
    : buildPreferredPCAMap(pcaPreferences, pendingFTE)
  
  // In Cycle 1, exclude preferred PCAs of other teams
  // In Cycle 2, allow them
  const excludePreferred = cycle === 1
  
  const floorPCAs = findAvailablePCAs({
    pcaPool,
    team,
    teamFloor,
    floorMatch: 'same',
    excludePreferredOfOtherTeams: excludePreferred,
    preferredPCAIdsOfOtherTeams: preferredPCAMap,
    pendingFTEPerTeam: pendingFTE,
    existingAllocations: allocations,
    gymSlot,
    avoidGym,
  })

  for (const pca of floorPCAs) {
    if (pendingFTE[team] <= 0) break
    
    const allocation = getOrCreateAllocation(pca.id, pca.name, pca.fte_pca, pca.leave_type, team, allocations)
    if (allocation.fte_remaining <= 0) continue
    
    const existingSlots = getTeamExistingSlots(team, allocations)
    const result = assignUpToPendingAndUpdatePending({
      pca,
      allocation,
      team,
      teamExistingSlots: existingSlots,
      gymSlot,
      avoidGym,
      pendingFTEByTeam: pendingFTE,
      context: condition === 'D'
        ? 'No preferences → floor PCA fallback'
        : 'Floor PCA fallback',
    })
    
    // Check if this PCA was excluded in Cycle 1 but available now (Cycle 2)
    const wasExcludedInCycle1 = cycle === 2 && preferredPCAMap.has(pca.id)
    
    for (const slot of result.slotsAssigned) {
      recordAssignmentWithOrder(team, {
        slot,
        pcaId: pca.id,
        pcaName: pca.name,
        assignedIn: 'step34',
        cycle,
        condition: cycle === 1 ? condition : undefined,
        wasPreferredSlot: false,
        wasPreferredPCA: false,
        wasFloorPCA: true,
        wasExcludedInCycle1,
        amPmBalanceAchieved: result.amPmBalanced,
        gymSlotAvoided: gymSlot !== null && slot !== gymSlot,
      })
    }
    
  }
}

// ============================================================================
// Non-Floor PCA Fallback (Cycle 2)
// ============================================================================

async function processNonFloorPCAFallback(
  team: Team,
  pref: TeamPreferenceInfo,
  allocations: PCAAllocation[],
  pendingFTE: Record<Team, number>,
  pcaPool: PCAData[],
  pcaPreferences: PCAPreference[],
  tracker: AllocationTracker,
  recordAssignmentWithOrder: (team: Team, log: Parameters<typeof recordAssignment>[2]) => void,
  getProtectedPCAMap?: () => Map<string, Team[]>
): Promise<void> {
  const { teamFloor, gymSlot, avoidGym } = pref
  
  const preferredPCAMap = getProtectedPCAMap
    ? getProtectedPCAMap()
    : buildPreferredPCAMap(pcaPreferences, pendingFTE)
  
  const nonFloorPCAs = findAvailablePCAs({
    pcaPool,
    team,
    teamFloor,
    floorMatch: 'different',
    excludePreferredOfOtherTeams: false,  // No restrictions in Cycle 2
    preferredPCAIdsOfOtherTeams: preferredPCAMap,
    pendingFTEPerTeam: pendingFTE,
    existingAllocations: allocations,
    gymSlot,
    avoidGym,
  })
  
  for (const pca of nonFloorPCAs) {
    if (pendingFTE[team] <= 0) break
    
    const allocation = getOrCreateAllocation(pca.id, pca.name, pca.fte_pca, pca.leave_type, team, allocations)
    if (allocation.fte_remaining <= 0) continue
    
    const existingSlots = getTeamExistingSlots(team, allocations)
    const result = assignUpToPendingAndUpdatePending({
      pca,
      allocation,
      team,
      teamExistingSlots: existingSlots,
      gymSlot,
      avoidGym,
      pendingFTEByTeam: pendingFTE,
      context: 'Non-floor PCA fallback',
    })
    
    for (const slot of result.slotsAssigned) {
      recordAssignmentWithOrder(team, {
        slot,
        pcaId: pca.id,
        pcaName: pca.name,
        assignedIn: 'step34',
        cycle: 2,
        wasPreferredSlot: false,
        wasPreferredPCA: false,
        wasFloorPCA: false,
        amPmBalanceAchieved: result.amPmBalanced,
        gymSlotAvoided: gymSlot !== null && slot !== gymSlot,
      })
    }
    
  }
}

// ============================================================================
// Cycle 3: PCA-Centric Cleanup
// ============================================================================

async function processCycle3Cleanup(
  allocations: PCAAllocation[],
  pendingFTE: Record<Team, number>,
  pcaPool: PCAData[],
  pcaPreferences: PCAPreference[],
  teamPrefs: Record<Team, TeamPreferenceInfo>,
  tracker: AllocationTracker,
  recordAssignmentWithOrder: (team: Team, log: Parameters<typeof recordAssignment>[2]) => void
): Promise<void> {
  const allocationByStaffId = new Map<string, PCAAllocation>()
  allocations.forEach((allocation) => {
    if (!allocationByStaffId.has(allocation.staff_id)) {
      allocationByStaffId.set(allocation.staff_id, allocation)
    }
  })

  // Find PCAs with unassigned slots
  const pcasWithSlots = pcaPool.filter(pca => {
    if (pca.fte_pca <= 0) return false
    const alloc = allocationByStaffId.get(pca.id)
    if (!alloc) return true  // No allocation yet = all slots available
    return alloc.fte_remaining > 0
  })
  
  for (const pca of pcasWithSlots) {
    // Re-sort teams by pendingFTE each iteration
    const sortedTeams = [...TEAMS].sort((a, b) => pendingFTE[b] - pendingFTE[a])
    
  for (const team of sortedTeams) {
      if (pendingFTE[team] <= 0) continue

      const allocation = getOrCreateAllocation(pca.id, pca.name, pca.fte_pca, pca.leave_type, team, allocations)
      if (allocation.fte_remaining <= 0) break  // This PCA is exhausted

      const pref = teamPrefs[team]
      const { teamFloor, gymSlot, avoidGym } = pref
      
      const existingSlots = getTeamExistingSlots(team, allocations)

      // Assign one slot at a time in Cycle 3
      let result = assignOneSlotAndUpdatePending({
        pca,
        allocation,
        team,
        teamExistingSlots: existingSlots,
        gymSlot,
        avoidGym,
        pendingFTEByTeam: pendingFTE,
        context: 'Cleanup pass → one slot at a time',
      })

      // Soft gym-avoid (Cycle 3 only):
      // If a team is still short (>= 0.25) and the ONLY feasible assignment from this PCA
      // requires using the gym slot, allow it as a last resort.
      if (
        result.slotsAssigned.length === 0 &&
        avoidGym &&
        typeof gymSlot === 'number' &&
        (pendingFTE[team] ?? 0) >= 0.25
      ) {
        // Only relax gym avoidance when the team has NO feasible non-gym assignments left
        // anywhere in the pool (true last resort, not dependent on PCA iteration order).
        const hasAnyNonGymCandidate = findAvailablePCAs({
          pcaPool,
          team,
          teamFloor: pref.teamFloor,
          floorMatch: 'any',
          excludePreferredOfOtherTeams: false,
          preferredPCAIdsOfOtherTeams: new Map<string, Team[]>(),
          pendingFTEPerTeam: pendingFTE,
          existingAllocations: allocations,
          gymSlot,
          avoidGym: true,
        }).length > 0

        if (hasAnyNonGymCandidate) {
          // Skip gym-slot assignment here; a non-gym option exists elsewhere in the pool.
          // Continue Cycle 3 so we only use gym if it becomes truly unavoidable.
          continue
        }

        const simulate = assignSlotsToTeam({
          pca,
          allocation: { ...allocation },
          team,
          pendingFTE: 0.25,
          teamExistingSlots: existingSlots,
          gymSlot,
          avoidGym: false,
        })

        if (simulate.slotsAssigned.length > 0) {
          result = assignOneSlotAndUpdatePending({
            pca,
            allocation,
            team,
            teamExistingSlots: existingSlots,
            gymSlot,
            avoidGym: false,
            pendingFTEByTeam: pendingFTE,
            context: 'Cleanup pass → one slot at a time',
          })
        }
      }
      
      if (result.slotsAssigned.length > 0) {
        for (const slot of result.slotsAssigned) {
          recordAssignmentWithOrder(team, {
            slot,
            pcaId: pca.id,
            pcaName: pca.name,
            assignedIn: 'step34',
            cycle: 3,
            wasPreferredSlot: false,
            wasPreferredPCA: pref.preferredPCAIds.includes(pca.id),
            wasFloorPCA: undefined,  // Not from floor/non-floor loop - from preferred PCA
            amPmBalanceAchieved: result.amPmBalanced,
            gymSlotAvoided: gymSlot !== null && slot !== gymSlot,
          })
        }
      }

      // After assigning, check if PCA is exhausted
      if (allocation.fte_remaining <= 0) break
    }
  }
}

