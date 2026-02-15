/**
 * Reservation Logic for Step 3.2
 * 
 * Computes slot reservations for teams with (preferred PCA + preferred slot) preferences.
 * A reservation marks a specific slot on a specific PCA as "reserved" for a team.
 * Reservations are not guaranteed assignments - users must approve via UI.
 */

import { Team } from '@/types/staff'
import { PCAAllocation } from '@/types/schedule'
import { PCAPreference, SpecialProgram } from '@/types/allocation'
import { PCAData } from '@/lib/algorithms/pcaAllocation'
import { roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { getAllSubstitutionSlots } from '@/lib/utils/substitutionFor'

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

// Result of computing reservations
export interface ReservationResult {
  teamReservations: TeamReservations
  pcaSlotReservations: PCASlotReservations
  hasAnyReservations: boolean
}

/**
 * Helper to get which team owns a specific slot in an allocation
 */
function getSlotTeam(allocation: PCAAllocation, slot: number): Team | null {
  switch (slot) {
    case 1: return allocation.slot1
    case 2: return allocation.slot2
    case 3: return allocation.slot3
    case 4: return allocation.slot4
    default: return null
  }
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
  staffOverrides?: Record<string, {
    substitutionFor?: { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team; slots: number[] }
    substitutionForBySlot?: Partial<Record<1 | 2 | 3 | 4, { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team }>>
    [key: string]: any
  }>
): ReservationResult {
  // Initialize empty reservations
  const teamReservations: TeamReservations = {
    FO: null, SMM: null, SFM: null, CPPC: null, MC: null, GMC: null, NSM: null, DRO: null
  }
  const pcaSlotReservations: PCASlotReservations = {}
  
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
    
    // Check each preferred PCA
    for (const pcaId of pref.preferred_pca_ids) {
      const pca = floatingPCAs.find(p => p.id === pcaId)
      
      // Skip if PCA not found or not on duty (FTE <= 0)
      if (!pca || pca.fte_pca <= 0) continue
      
      // Skip if this slot is already assigned in previous steps
      const existingAlloc = existingAllocations.find(a => a.staff_id === pcaId)
      if (existingAlloc) {
        const slotOwner = getSlotTeam(existingAlloc, preferredSlot)
        if (slotOwner !== null) continue  // Slot already taken
      }
      
      // Skip if this slot is being used for substitution (from Step 2)
      if (staffOverrides) {
        const override = staffOverrides[pcaId]
        const substitutionSlots = getAllSubstitutionSlots(override as any)
        if (substitutionSlots.includes(preferredSlot)) {
          continue  // Slot is being used for substitution, not available
        }
      }
      
      // This PCA's slot is available for reservation
      reservedPCAIds.push(pcaId)
      pcaNames[pcaId] = pca.name
      
      // Track in PCA slot reservations (for conflict detection)
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
  
  // Track FTE changes for PCAs
  const pcaFTEChanges: Record<string, number> = {}
  
  for (const assignment of assignments) {
    const { team, slot, pcaId } = assignment
    
    // Decrement team's pending FTE by 0.25
    updatedPendingFTE[team] = Math.max(0, (updatedPendingFTE[team] || 0) - 0.25)
    
    // Find or create allocation for this PCA
    let allocation = updatedAllocations.find(a => a.staff_id === pcaId)
    
    if (!allocation) {
      // Create new allocation
      const pca = floatingPCAs.find(p => p.id === pcaId)
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
    } else {
      // Update existing allocation - assign the slot to this team
      switch (slot) {
        case 1: allocation.slot1 = team; break
        case 2: allocation.slot2 = team; break
        case 3: allocation.slot3 = team; break
        case 4: allocation.slot4 = team; break
      }
      
      // Update FTE remaining
      allocation.fte_remaining = Math.max(0, allocation.fte_remaining - 0.25)
      allocation.slot_assigned = (allocation.slot_assigned || 0) + 0.25
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

/**
 * Helper function to check if a slot is actually assigned by the special program.
 * Different programs have different slot-team combinations:
 * - Robotic: slots 1-2 → SMM, slots 3-4 → SFM
 * - CRP: slot 2 → CPPC
 * - Other programs: all slots in the allocation's primary team
 */
function isSlotFromSpecialProgram(
  allocation: PCAAllocation,
  slot: number,
  team: Team,
  specialPrograms: SpecialProgram[]
): boolean {
  if (!allocation.special_program_ids || allocation.special_program_ids.length === 0) {
    return false
  }

  // Find the special program(s) for this allocation
  const program = specialPrograms.find(p => allocation.special_program_ids?.includes(p.id))
  if (!program) return false

  // For Robotic: slots 1-2 → SMM, slots 3-4 → SFM
  if (program.name === 'Robotic') {
    if (team === 'SMM') {
      return slot === 1 || slot === 2
    }
    if (team === 'SFM') {
      return slot === 3 || slot === 4
    }
    return false
  }

  // For CRP: slot 2 → CPPC
  if (program.name === 'CRP') {
    return team === 'CPPC' && slot === 2
  }

  // For other programs, if the current team matches the allocation's primary team,
  // assume all slots in that team are special program slots
  return allocation.team === team
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
  specialPrograms: SpecialProgram[]
): AdjacentSlotResult {
  // Initialize empty reservations for all teams
  const adjacentReservations: AdjacentSlotReservations = {
    FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
  }
  
  // Find allocations that were assigned via special program
  const specialProgramAllocations = existingAllocations.filter(
    alloc => alloc.special_program_ids && alloc.special_program_ids.length > 0
  )
  
  for (const allocation of specialProgramAllocations) {
    const pca = floatingPCAs.find(p => p.id === allocation.staff_id)
    const pcaName = pca?.name || 'Unknown PCA'
    
    // Find the special program name
    const specialProgram = allocation.special_program_ids && allocation.special_program_ids.length > 0
      ? specialPrograms.find(p => allocation.special_program_ids?.includes(p.id))
      : null
    const specialProgramName = specialProgram?.name || 'Unknown Program'
    
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
      if (!isSlotFromSpecialProgram(allocation, slot, team, specialPrograms)) {
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
      
      // Check if adjacent slot is already assigned
      const adjacentSlotTeam = getSlotTeam(allocation, adjacentSlot)
      if (adjacentSlotTeam !== null) {
        continue  // Already assigned
      }
      
      // Check if PCA still has FTE remaining
      if (allocation.fte_remaining <= 0) {
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


