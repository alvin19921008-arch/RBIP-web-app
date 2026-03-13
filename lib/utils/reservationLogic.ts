/**
 * Reservation Logic for Step 3.2
 * 
 * Computes slot reservations for teams with (preferred PCA + preferred slot) preferences.
 * A reservation marks a specific slot on a specific PCA as "reserved" for a team.
 * Reservations are not guaranteed assignments - users must approve via UI.
 */

import { Team, Weekday } from '@/types/staff'
import { PCAAllocation } from '@/types/schedule'
import { PCAPreference, SpecialProgram } from '@/types/allocation'
import { PCAData } from '@/lib/algorithms/pcaAllocation'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import {
  buildReservationRuntimeProgramsById,
  getAllocationSpecialProgramNameForSlot,
  isAllocationSlotFromSpecialProgram,
} from '@/lib/utils/scheduleReservationRuntime'
import {
  assignSlotIfValid,
  findAvailablePCAs,
  getSlotTeam,
  type StaffOverrideWithSubstitution,
} from '@/lib/utils/floatingPCAHelpers'

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

// Team reservation info: which slot and which PCAs are reserved for this team
export interface TeamReservation {
  slot: number  // The preferred slot (1-4)
  pcaIds: string[]  // Preferred PCA IDs that have this slot available
  pcaNames: Record<string, string>  // Map of pcaId -> name for display
}

// Map of team -> reservation info (null if no reservation)
export type TeamReservations = Record<Team, TeamReservation | null>

// For conflict tracking: PCA -> Slot -> Teams that reserved this
export type PCASlotReservations = Record<string, Record<number, Team[]>>

// User selection: which reserved slot to actually assign
export interface SlotAssignment {
  team: Team
  slot: number
  pcaId: string
  pcaName: string
}

export interface Step30AutoBufferParams {
  currentPendingFTE: Record<Team, number>
  currentAllocations: PCAAllocation[]
  floatingPCAs: PCAData[]
  bufferFloatingPCAIds: string[]
  teamOrder: Team[]
  ratio: number
}

export interface Step30AutoBufferResult {
  step30Assignments: SlotAssignment[]
  updatedPendingFTE: Record<Team, number>
  updatedAllocations: PCAAllocation[]
}

// Result of computing reservations
export interface ReservationResult {
  teamReservations: TeamReservations
  pcaSlotReservations: PCASlotReservations
  hasAnyReservations: boolean
}

/**
 * Computes slot reservations for all teams based on:
 * - Team preferences (preferred_pca_ids + preferred_slots)
 * - Adjusted pending FTE from Step 3.1
 * - Floating PCA availability
 * - Existing allocations from previous steps
 * - Substitution slots (from staffOverrides) - these should be excluded
 * 
 * @param pcaPreferences Team PCA preferences from database
 * @param adjustedPendingFTE Adjusted pending FTE from Step 3.1
 * @param floatingPCAs Available floating PCAs with their data
 * @param existingAllocations Allocations from Step 2 (slots already assigned)
 * @param staffOverrides Staff overrides including substitution info (optional)
 */
export function computeReservations(
  pcaPreferences: PCAPreference[],
  adjustedPendingFTE: Record<Team, number>,
  floatingPCAs: PCAData[],
  existingAllocations: PCAAllocation[],
  staffOverrides?: Record<string, StaffOverrideWithSubstitution>
): ReservationResult {
  // Initialize empty reservations
  const teamReservations: TeamReservations = {
    FO: null, SMM: null, SFM: null, CPPC: null, MC: null, GMC: null, NSM: null, DRO: null
  }
  const pcaSlotReservations: PCASlotReservations = {}

  const floatingPcaById = new Map<string, PCAData>()
  floatingPCAs.forEach((pca) => {
    if (!floatingPcaById.has(pca.id)) {
      floatingPcaById.set(pca.id, pca)
    }
  })

  // Process each team's preferences
  for (const pref of pcaPreferences) {
    const team = pref.team
    
    // Skip if no preferred PCA OR no preferred slot (need BOTH)
    if (!pref.preferred_pca_ids || pref.preferred_pca_ids.length === 0) continue
    if (!pref.preferred_slots || pref.preferred_slots.length === 0) continue
    
    // Skip if team's adjusted pendingFTE <= 0
    const pendingFTE = roundToNearestQuarterWithMidpoint(adjustedPendingFTE[team] || 0)
    if (pendingFTE <= 0) continue
    
    const preferredSlot = pref.preferred_slots[0]  // Only 1 slot allowed per UI constraint
    const reservedPCAIds: string[] = []
    const pcaNames: Record<string, string> = {}

    const eligiblePreferredIds = new Set(
      findAvailablePCAs({
        pcaPool: floatingPCAs,
        team,
        teamFloor: null,
        floorMatch: 'any',
        excludePreferredOfOtherTeams: false,
        preferredPCAIdsOfOtherTeams: new Map(),
        pendingFTEPerTeam: adjustedPendingFTE,
        requiredSlot: preferredSlot,
        existingAllocations,
        gymSlot: null,
        avoidGym: false,
        staffOverrides,
      }).map((pca) => pca.id)
    )

    // Preserve the original preferred-PCA order from the team preference record.
    for (const pcaId of pref.preferred_pca_ids) {
      if (!eligiblePreferredIds.has(pcaId)) continue

      const pca = floatingPcaById.get(pcaId)
      if (!pca) continue

      reservedPCAIds.push(pcaId)
      pcaNames[pcaId] = pca.name

      if (!pcaSlotReservations[pcaId]) {
        pcaSlotReservations[pcaId] = {}
      }
      if (!pcaSlotReservations[pcaId][preferredSlot]) {
        pcaSlotReservations[pcaId][preferredSlot] = []
      }
      pcaSlotReservations[pcaId][preferredSlot].push(team)
    }
    
    // If any PCAs are available for this slot, create reservation
    if (reservedPCAIds.length > 0) {
      teamReservations[team] = {
        slot: preferredSlot,
        pcaIds: reservedPCAIds,
        pcaNames,
      }
    }
  }
  
  // Check if there are any reservations
  const hasAnyReservations = TEAMS.some(team => teamReservations[team] !== null)
  
  return {
    teamReservations,
    pcaSlotReservations,
    hasAnyReservations,
  }
}

/**
 * Executes the slot assignments selected by the user.
 * Updates pending FTE and creates allocation entries.
 * 
 * @param assignments User-selected slot assignments
 * @param adjustedPendingFTE Current adjusted pending FTE
 * @param existingAllocations Current allocations
 * @param floatingPCAs Floating PCA data for FTE tracking
 * @returns Updated pending FTE and new allocations to add
 */
export function executeSlotAssignments(
  assignments: SlotAssignment[],
  adjustedPendingFTE: Record<Team, number>,
  existingAllocations: PCAAllocation[],
  floatingPCAs: PCAData[]
): {
  updatedPendingFTE: Record<Team, number>
  updatedAllocations: PCAAllocation[]
  pcaFTEChanges: Record<string, number>  // pcaId -> new FTE remaining
} {
  // Clone the pending FTE
  const updatedPendingFTE = { ...adjustedPendingFTE }
  
  // Clone existing allocations
  const updatedAllocations = existingAllocations.map(a => ({ ...a }))

  const allocationByStaffId = new Map<string, PCAAllocation>()
  updatedAllocations.forEach((allocation) => {
    if (!allocationByStaffId.has(allocation.staff_id)) {
      allocationByStaffId.set(allocation.staff_id, allocation)
    }
  })

  const floatingPcaById = new Map<string, PCAData>()
  floatingPCAs.forEach((pca) => {
    if (!floatingPcaById.has(pca.id)) {
      floatingPcaById.set(pca.id, pca)
    }
  })
  
  // Track FTE changes for PCAs
  const pcaFTEChanges: Record<string, number> = {}
  
  for (const assignment of assignments) {
    const { team, slot, pcaId } = assignment

    // Step 3.2 / 3.3 reservations must not consume more than the team's
    // remaining pending quarter-slots, even if the UI queued extra selections.
    const pendingBeforeAssignment = roundToNearestQuarterWithMidpoint(updatedPendingFTE[team] || 0)
    if (pendingBeforeAssignment < 0.25) {
      continue
    }

    const canStillExecute = findAvailablePCAs({
      pcaPool: floatingPCAs,
      team,
      teamFloor: null,
      floorMatch: 'any',
      excludePreferredOfOtherTeams: false,
      preferredPCAIdsOfOtherTeams: new Map(),
      pendingFTEPerTeam: updatedPendingFTE,
      requiredSlot: slot,
      existingAllocations: updatedAllocations,
      gymSlot: null,
      avoidGym: false,
    }).some((pca) => pca.id === pcaId)

    if (!canStillExecute) {
      continue
    }
    
    // Decrement team's pending FTE by 0.25
    updatedPendingFTE[team] = Math.max(0, (updatedPendingFTE[team] || 0) - 0.25)
    
    // Find or create allocation for this PCA
    let allocation = allocationByStaffId.get(pcaId)
    
    if (!allocation) {
      // Create new allocation
      const pca = floatingPcaById.get(pcaId)
      allocation = {
        id: crypto.randomUUID(),
        schedule_id: '',  // Will be set when saving
        staff_id: pcaId,
        team: team,  // Primary team (first assigned)
        fte_pca: pca?.fte_pca || 1,
        fte_remaining: (pca?.fte_pca || 1) - 0.25,
        slot_assigned: 0.25,
        slot_whole: null,
        slot1: slot === 1 ? team : null,
        slot2: slot === 2 ? team : null,
        slot3: slot === 3 ? team : null,
        slot4: slot === 4 ? team : null,
        leave_type: pca?.leave_type || null,
        special_program_ids: null,
      }
      updatedAllocations.push(allocation)
      allocationByStaffId.set(pcaId, allocation)
    } else {
      // Update existing allocation - assign the slot to this team
      if (assignSlotIfValid({ allocation, slot, team, minFteRemaining: 0.25 })) {
        allocation.fte_remaining = Math.max(0, allocation.fte_remaining - 0.25)
        allocation.slot_assigned = (allocation.slot_assigned || 0) + 0.25
      }
    }

    // Track PCA FTE change
    pcaFTEChanges[pcaId] = allocation.fte_remaining
  }
  
  return {
    updatedPendingFTE,
    updatedAllocations,
    pcaFTEChanges,
  }
}

export function simulateStep30BufferPreAssignments(
  params: Step30AutoBufferParams
): Step30AutoBufferResult {
  const {
    currentPendingFTE,
    currentAllocations,
    floatingPCAs,
    bufferFloatingPCAIds,
    teamOrder,
    ratio,
  } = params

  let updatedPendingFTE = { ...currentPendingFTE }
  let updatedAllocations = currentAllocations.map((allocation) => ({ ...allocation }))
  const step30Assignments: SlotAssignment[] = []

  const normalizedRatio = Math.max(0, Math.min(1, ratio || 0))
  if (normalizedRatio <= 0) {
    return { step30Assignments, updatedPendingFTE, updatedAllocations }
  }

  const countAssignedSlots = (alloc: PCAAllocation) => {
    let n = 0
    if (alloc.slot1) n++
    if (alloc.slot2) n++
    if (alloc.slot3) n++
    if (alloc.slot4) n++
    return n
  }

  const pickNextTeam = (pending: Record<Team, number>): Team | null => {
    let best: Team | null = null
    let bestVal = -Infinity
    for (const team of teamOrder) {
      const value = pending[team] || 0
      if (value > bestVal) {
        bestVal = value
        best = team
      }
    }
    if (!best) return null
    return (pending[best] || 0) > 0 ? best : null
  }

  for (const pcaId of bufferFloatingPCAIds) {
    const pca = floatingPCAs.find((candidate) => candidate.id === pcaId)
    if (!pca) continue

    const totalSlots = Math.max(0, Math.min(4, Math.round((pca.fte_pca || 0) / 0.25)))
    if (totalSlots <= 0) continue

    const existing = updatedAllocations.find((allocation) => allocation.staff_id === pcaId)
    const already = existing ? countAssignedSlots(existing) : 0
    const remainingSlots = Math.max(0, totalSlots - already)
    const target = Math.max(0, Math.min(remainingSlots, Math.floor(remainingSlots * normalizedRatio)))
    if (target <= 0) continue

    const validFreeSlots = [1, 2, 3, 4].filter((slot) =>
      findAvailablePCAs({
        pcaPool: floatingPCAs,
        team: 'FO',
        teamFloor: null,
        floorMatch: 'any',
        excludePreferredOfOtherTeams: false,
        preferredPCAIdsOfOtherTeams: new Map(),
        pendingFTEPerTeam: updatedPendingFTE,
        requiredSlot: slot,
        existingAllocations: updatedAllocations,
        gymSlot: null,
        avoidGym: false,
      }).some((candidate) => candidate.id === pcaId)
    )

    for (const slot of validFreeSlots.slice(0, target)) {
      const team = pickNextTeam(updatedPendingFTE)
      if (!team) break

      const assignment: SlotAssignment = { team, slot, pcaId, pcaName: pca.name }
      const result = executeSlotAssignments([assignment], updatedPendingFTE, updatedAllocations, floatingPCAs)

      const changed =
        JSON.stringify(result.updatedPendingFTE) !== JSON.stringify(updatedPendingFTE) ||
        JSON.stringify(result.updatedAllocations) !== JSON.stringify(updatedAllocations)

      updatedPendingFTE = result.updatedPendingFTE
      updatedAllocations = result.updatedAllocations

      if (changed) {
        step30Assignments.push(assignment)
      }
    }
  }

  return {
    step30Assignments,
    updatedPendingFTE,
    updatedAllocations,
  }
}

/**
 * Validates that no PCA slot is selected by more than one team.
 * Used for real-time validation in the UI.
 */
export function validateSelections(
  selections: SlotAssignment[]
): { valid: boolean; conflicts: string[] } {
  const conflicts: string[] = []
  
  // Group by PCA + slot
  const pcaSlotMap: Record<string, Team[]> = {}
  
  for (const selection of selections) {
    const key = `${selection.pcaId}:${selection.slot}`
    if (!pcaSlotMap[key]) {
      pcaSlotMap[key] = []
    }
    pcaSlotMap[key].push(selection.team)
  }
  
  // Check for duplicates
  for (const [key, teams] of Object.entries(pcaSlotMap)) {
    if (teams.length > 1) {
      const [pcaId, slot] = key.split(':')
      conflicts.push(`Slot ${slot} of PCA ${pcaId} selected by multiple teams: ${teams.join(', ')}`)
    }
  }
  
  return {
    valid: conflicts.length === 0,
    conflicts,
  }
}

/**
 * Checks if a specific PCA slot is selected by another team.
 * Used for auto-disabling checkboxes in the UI.
 */
export function isSlotSelectedByOtherTeam(
  pcaId: string,
  slot: number,
  team: Team,
  selections: SlotAssignment[]
): boolean {
  return selections.some(
    s => s.pcaId === pcaId && s.slot === slot && s.team !== team
  )
}

// ============================================================================
// Step 3.3: Adjacent Slot Reservations from Special Program PCAs
// ============================================================================

/**
 * Adjacent slot mapping: 1<->2, 3<->4
 * Slot 2 to 3 is NOT adjacent (different time periods: AM vs PM)
 */
const ADJACENT_SLOTS: Record<number, number> = {
  1: 2,
  2: 1,
  3: 4,
  4: 3,
}

/**
 * Information about an adjacent slot that can be assigned
 */
export interface AdjacentSlotInfo {
  pcaId: string
  pcaName: string
  specialProgramSlot: number  // The slot originally assigned by special program
  specialProgramName: string  // The name of the special program (e.g., "CRP", "Robotic")
  adjacentSlot: number        // The adjacent slot available for assignment
  team: Team                  // Team that has this special program assignment
}

/**
 * Map of team -> list of adjacent slot options
 * A team may have multiple adjacent slots available from different PCAs
 */
export type AdjacentSlotReservations = Record<Team, AdjacentSlotInfo[]>

/**
 * Result of computing adjacent slot reservations
 */
export interface AdjacentSlotResult {
  adjacentReservations: AdjacentSlotReservations
  hasAnyAdjacentReservations: boolean
}

function isSlotFromSpecialProgram(
  allocation: PCAAllocation,
  slot: number,
  team: Team,
  specialProgramsById: ReturnType<typeof buildReservationRuntimeProgramsById>
): boolean {
  return isAllocationSlotFromSpecialProgram({
    allocation,
    slot,
    team,
    specialProgramsById,
  })
}

function getSpecialProgramNameForSlot(
  allocation: PCAAllocation,
  slot: number,
  team: Team,
  specialProgramsById: ReturnType<typeof buildReservationRuntimeProgramsById>
): string {
  return getAllocationSpecialProgramNameForSlot({
    allocation,
    slot,
    team,
    specialProgramsById,
  })
}

/**
 * Computes adjacent slot reservations for Step 3.3.
 * 
 * For each PCA assigned to a team via special program in Step 2,
 * check if the adjacent slot (1<->2, 3<->4) is available.
 * If the team's pending FTE > 0 and the adjacent slot is not assigned,
 * offer it as an option to the user.
 * 
 * IMPORTANT: Only considers slots that were actually assigned by the special program,
 * not slots assigned later (e.g., from Step 3.2 preferred slot assignment).
 * 
 * @param currentPendingFTE Current pending FTE after Step 3.2 assignments
 * @param existingAllocations Allocations including Step 2 and 3.2 assignments
 * @param floatingPCAs Floating PCA data for name lookup
 * @param specialPrograms Special program definitions to identify which slots are from special programs
 */
export function computeAdjacentSlotReservations(
  currentPendingFTE: Record<Team, number>,
  existingAllocations: PCAAllocation[],
  floatingPCAs: PCAData[],
  specialPrograms: SpecialProgram[],
  staffOverrides?: Record<string, StaffOverrideWithSubstitution>,
  weekday?: Weekday
): AdjacentSlotResult {
  const specialProgramsByTeamCache = new Map<string, ReturnType<typeof buildReservationRuntimeProgramsById>>()
  const getSpecialProgramsByAllocationTeam = (allocationTeam: Team | null | undefined) => {
    const cacheKey = allocationTeam ?? '__null__'
    const cached = specialProgramsByTeamCache.get(cacheKey)
    if (cached) return cached
    const built = buildReservationRuntimeProgramsById({
      specialPrograms,
      weekday,
      staffOverrides: staffOverrides as Record<string, unknown> | undefined,
      allocationTargetTeam: allocationTeam ?? null,
    })
    specialProgramsByTeamCache.set(cacheKey, built)
    return built
  }

  // Initialize empty reservations for all teams
  const adjacentReservations: AdjacentSlotReservations = {
    FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
  }

  const floatingPcaById = new Map<string, PCAData>()
  floatingPCAs.forEach((pca) => {
    if (!floatingPcaById.has(pca.id)) {
      floatingPcaById.set(pca.id, pca)
    }
  })
  
  // Find allocations that were assigned via special program
  const specialProgramAllocations = existingAllocations.filter(
    alloc => alloc.special_program_ids && alloc.special_program_ids.length > 0
  )
  
  for (const allocation of specialProgramAllocations) {
    const specialProgramsById = getSpecialProgramsByAllocationTeam(allocation.team)
    const pca = floatingPcaById.get(allocation.staff_id)
    const pcaName = pca?.name || 'Unknown PCA'
    
    // Check each slot in this allocation
    const slots = [
      { slot: 1, team: allocation.slot1 },
      { slot: 2, team: allocation.slot2 },
      { slot: 3, team: allocation.slot3 },
      { slot: 4, team: allocation.slot4 },
    ]
    
    for (const { slot, team } of slots) {
      if (!team) continue  // Slot not assigned
      
      // CRITICAL: Only process slots that were actually assigned by the special program
      // Skip slots assigned later (e.g., from Step 3.2 preferred slot assignment)
      if (!isSlotFromSpecialProgram(allocation, slot, team, specialProgramsById)) {
        continue
      }
      
      // Check if team's pending FTE > 0
      const pendingFTE = roundToNearestQuarterWithMidpoint(currentPendingFTE[team] || 0)
      if (pendingFTE <= 0) {
        continue
      }
      
      // Get the adjacent slot
      const adjacentSlot = ADJACENT_SLOTS[slot]
      if (!adjacentSlot) {
        continue
      }
      
      const canStillReserveAdjacentSlot = findAvailablePCAs({
        pcaPool: floatingPCAs,
        team,
        teamFloor: null,
        floorMatch: 'any',
        excludePreferredOfOtherTeams: false,
        preferredPCAIdsOfOtherTeams: new Map(),
        pendingFTEPerTeam: currentPendingFTE,
        requiredSlot: adjacentSlot,
        existingAllocations,
        gymSlot: null,
        avoidGym: false,
        staffOverrides,
      }).some((pca) => pca.id === allocation.staff_id)

      if (!canStillReserveAdjacentSlot) {
        continue
      }
      
      // Check if this adjacent slot is already in the team's reservations
      // (avoid duplicates if same PCA has multiple special program slots)
      const existingReservation = adjacentReservations[team].find(
        r => r.pcaId === allocation.staff_id && r.adjacentSlot === adjacentSlot
      )
      if (existingReservation) {
        continue
      }
      
      // Add to reservations
      const specialProgramName = getSpecialProgramNameForSlot(
        allocation,
        slot,
        team,
        specialProgramsById
      )
      adjacentReservations[team].push({
        pcaId: allocation.staff_id,
        pcaName,
        specialProgramSlot: slot,
        specialProgramName,
        adjacentSlot,
        team,
      })
    }
  }
  
  // Check if there are any reservations
  const hasAnyAdjacentReservations = TEAMS.some(
    team => adjacentReservations[team].length > 0
  )
  
  return {
    adjacentReservations,
    hasAnyAdjacentReservations,
  }
}


