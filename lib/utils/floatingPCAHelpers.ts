/**
 * Floating PCA Allocation Helpers
 * 
 * Reusable functions for the revised Step 3.4 floating PCA allocation algorithm.
 * Includes floor matching, slot assignment, availability checks, and tracking.
 */

import { Team } from '@/types/staff'
import { PCAAllocation, SlotAssignmentLog, TeamAllocationLog, AllocationTracker } from '@/types/schedule'
import { PCAPreference } from '@/types/allocation'
import { PCAData } from '@/lib/algorithms/pcaAllocation'

// ============================================================================
// Constants
// ============================================================================

export const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
export const AM_SLOTS = [1, 2]
export const PM_SLOTS = [3, 4]
export const ALL_SLOTS = [1, 2, 3, 4]

function getNormalizedPcaAvailableSlots(pca: { availableSlots?: number[] } | null | undefined): number[] | null {
  const slots = pca?.availableSlots
  if (!Array.isArray(slots)) return null
  // Treat empty array as "no availability" (not "all slots").
  if (slots.length === 0) return []
  // Defensive: only accept valid slot numbers 1-4.
  return slots.filter((s) => s === 1 || s === 2 || s === 3 || s === 4)
}

// ============================================================================
// Floor PCA Matching
// ============================================================================

/**
 * Check if a PCA is a floor-matched PCA for a given team floor.
 * A PCA with ['upper', 'lower'] matches both floors.
 */
export function isFloorPCAForTeam(
  pca: PCAData & { floor_pca?: ('upper' | 'lower')[] | null },
  teamFloor: 'upper' | 'lower' | null
): boolean {
  if (!teamFloor) return false
  if (!pca.floor_pca || pca.floor_pca.length === 0) return false
  return pca.floor_pca.includes(teamFloor)
}

/**
 * Get the floor preference for a team from PCA preferences.
 */
export function getTeamFloor(
  team: Team,
  pcaPreferences: PCAPreference[]
): 'upper' | 'lower' | null {
  const pref = pcaPreferences.find(p => p.team === team)
  return pref?.floor_pca_selection ?? null
}

// ============================================================================
// Slot Helpers
// ============================================================================

/**
 * Get which team owns a specific slot in an allocation.
 */
export function getSlotTeam(allocation: PCAAllocation, slot: number): Team | null {
  switch (slot) {
    case 1: return allocation.slot1
    case 2: return allocation.slot2
    case 3: return allocation.slot3
    case 4: return allocation.slot4
    default: return null
  }
}

/**
 * Set a slot assignment in an allocation (mutates the allocation).
 */
export function setSlotTeam(allocation: PCAAllocation, slot: number, team: Team): void {
  switch (slot) {
    case 1: allocation.slot1 = team; break
    case 2: allocation.slot2 = team; break
    case 3: allocation.slot3 = team; break
    case 4: allocation.slot4 = team; break
  }
}

/**
 * Get all assigned slots for a team from an allocation.
 */
export function getTeamSlotsFromAllocation(allocation: PCAAllocation, team: Team): number[] {
  const slots: number[] = []
  if (allocation.slot1 === team) slots.push(1)
  if (allocation.slot2 === team) slots.push(2)
  if (allocation.slot3 === team) slots.push(3)
  if (allocation.slot4 === team) slots.push(4)
  return slots
}

/**
 * Get all available (unassigned) slots from an allocation.
 */
export function getAvailableSlotsFromAllocation(allocation: PCAAllocation): number[] {
  const slots: number[] = []
  if (allocation.slot1 === null) slots.push(1)
  if (allocation.slot2 === null) slots.push(2)
  if (allocation.slot3 === null) slots.push(3)
  if (allocation.slot4 === null) slots.push(4)
  return slots
}

/**
 * Check if a slot is available for a team, considering gym slot avoidance.
 */
export function isSlotAvailableForTeam(
  allocation: PCAAllocation,
  slot: number,
  gymSlot: number | null,
  avoidGym: boolean
): boolean {
  // 1. Check if slot is already assigned
  const slotTeam = getSlotTeam(allocation, slot)
  if (slotTeam !== null) return false
  
  // 2. Check gym slot avoidance
  if (avoidGym && gymSlot === slot) return false
  
  return true
}

/**
 * Get available slots for a team, filtered by gym avoidance.
 */
export function getAvailableSlotsForTeam(
  allocation: PCAAllocation,
  gymSlot: number | null,
  avoidGym: boolean
): number[] {
  return ALL_SLOTS.filter(slot => isSlotAvailableForTeam(allocation, slot, gymSlot, avoidGym))
}

// ============================================================================
// Find Available PCAs
// ============================================================================

export interface FindAvailablePCAsOptions {
  pcaPool: (PCAData & { floor_pca?: ('upper' | 'lower')[] | null })[]
  team: Team
  teamFloor: 'upper' | 'lower' | null
  floorMatch: 'same' | 'different' | 'any'
  excludePreferredOfOtherTeams: boolean
  preferredPCAIdsOfOtherTeams: Map<string, Team[]>  // Only teams with pendingFTE > 0
  pendingFTEPerTeam: Record<Team, number>  // For checking if other teams still need slots
  requiredSlot?: number  // Only return PCAs with this slot available
  existingAllocations: PCAAllocation[]
  gymSlot?: number | null
  avoidGym?: boolean
}

/**
 * Find available floating PCAs matching the specified criteria.
 * Returns PCAs sorted by FTE remaining (highest first).
 */
export function findAvailablePCAs(options: FindAvailablePCAsOptions): (PCAData & { floor_pca?: ('upper' | 'lower')[] | null })[] {
  const {
    pcaPool,
    team,
    teamFloor,
    floorMatch,
    excludePreferredOfOtherTeams,
    preferredPCAIdsOfOtherTeams,
    pendingFTEPerTeam,
    requiredSlot,
    existingAllocations,
    gymSlot,
    avoidGym,
  } = options

  // Build a first-allocation index once per call to avoid repeated O(n) scans in filter/sort.
  const allocationByStaffId = new Map<string, PCAAllocation>()
  for (const allocation of existingAllocations) {
    if (!allocationByStaffId.has(allocation.staff_id)) {
      allocationByStaffId.set(allocation.staff_id, allocation)
    }
  }

  return pcaPool
    .filter(pca => {
      // 1. Must be floating and on duty
      if (!pca.floating) return false
      if (pca.fte_pca <= 0) return false
      
      // 2. Check floor matching
      // If teamFloor is not declared, do NOT filter by floor.
      if (teamFloor) {
        if (floorMatch === 'same') {
          if (!isFloorPCAForTeam(pca, teamFloor)) return false
        } else if (floorMatch === 'different') {
          if (isFloorPCAForTeam(pca, teamFloor)) return false
        }
      }
      // 'any' = no floor filtering
      
      // 3. Check if excluded due to being preferred by other teams
      if (excludePreferredOfOtherTeams) {
        const teamsPreferringThisPCA = preferredPCAIdsOfOtherTeams.get(pca.id) || []
        // Only exclude if those teams still have pendingFTE > 0
        const teamsStillNeedingSlots = teamsPreferringThisPCA.filter(
          t => t !== team && (pendingFTEPerTeam[t] || 0) > 0
        )
        if (teamsStillNeedingSlots.length > 0) return false
      }
      
      const pcaAvail = getNormalizedPcaAvailableSlots(pca)

      // 4. Get or create allocation for this PCA
      const allocation = allocationByStaffId.get(pca.id)
      
      // 5. Check if required slot is available (if specified)
      if (requiredSlot !== undefined) {
        // Respect PCA slot availability (if present)
        if (pcaAvail && !pcaAvail.includes(requiredSlot)) return false
        if (!allocation) {
          // No allocation yet, slot is available (unless it's gym slot)
          if (avoidGym && gymSlot === requiredSlot) return false
        } else {
          if (!isSlotAvailableForTeam(allocation, requiredSlot, gymSlot ?? null, avoidGym ?? false)) {
            return false
          }
        }
      } else {
        // Check if PCA has any available slots
        // If PCA has explicit availableSlots and none are valid, treat as unavailable.
        if (pcaAvail && pcaAvail.length === 0) return false
        if (allocation) {
          const freeSlots = getAvailableSlotsForTeam(allocation, gymSlot ?? null, avoidGym ?? false)
          const usableSlots = pcaAvail ? freeSlots.filter((s) => pcaAvail.includes(s)) : freeSlots
          if (usableSlots.length === 0) return false
        } else if (pcaAvail) {
          // No allocation yet: the PCA can only work its declared availableSlots.
          const usableSlots = (avoidGym && typeof gymSlot === 'number')
            ? pcaAvail.filter((s) => s !== gymSlot)
            : pcaAvail
          if (usableSlots.length === 0) return false
        }
      }
      
      // 6. Check if PCA has FTE remaining
      if (allocation && allocation.fte_remaining <= 0) return false
      
      return true
    })
    .sort((a, b) => {
      // Sort by FTE remaining (highest first)
      const aAlloc = allocationByStaffId.get(a.id)
      const bAlloc = allocationByStaffId.get(b.id)
      const aFTE = aAlloc?.fte_remaining ?? a.fte_pca
      const bFTE = bAlloc?.fte_remaining ?? b.fte_pca
      return bFTE - aFTE
    })
}

// ============================================================================
// Slot Assignment with AM/PM Balancing
// ============================================================================

export interface AssignSlotsOptions {
  pca: PCAData & { floor_pca?: ('upper' | 'lower')[] | null }
  allocation: PCAAllocation
  team: Team
  pendingFTE: number
  teamExistingSlots: number[]  // Slots already assigned to this team (for overlap check)
  gymSlot: number | null
  avoidGym: boolean
  preferredSlot?: number  // If specified, try to assign this slot first
}

export interface AssignSlotsResult {
  slotsAssigned: number[]
  newPendingFTE: number
  amPmBalanced: boolean
}

// ============================================================================
// Safe Pending FTE Update Wrappers (prevents local/global overwrite bugs)
// ============================================================================

const ONE_SLOT_FTE = 0.25 as const

/**
 * Human-readable context for debugging / instrumentation.
 * Keep these labels aligned with the Step 3.4 narrative shown to users.
 */
export type PendingUpdateContext =
  | 'Preferred PCA + preferred slot → preferred slot from preferred PCA'
  | 'Preferred PCA + preferred slot → preferred slot from floor PCA'
  | 'Preferred PCA + preferred slot → preferred slot from non-floor PCA'
  | 'Preferred PCA + preferred slot → fill remaining from preferred PCA'
  | 'Preferred slot only → preferred slot from floor PCA'
  | 'Preferred slot only → preferred slot from non-floor PCA'
  | 'Preferred slot only → fill remaining from same PCA'
  | 'Preferred PCA only → fill from preferred PCA'
  | 'No preferences → floor PCA fallback'
  | 'Floor PCA fallback'
  | 'Non-floor PCA fallback'
  | 'Cleanup pass → one slot at a time'

export interface AssignAndUpdatePendingResult extends AssignSlotsResult {
  pendingBefore: number
  pendingAfter: number
  context?: PendingUpdateContext
}

/**
 * Assign exactly ONE slot (0.25) and update the team's global pendingFTE record.
 *
 * This is the safe way to do "local request" calls. It prevents regressions where
 * callers accidentally overwrite the team's global pending with result.newPendingFTE
 * (which is only the local remaining for the 0.25 request).
 */
export function assignOneSlotAndUpdatePending(
  options: Omit<AssignSlotsOptions, 'pendingFTE'> & {
    pendingFTEByTeam: Record<Team, number>
    context?: PendingUpdateContext
  }
): AssignAndUpdatePendingResult {
  const { pendingFTEByTeam, team, context, ...rest } = options
  const pendingBefore = pendingFTEByTeam[team] ?? 0

  // If remaining need is less than one slot, treat as complete (avoid accidental over-fill).
  if (pendingBefore < ONE_SLOT_FTE) {
    return {
      slotsAssigned: [],
      newPendingFTE: 0,
      amPmBalanced: false,
      pendingBefore,
      pendingAfter: pendingBefore,
      context,
    }
  }

  const result = assignSlotsToTeam({
    ...rest,
    team,
    pendingFTE: ONE_SLOT_FTE,
  })

  const pendingAfter = Math.max(0, pendingBefore - result.slotsAssigned.length * ONE_SLOT_FTE)
  pendingFTEByTeam[team] = pendingAfter

  return {
    ...result,
    pendingBefore,
    pendingAfter,
    context,
  }
}

/**
 * Assign up to the team's current pendingFTE (global request) and update the team's global pendingFTE record.
 *
 * This is the safe way to do "global request" calls where result.newPendingFTE is valid to store back.
 */
export function assignUpToPendingAndUpdatePending(
  options: Omit<AssignSlotsOptions, 'pendingFTE'> & {
    pendingFTEByTeam: Record<Team, number>
    context?: PendingUpdateContext
  }
): AssignAndUpdatePendingResult {
  const { pendingFTEByTeam, team, context, ...rest } = options
  const pendingBefore = pendingFTEByTeam[team] ?? 0

  if (pendingBefore <= 0) {
    return {
      slotsAssigned: [],
      newPendingFTE: 0,
      amPmBalanced: false,
      pendingBefore,
      pendingAfter: pendingBefore,
      context,
    }
  }

  const result = assignSlotsToTeam({
    ...rest,
    team,
    pendingFTE: pendingBefore,
  })

  pendingFTEByTeam[team] = result.newPendingFTE

  return {
    ...result,
    pendingBefore,
    pendingAfter: result.newPendingFTE,
    context,
  }
}

/**
 * Assign slots from a PCA to a team with AM/PM balancing.
 * Mutates the allocation object.
 * 
 * AM/PM Balancing Logic:
 * - pendingFTE = 0.25: Prefer slot where team has no PCA yet
 * - pendingFTE = 0.5 & PCA FTE >= 0.75: Try to get 1 AM + 1 PM slot
 * - pendingFTE = 0.75: Try to get balanced (2 AM + 1 PM or 1 AM + 2 PM)
 * - pendingFTE >= 1.0: Assign as many as possible, try to balance
 */
export function assignSlotsToTeam(options: AssignSlotsOptions): AssignSlotsResult {
  const {
    pca,
    allocation,
    team,
    pendingFTE,
    teamExistingSlots,
    gymSlot,
    avoidGym,
    preferredSlot,
  } = options

  const slotsAssigned: number[] = []
  let remainingPendingFTE = pendingFTE
  
  // Get available slots for this allocation
  const pcaAvail = getNormalizedPcaAvailableSlots(pca)
  if (pcaAvail && pcaAvail.length === 0) {
    return { slotsAssigned: [], newPendingFTE: pendingFTE, amPmBalanced: false }
  }

  const availableSlotsRaw = getAvailableSlotsForTeam(allocation, gymSlot, avoidGym)
  const availableSlots = pcaAvail ? availableSlotsRaw.filter((s) => pcaAvail.includes(s)) : availableSlotsRaw
  if (availableSlots.length === 0) {
    return { slotsAssigned: [], newPendingFTE: pendingFTE, amPmBalanced: false }
  }
  
  // Calculate how many slots to assign (based on pendingFTE)
  // pendingFTE already accounts for buffer floating PCA slots assigned, so we just need to convert to slots
  // Round pendingFTE to nearest 0.25 to avoid floating point precision issues (e.g., 0.7500000001 / 0.25 = 4 instead of 3)
  const roundedPendingFTE = Math.round(pendingFTE * 4) / 4
  const slotsNeeded = Math.ceil(roundedPendingFTE / 0.25)
  const slotsToAssign = Math.min(slotsNeeded, availableSlots.length, Math.ceil(allocation.fte_remaining / 0.25))
  
  if (slotsToAssign <= 0) {
    return { slotsAssigned: [], newPendingFTE: pendingFTE, amPmBalanced: false }
  }
  
  // Categorize available slots
  const availableAM = availableSlots.filter(s => AM_SLOTS.includes(s))
  const availablePM = availableSlots.filter(s => PM_SLOTS.includes(s))
  
  // Check what the team already has
  const teamHasAM = teamExistingSlots.some(s => AM_SLOTS.includes(s))
  const teamHasPM = teamExistingSlots.some(s => PM_SLOTS.includes(s))
  
  // Assign slots with balancing logic
  const selectedSlots: number[] = []
  
  // First, handle preferred slot if specified
  if (preferredSlot !== undefined && availableSlots.includes(preferredSlot)) {
    selectedSlots.push(preferredSlot)
  }
  
  // Then apply AM/PM balancing for remaining slots
  const remainingSlotsToAssign = slotsToAssign - selectedSlots.length
  
  if (remainingSlotsToAssign > 0) {
    const remainingAvailable = availableSlots.filter(s => !selectedSlots.includes(s))
    const remainingAM = remainingAvailable.filter(s => AM_SLOTS.includes(s))
    const remainingPM = remainingAvailable.filter(s => PM_SLOTS.includes(s))
    
    // Determine optimal AM/PM split based on what team already has
    const prefersAM = !teamHasAM && teamHasPM  // Team has PM but no AM
    const prefersPM = teamHasAM && !teamHasPM  // Team has AM but no PM
    
    if (remainingSlotsToAssign === 1) {
      // Single slot: prefer the side team doesn't have yet
      if (prefersAM && remainingAM.length > 0) {
        selectedSlots.push(remainingAM[0])
      } else if (prefersPM && remainingPM.length > 0) {
        selectedSlots.push(remainingPM[0])
      } else if (remainingAvailable.length > 0) {
        // Default: prefer AM if no preference
        selectedSlots.push(remainingAvailable[0])
      }
    } else if (remainingSlotsToAssign >= 2) {
      // Try to balance: assign from both AM and PM if possible
      let amToAssign = Math.floor(remainingSlotsToAssign / 2)
      let pmToAssign = remainingSlotsToAssign - amToAssign
      
      // Adjust based on availability
      if (remainingAM.length < amToAssign) {
        pmToAssign += amToAssign - remainingAM.length
        amToAssign = remainingAM.length
      }
      if (remainingPM.length < pmToAssign) {
        amToAssign = Math.min(amToAssign + (pmToAssign - remainingPM.length), remainingAM.length)
        pmToAssign = remainingPM.length
      }
      
      // Assign AM slots
      for (let i = 0; i < amToAssign && i < remainingAM.length; i++) {
        selectedSlots.push(remainingAM[i])
      }
      
      // Assign PM slots
      for (let i = 0; i < pmToAssign && i < remainingPM.length; i++) {
        selectedSlots.push(remainingPM[i])
      }
    }
  }
  
  // Actually assign the selected slots
  for (const slot of selectedSlots) {
    setSlotTeam(allocation, slot, team)
    slotsAssigned.push(slot)
    remainingPendingFTE = Math.max(0, remainingPendingFTE - 0.25)
    allocation.fte_remaining = Math.max(0, allocation.fte_remaining - 0.25)
    allocation.slot_assigned = (allocation.slot_assigned || 0) + 0.25
  }
  
  // Check if AM/PM balance was achieved
  const allTeamSlots = [...teamExistingSlots, ...slotsAssigned]
  const hasAM = allTeamSlots.some(s => AM_SLOTS.includes(s))
  const hasPM = allTeamSlots.some(s => PM_SLOTS.includes(s))
  const amPmBalanced = hasAM && hasPM
  
  return {
    slotsAssigned,
    newPendingFTE: remainingPendingFTE,
    amPmBalanced,
  }
}

// ============================================================================
// Allocation Tracking
// ============================================================================

/**
 * Create an empty allocation tracker with initialized summary for all teams.
 */
export function createEmptyTracker(): AllocationTracker {
  const tracker: AllocationTracker = {} as AllocationTracker
  for (const team of TEAMS) {
    tracker[team] = {
      team,
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
        fulfilledByBuffer: false,
        allocationMode: undefined,
      },
    }
  }
  return tracker
}

/**
 * Record a slot assignment in the tracker.
 */
export function recordAssignment(
  tracker: AllocationTracker,
  team: Team,
  log: SlotAssignmentLog
): void {
  const teamLog = tracker[team]
  teamLog.assignments.push(log)
  
  // Update summary
  teamLog.summary.totalSlotsAssigned++
  
  if (log.assignedIn === 'step30') {
    teamLog.summary.fromStep30++
  } else if (log.assignedIn === 'step32') {
    teamLog.summary.fromStep32++
  } else if (log.assignedIn === 'step33') {
    teamLog.summary.fromStep33++
  } else if (log.assignedIn === 'step34') {
    if (log.cycle === 1) teamLog.summary.fromStep34Cycle1++
    else if (log.cycle === 2) teamLog.summary.fromStep34Cycle2++
    else if (log.cycle === 3) teamLog.summary.fromStep34Cycle3++
  }
  
  if (log.wasPreferredSlot) teamLog.summary.preferredSlotFilled = true
  if (log.wasPreferredPCA) teamLog.summary.preferredPCAsUsed++
  if (log.wasFloorPCA) teamLog.summary.floorPCAsUsed++
  if (log.wasFloorPCA === false) teamLog.summary.nonFloorPCAsUsed++
  if (log.amPmBalanceAchieved) teamLog.summary.amPmBalanced = true
  if (log.gymSlotAvoided === false) teamLog.summary.gymSlotUsed = true
}

/**
 * Finalize AM/PM balance status for all teams in the tracker.
 */
export function finalizeTrackerSummary(tracker: AllocationTracker): void {
  for (const team of TEAMS) {
    const teamLog = tracker[team]
    const slots = teamLog.assignments.map(a => a.slot)
    const hasAM = slots.some(s => AM_SLOTS.includes(s))
    const hasPM = slots.some(s => PM_SLOTS.includes(s))
    teamLog.summary.amPmBalanced = hasAM && hasPM
  }
}

// ============================================================================
// Build Preferred PCA Map
// ============================================================================

/**
 * Build a map of PCA ID -> teams that prefer this PCA.
 * Only includes teams with pendingFTE > 0.
 */
export function buildPreferredPCAMap(
  pcaPreferences: PCAPreference[],
  pendingFTEPerTeam: Record<Team, number>
): Map<string, Team[]> {
  const map = new Map<string, Team[]>()
  
  for (const pref of pcaPreferences) {
    if ((pendingFTEPerTeam[pref.team] || 0) <= 0) continue
    
    for (const pcaId of pref.preferred_pca_ids || []) {
      const existing = map.get(pcaId) || []
      existing.push(pref.team)
      map.set(pcaId, existing)
    }
  }
  
  return map
}

// ============================================================================
// Get Team Preference Info
// ============================================================================

export interface TeamPreferenceInfo {
  team: Team
  hasPreferredPCA: boolean
  hasPreferredSlot: boolean
  preferredPCAIds: string[]
  preferredSlot: number | null
  teamFloor: 'upper' | 'lower' | null
  gymSlot: number | null
  avoidGym: boolean
  condition: 'A' | 'B' | 'C' | 'D'
}

/**
 * Get preference info for a team.
 * Condition A: Preferred PCA + Preferred Slot
 * Condition B: Preferred Slot only
 * Condition C: Preferred PCA only
 * Condition D: No preferences
 */
export function getTeamPreferenceInfo(
  team: Team,
  pcaPreferences: PCAPreference[]
): TeamPreferenceInfo {
  const pref = pcaPreferences.find(p => p.team === team)
  
  const hasPreferredPCA = (pref?.preferred_pca_ids?.length || 0) > 0
  const hasPreferredSlot = (pref?.preferred_slots?.length || 0) > 0
  
  let condition: 'A' | 'B' | 'C' | 'D'
  if (hasPreferredPCA && hasPreferredSlot) {
    condition = 'A'
  } else if (hasPreferredSlot) {
    condition = 'B'
  } else if (hasPreferredPCA) {
    condition = 'C'
  } else {
    condition = 'D'
  }
  
  return {
    team,
    hasPreferredPCA,
    hasPreferredSlot,
    preferredPCAIds: pref?.preferred_pca_ids || [],
    preferredSlot: pref?.preferred_slots?.[0] ?? null,
    teamFloor: pref?.floor_pca_selection ?? null,
    gymSlot: pref?.gym_schedule ?? null,
    avoidGym: pref?.avoid_gym_schedule ?? false,
    condition,
  }
}

// ============================================================================
// Get or Create PCA Allocation
// ============================================================================

/**
 * Get existing allocation for a PCA or create a new one.
 */
export function getOrCreateAllocation(
  pcaId: string,
  pcaName: string,
  ftePca: number,
  leaveType: string | null,
  team: Team,
  existingAllocations: PCAAllocation[]
): PCAAllocation {
  let allocation = existingAllocations.find(a => a.staff_id === pcaId)
  
  if (!allocation) {
    allocation = {
      id: crypto.randomUUID(),
      schedule_id: '',  // Will be set when saving
      staff_id: pcaId,
      team: team,  // Primary team (first assigned)
      fte_pca: ftePca,
      fte_remaining: ftePca,
      slot_assigned: 0,
      slot_whole: null,
      slot1: null,
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: leaveType,
      special_program_ids: null,
    }
    existingAllocations.push(allocation)
  }
  
  return allocation
}

// ============================================================================
// Get Team's Existing Slots
// ============================================================================

/**
 * Get all slots already assigned to a team across all allocations.
 */
export function getTeamExistingSlots(
  team: Team,
  allocations: PCAAllocation[]
): number[] {
  const slots: number[] = []
  for (const alloc of allocations) {
    if (alloc.slot1 === team) slots.push(1)
    if (alloc.slot2 === team) slots.push(2)
    if (alloc.slot3 === team) slots.push(3)
    if (alloc.slot4 === team) slots.push(4)
  }
  return slots
}

