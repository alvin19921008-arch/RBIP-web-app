import { Team } from '@/types/staff'
import { PCAAllocation } from '@/types/schedule'
import { PCAPreference, SpecialProgram } from '@/types/allocation'
import { roundToNearestQuarter, roundDownToQuarter, roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { getTeamFloor, isFloorPCAForTeam } from '@/lib/utils/floatingPCAHelpers'

export interface PCAData {
  id: string
  name: string
  floating: boolean
  special_program: string[] | null
  fte_pca: number // Base FTE remaining (from leave settings) - actual value, not rounded
  leave_type: string | null
  is_available: boolean
  team: Team | null
  floor_pca?: ('upper' | 'lower')[] | null // Floor PCA property: upper, lower, or both
  availableSlots?: number[] // Slots (1, 2, 3, 4) that are available for this PCA
  invalidSlot?: number // Slot (1-4) that is leave/come back, assigned but not counted
  leaveComebackTime?: string // Time in HH:MM format
  isLeave?: boolean // true for leave, false for come back
}

export interface PCAAllocationContext {
  date: Date
  totalPCAAvailable: number
  pcaPool: PCAData[]
  averagePCAPerTeam: Record<Team, number>
  specialPrograms: SpecialProgram[]
  pcaPreferences: PCAPreference[]
  gymSchedules?: Record<Team, number | null> // Deprecated - gym schedules now come from pcaPreferences
  onTieBreak?: (teams: Team[], pendingFTE: number) => Promise<Team> // Callback for tie-breaking dialog
  // Phase control for step-wise allocation
  // 'non-floating' = Step 2 (non-floating PCA only)
  // 'non-floating-with-special' = Step 2 (non-floating PCA + special program PCA)
  // 'floating' = Step 3 (floating PCA only, no special program)
  // 'all' = backward compatible (everything in one pass)
  phase?: 'non-floating' | 'non-floating-with-special' | 'floating' | 'all'
  // State from previous phase (required for 'floating' phase)
  existingAllocations?: PCAAllocation[] // Allocations from non-floating phase
  existingTeamPCAAssigned?: Record<Team, number> // Tracking from non-floating phase
  // Step 3.1 overrides: user-adjusted pending FTE and team order
  userAdjustedPendingFTE?: Record<Team, number> // User-adjusted rounded pending FTE values
  userTeamOrder?: Team[] // User-specified team allocation priority order
  // Non-floating PCA substitution callback - called DURING algorithm execution when substitution is needed
  onNonFloatingSubstitution?: (
    substitutions: Array<{
      nonFloatingPCAId: string
      nonFloatingPCAName: string
      team: Team
      fte: number
      missingSlots: number[]
      availableFloatingPCAs: Array<{
        id: string
        name: string
        availableSlots: number[]
        isPreferred: boolean
        isFloorPCA: boolean
      }>
    }>
  ) => Promise<Record<string, { floatingPCAId: string; slots: number[] }>> // Returns user selections: key = `${team}-${nonFloatingPCAId}`
}

export interface PCAAllocationResult {
  allocations: PCAAllocation[]
  totalPCAOnDuty: number
  pendingPCAFTEPerTeam: Record<Team, number> // Final pending values for unmet needs tracking
  // State for passing to next phase (used when phase = 'non-floating')
  teamPCAAssigned?: Record<Team, number> // Tracking of assigned FTE per team
  // Error messages (optional, only present when errors occur)
  errors?: {
    missingSlotSubstitution?: string  // For Part 1.2
    specialProgramAllocation?: string // For Part 2.1
  }
}

const BASE_PCA = 14

/**
 * Determines if gym schedule should be avoided for a team.
 * @param preference The PCA preference for this team (if any)
 * @returns true if gym schedule should be avoided, false otherwise
 */
function shouldAvoidGymSchedule(
  preference: PCAPreference | undefined
): boolean {
  // Respect the preference setting (default to false if not set)
  return preference?.avoid_gym_schedule ?? false
}

/**
 * Gets the team assignment for a slot in a special program.
 * For Robotic program: slot 1 or 2 → SMM, slot 3 or 4 → SFM
 * For other programs: use the target team
 * @param programName The name of the special program
 * @param slot The slot number (1, 2, 3, or 4)
 * @param targetTeam The original target team for allocation
 * @returns The team to assign this slot to
 */
function getSlotTeamForSpecialProgram(
  programName: string,
  slot: number,
  targetTeam: Team
): Team | null {
  if (programName === 'Robotic') {
    // Robotic: slot 1 or 2 → SMM, slot 3 or 4 → SFM
    if (slot === 1 || slot === 2) {
      return 'SMM'
    }
    if (slot === 3 || slot === 4) {
      return 'SFM'
    }
  }
  // For other programs, use the target team
  return targetTeam
}

/**
 * Calculates FTE assigned based on assigned slots (0.25 per assigned slot)
 * @param slot1 Slot 1 assignment
 * @param slot2 Slot 2 assignment
 * @param slot3 Slot 3 assignment
 * @param slot4 Slot 4 assignment
 * @returns Total FTE assigned
 */
function calculateFTEAssigned(
  slot1: Team | null,
  slot2: Team | null,
  slot3: Team | null,
  slot4: Team | null
): number {
  let assigned = 0
  if (slot1 !== null) assigned += 0.25
  if (slot2 !== null) assigned += 0.25
  if (slot3 !== null) assigned += 0.25
  if (slot4 !== null) assigned += 0.25
  return assigned
}

/**
 * Updates teamPCAAssigned based on slot assignments (not targetTeam)
 * This correctly tracks FTE for each slot team when slots are assigned to different teams
 * @param teamPCAAssigned The tracking object to update
 * @param slot1 Slot 1 team assignment
 * @param slot2 Slot 2 team assignment
 * @param slot3 Slot 3 team assignment
 * @param slot4 Slot 4 team assignment
 */
function updateTeamPCAAssignedFromSlots(
  teamPCAAssigned: Record<Team, number>,
  slot1: Team | null,
  slot2: Team | null,
  slot3: Team | null,
  slot4: Team | null
): void {
  const slotTeams = new Set<Team>()
  if (slot1) slotTeams.add(slot1)
  if (slot2) slotTeams.add(slot2)
  if (slot3) slotTeams.add(slot3)
  if (slot4) slotTeams.add(slot4)
  
  slotTeams.forEach(slotTeam => {
    let slotsForTeam = 0
    if (slot1 === slotTeam) slotsForTeam++
    if (slot2 === slotTeam) slotsForTeam++
    if (slot3 === slotTeam) slotsForTeam++
    if (slot4 === slotTeam) slotsForTeam++
    teamPCAAssigned[slotTeam] += slotsForTeam * 0.25
  })
}

/**
 * Filters slots to only include those that are available for the PCA
 * @param slots Array of slot numbers to check
 * @param availableSlots Available slots for this PCA (undefined means all slots available)
 * @returns Filtered array of available slots
 */
function filterAvailableSlots(slots: number[], availableSlots?: number[]): number[] {
  if (!availableSlots || availableSlots.length === 0) {
    return slots // All slots available if not specified
  }
  return slots.filter(slot => availableSlots.includes(slot))
}

/**
 * Updates FTE values for an allocation based on slot assignments and base FTE
 * @param allocation The allocation to update
 * @param baseFTE The base FTE remaining (from leave settings)
 */
function updateAllocationFTE(allocation: PCAAllocation, baseFTE: number): void {
  allocation.slot_assigned = calculateFTEAssigned(allocation.slot1, allocation.slot2, allocation.slot3, allocation.slot4)
  allocation.fte_remaining = Math.max(0, baseFTE - allocation.slot_assigned)
}

/**
 * Updates pending PCA-FTE/team values based on current teamPCAAssigned
 * Stores RAW pending values (no rounding) for accurate tie-breaking
 * Rounding happens only when assigning slots
 * @param pendingPCAFTEPerTeam The pending values to update (raw values)
 * @param teamPCAAssigned Current assigned FTE per team
 * @param averagePCAPerTeam Base required FTE per team
 */
function updatePendingValues(
  pendingPCAFTEPerTeam: Record<Team, number>,
  teamPCAAssigned: Record<Team, number>,
  averagePCAPerTeam: Record<Team, number>
): void {
  Object.entries(averagePCAPerTeam).forEach(([team, baseRequired]) => {
    const teamKey = team as Team
    const assigned = teamPCAAssigned[teamKey]
    const pending = baseRequired - assigned
    // Store RAW pending value (no rounding) - rounding happens when assigning slots
    pendingPCAFTEPerTeam[teamKey] = Math.max(0, pending)
  })
}

export async function allocatePCA(context: PCAAllocationContext): Promise<PCAAllocationResult> {
  const phase = context.phase || 'all' // Default to 'all' for backward compatibility
  
  // For 'floating' phase, start with existing allocations from non-floating phase
  // IMPORTANT: Do NOT seed allocations for 'non-floating-with-special' (Step 2).
  // Seeding Step 2 with saved non-floating allocations causes duplicates when we allocate non-floating again.
  // Only 'floating' (Step 3) should seed from prior phases.
  const allocations: PCAAllocation[] = phase === 'floating' && context.existingAllocations
    ? [...context.existingAllocations]
    : []
  

  let totalPCAOnDuty = context.totalPCAAvailable
  
  // Initialize error tracking
  const errors: { missingSlotSubstitution?: string; specialProgramAllocation?: string } = {}

  // Step 1: Calculate total PCA available (already done in context)
  
  // Step 2: Calculate PCA per team (already done in context.averagePCAPerTeam)

  // Step 3: Allocate non-floating PCA first
  const nonFloatingPCA = context.pcaPool.filter(pca => !pca.floating && pca.is_available)
  const floatingPCA = context.pcaPool.filter(pca => pca.floating && pca.is_available)
  // Non-floating PCAs with FTE=0 (completely unavailable) - need whole-day substitution
  const nonFloatingUnavailable = context.pcaPool.filter(pca => !pca.floating && !pca.is_available && pca.team)
  
  // For 'floating' phase, start with existing tracking from non-floating phase
  const teamPCAAssigned: Record<Team, number> = phase === 'floating' && context.existingTeamPCAAssigned
    ? { ...context.existingTeamPCAAssigned }
    : { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }
  
  // Phase control: determine which allocation phases to run
  // - 'non-floating': only non-floating PCA team assignment
  // - 'non-floating-with-special': non-floating + special program PCA
  // - 'floating': only floating PCA (no special program)
  // - 'all': everything in one pass (backward compatible)
  const shouldDoNonFloating = phase === 'all' || phase === 'non-floating' || phase === 'non-floating-with-special'
  const shouldDoSpecialProgram = phase === 'all' || phase === 'non-floating-with-special'
  const shouldDoFloating = phase === 'all' || phase === 'floating'

  // Get weekday for special program and floating PCA allocation
  const weekday = getWeekday(context.date)

  // If there are non-floating substitution needs, we must allocate special-program slots FIRST.
  // Otherwise, the substitution checkbox list will incorrectly include PCAs that will later be reserved
  // for special programs (and for whole-day substitution, those PCAs should be excluded).
  const willNeedNonFloatingSubstitution =
    shouldDoNonFloating &&
    (nonFloatingUnavailable.length > 0 ||
      nonFloatingPCA.some(pca => {
        if (!pca.team) return false
        const availableSlots = pca.availableSlots && pca.availableSlots.length > 0 ? pca.availableSlots : [1, 2, 3, 4]
        const missingSlots = [1, 2, 3, 4].filter(slot => !availableSlots.includes(slot))
        if (missingSlots.length === 0) return false
        const actualFTE = pca.fte_pca || 0
        return Math.abs(actualFTE - 1.0) >= 0.001
      }))

  let specialProgramsAllocated = false

  const runSpecialProgramAllocation = () => {
    // Priority 1: Special program requirements
    // Note: DRM is skipped here because it doesn't have designated PCA staff.
    // DRM only adds +0.4 FTE to DRO's required PCA/team (already applied to averagePCAPerTeam).
    // Floating PCA allocation (Priority 3-4) will respect the higher DRO requirement.
    const unallocatedPrograms: string[] = []
    context.specialPrograms.forEach((program) => {
      if (!program.weekdays.includes(weekday)) return

      // Skip DRM - it doesn't have designated PCA staff, only adds to DRO's required FTE
      if (program.name === 'DRM') return

      let programSlots = program.slots[weekday] || []

      // Fallback: If slots are empty but program is active for this weekday, use default slots
      // For Robotic: always use slots [1, 2, 3, 4] (all slots)
      // For CRP: derive from SPT allocations (therapist running the program determines slots)
      // For other programs: use slots from program configuration or default to [1, 2, 3, 4]
      if (programSlots.length === 0) {
        if (program.name === 'Robotic') {
          programSlots = [1, 2, 3, 4] // Robotic always uses all 4 slots
        } else if (program.name === 'CRP') {
          // For CRP, slots should be determined by which therapist runs it
          // Check SPT allocations to find which therapist is running CRP on this weekday
          // For now, default to slot 2 (most common for CRP)
          programSlots = [2]
        } else {
          // For other programs, default to all slots if not specified
          programSlots = [1, 2, 3, 4]
        }
      }

      if (programSlots.length === 0) return

      // Find teams that need this special program PCA
      // Use tolerance (0.01) to avoid floating point precision issues (e.g., 1.0 vs 1.0001)
      const TOLERANCE = 0.01
      const teamsNeedingProgram = Object.entries(context.averagePCAPerTeam)
        .filter(([team, required]) => {
          const teamKey = team as Team
          const preference = context.pcaPreferences.find(p => p.team === teamKey)
          const gymSlot = preference?.gym_schedule ?? null
          const slotConflict = programSlots.some(slot => slot === gymSlot)

          // Check if we should avoid gym schedule for this team (floating PCA only)
          const avoidGym = shouldAvoidGymSchedule(preference)

          // If there's a conflict and we should avoid gym, skip this team
          if (slotConflict && avoidGym) {
            return false
          }

          // Use tolerance to handle floating point precision issues (e.g., DRM add-on creating 1.0001 vs 1.0)
          return teamPCAAssigned[teamKey] < (required - TOLERANCE)
        })
        .map(([team]) => team as Team)

      if (teamsNeedingProgram.length === 0) return

      // Use PCA preference order if available, otherwise use any available PCA
      let pcaToAssign: PCAData | null = null
      let assignedPCAId: string | null = null

      if (program.pca_preference_order && program.pca_preference_order.length > 0) {
        // Try preference order first
        for (const preferredPcaId of program.pca_preference_order) {
          // Check floating PCA first (as per requirement: floating first)
          const floatingPca = floatingPCA.find(
            pca => pca.id === preferredPcaId &&
            pca.special_program?.includes(program.name) &&
            pca.is_available &&
            !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
          )

          if (floatingPca) {
            pcaToAssign = floatingPca
            assignedPCAId = preferredPcaId
            break
          }

          // Check non-floating PCA (if floating not found)
          const nonFloatingPca = nonFloatingPCA.find(
            pca => pca.id === preferredPcaId &&
            pca.special_program?.includes(program.name) &&
            pca.is_available &&
            !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
          )

          if (nonFloatingPca) {
            pcaToAssign = nonFloatingPca
            assignedPCAId = preferredPcaId
            break
          }
        }

        // If all in preference list are unavailable, fall back to any available PCA
        if (!pcaToAssign) {
          // For DRM, use any available floating PCA (no special program requirement)
          // For other programs, use PCA with the special program
          if (program.name === 'DRM') {
            // Try floating PCA first (any available floating PCA)
            const fallbackFloating = floatingPCA.find(
              pca => pca.is_available &&
              !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
            )

            if (fallbackFloating) {
              pcaToAssign = fallbackFloating
            } else {
              // Try non-floating PCA
              const fallbackNonFloating = nonFloatingPCA.find(
                pca => pca.is_available &&
                !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
              )

              if (fallbackNonFloating) {
                pcaToAssign = fallbackNonFloating
              }
            }
          } else {
            // Other programs: use PCA with the special program
            const fallbackFloating = floatingPCA.find(
              pca => pca.special_program?.includes(program.name) &&
              pca.is_available &&
              !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
            )

            if (fallbackFloating) {
              pcaToAssign = fallbackFloating
            } else {
              // Try non-floating PCA
              const fallbackNonFloating = nonFloatingPCA.find(
                pca => pca.special_program?.includes(program.name) &&
                pca.is_available &&
                !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
              )

              if (fallbackNonFloating) {
                pcaToAssign = fallbackNonFloating
              }
            }
          }
        }
      } else {
        // No preference order - for DRM, use ANY available floating PCA (not just those with DRM in special_program)
        // For other programs, use PCA with the special program
        if (program.name === 'DRM') {
          // DRM: Use any available floating PCA (no special program requirement)
          const availableFloatingPCA = floatingPCA.find(
            pca => pca.is_available &&
            !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
          )

          if (availableFloatingPCA) {
            pcaToAssign = availableFloatingPCA
          } else {
            // Fall back to non-floating PCA if no floating available
            const availableNonFloatingPCA = nonFloatingPCA.find(
              pca => pca.is_available &&
              !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
            )

            if (availableNonFloatingPCA) {
              pcaToAssign = availableNonFloatingPCA
            }
          }
        } else {
          // Other programs: use PCA with the special program (existing logic)
          const availableFloatingPCA = floatingPCA.find(
            pca => pca.special_program?.includes(program.name) &&
            pca.is_available &&
            !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
          )

          if (availableFloatingPCA) {
            pcaToAssign = availableFloatingPCA
          } else {
            // Fall back to non-floating PCA
            const availableNonFloatingPCA = nonFloatingPCA.find(
              pca => pca.special_program?.includes(program.name) &&
              pca.is_available &&
              !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
            )

            if (availableNonFloatingPCA) {
              pcaToAssign = availableNonFloatingPCA
            }
          }
        }
      }

      // For special programs, determine target teams based on program type
      // Robotic: slots go to SMM (1-2) and SFM (3-4), so we need to check if SMM or SFM need PCA
      // CRP: slot goes to the team running the program (determined by which team has staff in program)
      // Other programs: use the team that needs PCA
      let targetTeamsForProgram: Team[] = []

      if (program.name === 'Robotic') {
        // Robotic: Check if SMM or SFM need PCA (slots 1-2 go to SMM, 3-4 go to SFM)
        if (teamPCAAssigned['SMM'] < context.averagePCAPerTeam['SMM'] ||
            teamPCAAssigned['SFM'] < context.averagePCAPerTeam['SFM']) {
          // Use SMM as the primary team (slots will be mapped correctly by getSlotTeamForSpecialProgram)
          targetTeamsForProgram = ['SMM']
        }
      } else if (program.name === 'CRP') {
        // CRP: default to CPPC (future: infer from therapist allocations)
        targetTeamsForProgram = ['CPPC']
      } else {
        // Other programs: use teams needing PCA (existing logic)
        targetTeamsForProgram = teamsNeedingProgram
      }

      if (targetTeamsForProgram.length === 0) return

      // Assign PCA to target teams (for Robotic/CRP, only one allocation; for others, one per team)
      // For Robotic/CRP, check if we've already created an allocation for this program
      let programAllocationCreated = false
      let programAssigned = false // Track if any PCA was assigned for this program

      targetTeamsForProgram.forEach((targetTeam) => {
        // For Robotic/CRP, only create one allocation total (not per team)
        if ((program.name === 'Robotic' || program.name === 'CRP') && programAllocationCreated) {
          return
        }

        const neededFTE = context.averagePCAPerTeam[targetTeam] - teamPCAAssigned[targetTeam]
        if (neededFTE <= 0 && program.name !== 'Robotic') return // For Robotic, always create allocation if SMM/SFM need it

        let assigned = false

        // Try preference order first if available
        if (program.pca_preference_order && program.pca_preference_order.length > 0) {
          for (const preferredPcaId of program.pca_preference_order) {
            // Check floating PCA first
            // For special programs (Robotic/CRP), check if PCA already has allocation for this program (any team)
            // For other programs, check if PCA has allocation for this program and team
            const floatingPca = floatingPCA.find(
              pca => pca.id === preferredPcaId &&
              pca.special_program?.includes(program.name) &&
              pca.is_available &&
              (program.name === 'Robotic' || program.name === 'CRP'
                ? !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
                : !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id) && a.team === targetTeam))
            )

            if (floatingPca) {
              // For special programs (Robotic/CRP), find allocation by program, not by team
              // For other programs, find by team
              const existingAllocation = (program.name === 'Robotic' || program.name === 'CRP')
                ? allocations.find(a => a.staff_id === floatingPca.id && a.special_program_ids?.includes(program.id))
                : allocations.find(a => a.staff_id === floatingPca.id && a.team === targetTeam)
              const remainingFTE = existingAllocation?.fte_remaining ?? floatingPca.fte_pca

              // Any allocation (including substitutions) for slot-usage checks
              const anyAllocationForPCA = allocations.find(a => a.staff_id === floatingPca.id)
              const anyAssignedSlots = anyAllocationForPCA
                ? [1, 2, 3, 4].filter(slot => {
                    const slotTeam = slot === 1 ? anyAllocationForPCA.slot1 : slot === 2 ? anyAllocationForPCA.slot2 : slot === 3 ? anyAllocationForPCA.slot3 : anyAllocationForPCA.slot4
                    return slotTeam !== null
                  })
                : []

              // CRITICAL: Do not assign special program PCA if required program slots are already occupied
              // (e.g., PCA used as non-floating substitute already has slots assigned)
              const requiredProgramSlots = programSlots
              const anyAllocationHasRequiredSlotsOccupied = anyAllocationForPCA
                ? requiredProgramSlots.some(slot => {
                    const slotTeam = slot === 1 ? anyAllocationForPCA.slot1 : slot === 2 ? anyAllocationForPCA.slot2 : slot === 3 ? anyAllocationForPCA.slot3 : anyAllocationForPCA.slot4
                    return slotTeam !== null
                  })
                : false
              if (anyAllocationHasRequiredSlotsOccupied) {
                continue
              }

              if (remainingFTE > 0) {
                // Calculate FTE based on number of slots assigned
                // Each slot is 0.25 FTE, so slots 1+2+3+4 = 1.0 FTE total
                const slotsToAssign = programSlots.length
                const ftePerSlot = 0.25
                const fteForSlots = slotsToAssign * ftePerSlot
                // For special programs, use all slots FTE, not just what's needed by the team
                const fteToAssign = program.name === 'Robotic' || program.name === 'CRP'
                  ? Math.min(remainingFTE, fteForSlots) // Use full slot FTE for special programs
                  : Math.min(neededFTE, remainingFTE, fteForSlots, program.pca_required || fteForSlots)

                // IMPORTANT: reuse the PCA's existing allocation (if any) to avoid duplicate allocations for the same staff_id
                const baseAllocationForPCA = allocations.find(a => a.staff_id === floatingPca.id) ?? existingAllocation

                if (baseAllocationForPCA) {
                  // Track newly assigned slots to avoid double-counting
                  const newlyAssignedSlots: { slot: number, team: Team }[] = []
                  programSlots.forEach(slot => {
                    const slotTeam = getSlotTeamForSpecialProgram(program.name, slot, targetTeam)
                    if (slot === 1 && baseAllocationForPCA.slot1 === null && slotTeam) {
                      baseAllocationForPCA.slot1 = slotTeam
                      newlyAssignedSlots.push({ slot: 1, team: slotTeam })
                    }
                    if (slot === 2 && baseAllocationForPCA.slot2 === null && slotTeam) {
                      baseAllocationForPCA.slot2 = slotTeam
                      newlyAssignedSlots.push({ slot: 2, team: slotTeam })
                    }
                    if (slot === 3 && baseAllocationForPCA.slot3 === null && slotTeam) {
                      baseAllocationForPCA.slot3 = slotTeam
                      newlyAssignedSlots.push({ slot: 3, team: slotTeam })
                    }
                    if (slot === 4 && baseAllocationForPCA.slot4 === null && slotTeam) {
                      baseAllocationForPCA.slot4 = slotTeam
                      newlyAssignedSlots.push({ slot: 4, team: slotTeam })
                    }
                  })
                  baseAllocationForPCA.fte_remaining -= fteToAssign
                  if (!baseAllocationForPCA.special_program_ids) {
                    baseAllocationForPCA.special_program_ids = []
                  }
                  if (!baseAllocationForPCA.special_program_ids.includes(program.id)) {
                    baseAllocationForPCA.special_program_ids.push(program.id)
                  }
                  // Update teamPCAAssigned only for newly assigned slots (0.25 per slot)
                  newlyAssignedSlots.forEach(({ team }) => {
                    teamPCAAssigned[team] += 0.25
                  })
                } else {
                  const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program.name, 1, targetTeam) : null
                  const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program.name, 2, targetTeam) : null
                  const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program.name, 3, targetTeam) : null
                  const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program.name, 4, targetTeam) : null

                  const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
                  const allocation: PCAAllocation = {
                    id: crypto.randomUUID(),
                    schedule_id: '',
                    staff_id: floatingPca.id,
                    team: targetTeam,
                    fte_pca: floatingPca.fte_pca,  // Use PCA's actual on-duty FTE (Base_FTE-remaining)
                    fte_remaining: floatingPca.fte_pca - fteToAssign,  // True-FTE remaining after this assignment
                    slot_assigned: fteAssigned,
                    slot_whole: null,
                    slot1: slot1Team,
                    slot2: slot2Team,
                    slot3: slot3Team,
                    slot4: slot4Team,
                    leave_type: null,
                    special_program_ids: [program.id],
                  }
                  allocations.push(allocation)
                  // Update teamPCAAssigned for each slot team (not just targetTeam)
                  updateTeamPCAAssignedFromSlots(teamPCAAssigned, slot1Team, slot2Team, slot3Team, slot4Team)
                }
                assigned = true
                programAssigned = true
                if (program.name === 'Robotic' || program.name === 'CRP') {
                  programAllocationCreated = true
                }
                break
              }
            }

            // Check non-floating PCA if floating not found
            // For special programs (Robotic/CRP), check if PCA already has allocation for this program (any team)
            const nonFloatingPca = nonFloatingPCA.find(
              pca => pca.id === preferredPcaId &&
              pca.special_program?.includes(program.name) &&
              pca.is_available &&
              (program.name === 'Robotic' || program.name === 'CRP'
                ? !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
                : !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id) && a.team === targetTeam))
            )

            if (nonFloatingPca) {
              // For special programs (Robotic/CRP), find allocation by program, not by team
              const existingAllocation = (program.name === 'Robotic' || program.name === 'CRP')
                ? allocations.find(a => a.staff_id === nonFloatingPca.id && a.special_program_ids?.includes(program.id))
                : allocations.find(a => a.staff_id === nonFloatingPca.id && a.team === targetTeam)
              const remainingFTE = existingAllocation?.fte_remaining || 1

              if (remainingFTE > 0) {
                // Calculate FTE based on number of slots assigned
                const slotsToAssign = programSlots.length
                const ftePerSlot = 0.25
                const fteForSlots = slotsToAssign * ftePerSlot
                const fteToAssign = Math.min(neededFTE, remainingFTE, fteForSlots, program.pca_required || fteForSlots)

                if (existingAllocation) {
                  // Track newly assigned slots to avoid double-counting
                  const newlyAssignedSlots: { slot: number, team: Team }[] = []
                  programSlots.forEach(slot => {
                    const slotTeam = getSlotTeamForSpecialProgram(program.name, slot, targetTeam)
                    if (slot === 1 && existingAllocation.slot1 === null && slotTeam) {
                      existingAllocation.slot1 = slotTeam
                      newlyAssignedSlots.push({ slot: 1, team: slotTeam })
                    }
                    if (slot === 2 && existingAllocation.slot2 === null && slotTeam) {
                      existingAllocation.slot2 = slotTeam
                      newlyAssignedSlots.push({ slot: 2, team: slotTeam })
                    }
                    if (slot === 3 && existingAllocation.slot3 === null && slotTeam) {
                      existingAllocation.slot3 = slotTeam
                      newlyAssignedSlots.push({ slot: 3, team: slotTeam })
                    }
                    if (slot === 4 && existingAllocation.slot4 === null && slotTeam) {
                      existingAllocation.slot4 = slotTeam
                      newlyAssignedSlots.push({ slot: 4, team: slotTeam })
                    }
                  })
                  existingAllocation.fte_remaining -= fteToAssign
                  if (!existingAllocation.special_program_ids) {
                    existingAllocation.special_program_ids = []
                  }
                  if (!existingAllocation.special_program_ids.includes(program.id)) {
                    existingAllocation.special_program_ids.push(program.id)
                  }
                  // Update teamPCAAssigned only for newly assigned slots (0.25 per slot)
                  newlyAssignedSlots.forEach(({ team }) => {
                    teamPCAAssigned[team] += 0.25
                  })
                } else {
                  const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program.name, 1, targetTeam) : null
                  const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program.name, 2, targetTeam) : null
                  const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program.name, 3, targetTeam) : null
                  const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program.name, 4, targetTeam) : null
                  const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)

                  const allocation: PCAAllocation = {
                    id: crypto.randomUUID(),
                    schedule_id: '',
                    staff_id: nonFloatingPca.id,
                    team: targetTeam,
                    fte_pca: nonFloatingPca.fte_pca,  // Use PCA's actual on-duty FTE (Base_FTE-remaining)
                    fte_remaining: nonFloatingPca.fte_pca - fteToAssign,  // True-FTE remaining after this assignment
                    slot_assigned: fteAssigned,
                    slot_whole: null,
                    slot1: slot1Team,
                    slot2: slot2Team,
                    slot3: slot3Team,
                    slot4: slot4Team,
                    leave_type: null,
                    special_program_ids: [program.id],
                  }
                  allocations.push(allocation)
                  // Update teamPCAAssigned for each slot team (not just targetTeam)
                  updateTeamPCAAssignedFromSlots(teamPCAAssigned, slot1Team, slot2Team, slot3Team, slot4Team)
                }
                assigned = true
                programAssigned = true
                if (program.name === 'Robotic' || program.name === 'CRP') {
                  programAllocationCreated = true
                }
                break
              }
            }
          }
        }

        // If not assigned from preference order, fall back to any available PCA
        if (!assigned) {
          // Try floating PCA first
          // For special programs (Robotic/CRP), check if PCA already has allocation for this program (any team)
          const fallbackFloating = floatingPCA.find(
            pca => pca.special_program?.includes(program.name) &&
            pca.is_available &&
            (program.name === 'Robotic' || program.name === 'CRP'
              ? !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
              : !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id) && a.team === targetTeam))
          )

          if (fallbackFloating) {
            const existingAllocation = allocations.find(a => a.staff_id === fallbackFloating.id && a.team === targetTeam)
            const remainingFTE = existingAllocation?.fte_remaining || 1

            if (remainingFTE > 0) {
              // Calculate FTE based on number of slots assigned
              const slotsToAssign = programSlots.length
              const ftePerSlot = 0.25
              const fteForSlots = slotsToAssign * ftePerSlot
              // For special programs, use all slots FTE, not just what's needed by the team
              const fteToAssign = program.name === 'Robotic' || program.name === 'CRP'
                ? Math.min(remainingFTE, fteForSlots) // Use full slot FTE for special programs
                : Math.min(neededFTE, remainingFTE, fteForSlots, program.pca_required || fteForSlots)

              if (existingAllocation) {
                // Track newly assigned slots to avoid double-counting
                const newlyAssignedSlots: { slot: number, team: Team }[] = []
                programSlots.forEach(slot => {
                  const slotTeam = getSlotTeamForSpecialProgram(program.name, slot, targetTeam)
                  if (slot === 1 && existingAllocation.slot1 === null && slotTeam) {
                    existingAllocation.slot1 = slotTeam
                    newlyAssignedSlots.push({ slot: 1, team: slotTeam })
                  }
                  if (slot === 2 && existingAllocation.slot2 === null && slotTeam) {
                    existingAllocation.slot2 = slotTeam
                    newlyAssignedSlots.push({ slot: 2, team: slotTeam })
                  }
                  if (slot === 3 && existingAllocation.slot3 === null && slotTeam) {
                    existingAllocation.slot3 = slotTeam
                    newlyAssignedSlots.push({ slot: 3, team: slotTeam })
                  }
                  if (slot === 4 && existingAllocation.slot4 === null && slotTeam) {
                    existingAllocation.slot4 = slotTeam
                    newlyAssignedSlots.push({ slot: 4, team: slotTeam })
                  }
                })
                existingAllocation.fte_remaining -= fteToAssign
                if (!existingAllocation.special_program_ids) {
                  existingAllocation.special_program_ids = []
                }
                if (!existingAllocation.special_program_ids.includes(program.id)) {
                  existingAllocation.special_program_ids.push(program.id)
                }
                // Update teamPCAAssigned only for newly assigned slots (0.25 per slot)
                newlyAssignedSlots.forEach(({ team }) => {
                  teamPCAAssigned[team] += 0.25
                })
              } else {
                const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program.name, 1, targetTeam) : null
                const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program.name, 2, targetTeam) : null
                const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program.name, 3, targetTeam) : null
                const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program.name, 4, targetTeam) : null
                const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)

                const allocation: PCAAllocation = {
                  id: crypto.randomUUID(),
                  schedule_id: '',
                  staff_id: fallbackFloating.id,
                  team: targetTeam,
                  fte_pca: fallbackFloating.fte_pca,  // Use PCA's actual on-duty FTE (Base_FTE-remaining)
                  fte_remaining: fallbackFloating.fte_pca - fteToAssign,  // True-FTE remaining after this assignment
                  slot_assigned: fteAssigned,
                  slot_whole: null,
                  slot1: slot1Team,
                  slot2: slot2Team,
                  slot3: slot3Team,
                  slot4: slot4Team,
                  leave_type: null,
                  special_program_ids: [program.id],
                }
                allocations.push(allocation)
                // Update teamPCAAssigned for each slot team (not just targetTeam)
                updateTeamPCAAssignedFromSlots(teamPCAAssigned, slot1Team, slot2Team, slot3Team, slot4Team)
              }
              assigned = true
              programAssigned = true
            }
          }

          // Try non-floating PCA if floating not available
          if (!assigned) {
            // For special programs (Robotic/CRP), check if PCA already has allocation for this program (any team)
            const fallbackNonFloating = nonFloatingPCA.find(
              pca => pca.special_program?.includes(program.name) &&
              pca.is_available &&
              (program.name === 'Robotic' || program.name === 'CRP'
                ? !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
                : !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id) && a.team === targetTeam))
            )

            if (fallbackNonFloating) {
              const existingAllocation = allocations.find(a => a.staff_id === fallbackNonFloating.id && a.team === targetTeam)
              const remainingFTE = existingAllocation?.fte_remaining || 1

              if (remainingFTE > 0) {
                // Calculate FTE based on number of slots assigned
                const slotsToAssign = programSlots.length
                const ftePerSlot = 0.25
                const fteForSlots = slotsToAssign * ftePerSlot
                const fteToAssign = Math.min(neededFTE, remainingFTE, fteForSlots, program.pca_required || fteForSlots)

                if (existingAllocation) {
                  // Track newly assigned slots to avoid double-counting
                  const newlyAssignedSlots: { slot: number, team: Team }[] = []
                  programSlots.forEach(slot => {
                    const slotTeam = getSlotTeamForSpecialProgram(program.name, slot, targetTeam)
                    if (slot === 1 && existingAllocation.slot1 === null && slotTeam) {
                      existingAllocation.slot1 = slotTeam
                      newlyAssignedSlots.push({ slot: 1, team: slotTeam })
                    }
                    if (slot === 2 && existingAllocation.slot2 === null && slotTeam) {
                      existingAllocation.slot2 = slotTeam
                      newlyAssignedSlots.push({ slot: 2, team: slotTeam })
                    }
                    if (slot === 3 && existingAllocation.slot3 === null && slotTeam) {
                      existingAllocation.slot3 = slotTeam
                      newlyAssignedSlots.push({ slot: 3, team: slotTeam })
                    }
                    if (slot === 4 && existingAllocation.slot4 === null && slotTeam) {
                      existingAllocation.slot4 = slotTeam
                      newlyAssignedSlots.push({ slot: 4, team: slotTeam })
                    }
                  })
                  existingAllocation.fte_remaining -= fteToAssign
                  if (!existingAllocation.special_program_ids) {
                    existingAllocation.special_program_ids = []
                  }
                  if (!existingAllocation.special_program_ids.includes(program.id)) {
                    existingAllocation.special_program_ids.push(program.id)
                  }
                  // Update teamPCAAssigned only for newly assigned slots (0.25 per slot)
                  newlyAssignedSlots.forEach(({ team }) => {
                    teamPCAAssigned[team] += 0.25
                  })
                } else {
                  const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program.name, 1, targetTeam) : null
                  const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program.name, 2, targetTeam) : null
                  const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program.name, 3, targetTeam) : null
                  const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program.name, 4, targetTeam) : null
                  const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)

                  const allocation: PCAAllocation = {
                    id: crypto.randomUUID(),
                    schedule_id: '',
                    staff_id: fallbackNonFloating.id,
                    team: targetTeam,
                    fte_pca: fallbackNonFloating.fte_pca,  // Use PCA's actual on-duty FTE (Base_FTE-remaining)
                    fte_remaining: fallbackNonFloating.fte_pca - fteToAssign,  // True-FTE remaining after this assignment
                    slot_assigned: fteAssigned,
                    slot_whole: null,
                    slot1: slot1Team,
                    slot2: slot2Team,
                    slot3: slot3Team,
                    slot4: slot4Team,
                    leave_type: null,
                    special_program_ids: [program.id],
                  }
                  allocations.push(allocation)
                  // Update teamPCAAssigned for each slot team (not just targetTeam)
                  updateTeamPCAAssignedFromSlots(teamPCAAssigned, slot1Team, slot2Team, slot3Team, slot4Team)
                }
              }
            }
          }
        }
      })

      // Track if program couldn't be allocated
      if (!programAssigned && teamsNeedingProgram.length > 0) {
        unallocatedPrograms.push(program.name)
      }
    })

    // Create error message if any programs couldn't be allocated
    if (unallocatedPrograms.length > 0) {
      errors.specialProgramAllocation = `Unable to find PCA for special programs: ${unallocatedPrograms.join(', ')}`
    }
  }

  // ============================================================================
  // NON-FLOATING PCA ALLOCATION (Phase: 'non-floating' or 'all')
  // ============================================================================
  if (shouldDoNonFloating) {
  nonFloatingPCA.forEach((pca) => {
    if (!pca.team) return
    const team = pca.team  // Capture non-null team for type safety
    
    const baseFTE = pca.fte_pca // Base FTE remaining from leave settings (actual value, not rounded)
    
    // Check available slots - if specified, use only those slots (invalid slot is NOT in availableSlots)
    const slotsToAssign = pca.availableSlots && pca.availableSlots.length > 0
      ? filterAvailableSlots([1, 2, 3, 4], pca.availableSlots)
      : [1, 2, 3, 4]
    
    // Calculate true FTE = number of available slots * 0.25 (invalid slot not counted)
    const trueFTE = slotsToAssign.length * 0.25
    // CHANGED: Assign ALL true FTE to designated team (no limit)
    // Even if team only needs 0.5, assign full 1.0 if PCA has it
    const assignedFTE = trueFTE // No Math.min - assign everything
    
    // Assign available slots to team
    const slot1Team = slotsToAssign.includes(1) ? team : null
    const slot2Team = slotsToAssign.includes(2) ? team : null
    const slot3Team = slotsToAssign.includes(3) ? team : null
    const slot4Team = slotsToAssign.includes(4) ? team : null
    
    // Handle invalid slot (leave/come back slot) - assign to team but don't count in FTE
    // Invalid slot is assigned to the PCA's team
    const finalSlot1 = slot1Team || (pca.invalidSlot === 1 ? team : null)
    const finalSlot2 = slot2Team || (pca.invalidSlot === 2 ? team : null)
    const finalSlot3 = slot3Team || (pca.invalidSlot === 3 ? team : null)
    const finalSlot4 = slot4Team || (pca.invalidSlot === 4 ? team : null)
    
    const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team) // Only count available slots
    const fteRemaining = Math.max(0, baseFTE - fteAssigned)
    
    const allocation: PCAAllocation = {
      id: crypto.randomUUID(),
      schedule_id: '',
      staff_id: pca.id,
      team: team,
      fte_pca: assignedFTE, // True FTE (available slots only)
      fte_remaining: fteRemaining,
      slot_assigned: fteAssigned, // Only available slots counted
      slot_whole: null,
      slot1: finalSlot1,
      slot2: finalSlot2,
      slot3: finalSlot3,
      slot4: finalSlot4,
      leave_type: pca.leave_type,
      special_program_ids: null,
    }
    
    // Add invalid slot fields if they exist
    if (pca.invalidSlot !== undefined && pca.invalidSlot !== null) {
      (allocation as any).invalid_slot = pca.invalidSlot
      if (pca.leaveComebackTime) {
        (allocation as any).leave_comeback_time = pca.leaveComebackTime
      }
      if (pca.isLeave !== undefined) {
        (allocation as any).leave_mode = pca.isLeave ? 'leave' : 'come_back'
      }
    }
    
    allocations.push(allocation)
    // CHANGED: Add ALL true FTE to designated team (no limit check)
    teamPCAAssigned[team] += assignedFTE
  })

  // If substitutions are needed, allocate special-program slots FIRST so the substitution
  // candidate list reflects real availability (whole-day substitution must exclude special-program PCAs).
  if (shouldDoSpecialProgram && willNeedNonFloatingSubstitution && !specialProgramsAllocated) {
    runSpecialProgramAllocation()
    specialProgramsAllocated = true
  }

  // Helper function to get available floating PCAs for substitution (filtered and sorted)
  // Must be defined before Part 1.1.5 and Part 1.2 where it's used
  const getAvailableFloatingPCAsForSubstitution = (
    team: Team,
    missingSlots: number[],
    allocations: PCAAllocation[]
  ): Array<{
    id: string
    name: string
    availableSlots: number[]
    isPreferred: boolean
    isFloorPCA: boolean
  }> => {
    const teamPref = context.pcaPreferences.find(p => p.team === team)
    const preferredPCAIds = teamPref?.preferred_pca_ids || []
    const teamFloor = teamPref?.floor_pca_selection ?? null

    // Get weekday for special program check
    const weekday = context.date.getDay()
    const weekdayMap: { [key: number]: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' } = {
      1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri'
    }
    const currentWeekday = weekdayMap[weekday] || 'mon'

    // Get non-floating PCA IDs (to exclude)
    const nonFloatingPCAIds = new Set(
      context.pcaPool.filter(p => !p.floating && p.team !== null).map(p => p.id)
    )

    // Get special program PCAs for this weekday
    // NOTE: We don't exclude PCAs with special programs entirely - they may still have available slots
    // Special programs might only use some slots (e.g., CRP uses slot 2), so the PCA can still substitute
    // We'll check slot availability later instead of excluding them here
    const specialProgramPCAs = new Set<string>()
    // Removed: We no longer exclude PCAs with special programs from substitution
    // They can still be used if they have the required slots available

    const available: Array<{
      id: string
      name: string
      availableSlots: number[]
      isPreferred: boolean
      isFloorPCA: boolean
    }> = []

    floatingPCA.forEach(pca => {
      // Exclude non-floating PCAs of other teams
      if (nonFloatingPCAIds.has(pca.id)) {
        return
      }

      // NOTE: We no longer exclude PCAs with special programs here
      // Special programs might only use some slots (e.g., CRP uses slot 2), so the PCA can still substitute
      // We check slot availability below to ensure the required slots are free

      // Check if PCA has all missing slots available
      const pcaAvailableSlots = pca.availableSlots && pca.availableSlots.length > 0
        ? pca.availableSlots
        : [1, 2, 3, 4]
      
      const hasAllMissingSlots = missingSlots.every(slot => pcaAvailableSlots.includes(slot))
      if (!hasAllMissingSlots) {
        return
      }

      // Check if required slots are available (not already assigned, including to special programs)
      const existingAllocation = allocations.find(a => a.staff_id === pca.id)
      if (existingAllocation) {
        // Check if PCA is actually assigned to a special program on this day
        // Only exclude if the PCA has special_program_ids AND the required slots overlap with assigned slots
        const hasSpecialProgramAssignment = existingAllocation.special_program_ids && existingAllocation.special_program_ids.length > 0
        
        // Get slots assigned to special programs (if any)
        const specialProgramSlots: number[] = []
        if (hasSpecialProgramAssignment) {
          if (existingAllocation.slot1 !== null) specialProgramSlots.push(1)
          if (existingAllocation.slot2 !== null) specialProgramSlots.push(2)
          if (existingAllocation.slot3 !== null) specialProgramSlots.push(3)
          if (existingAllocation.slot4 !== null) specialProgramSlots.push(4)
        }
        
        // For whole-day substitution (all 4 slots needed), exclude if PCA is assigned to special program
        // For partial substitution, only exclude if required slots overlap with special program slots
        if (missingSlots.length === 4 && hasSpecialProgramAssignment) {
          // Whole-day substitution: exclude if PCA is assigned to special program (uses slots)
          return
        }
        
        // For partial substitution: check if any required slots overlap with already assigned slots
        const assignedSlots: number[] = []
        if (existingAllocation.slot1 !== null) assignedSlots.push(1)
        if (existingAllocation.slot2 !== null) assignedSlots.push(2)
        if (existingAllocation.slot3 !== null) assignedSlots.push(3)
        if (existingAllocation.slot4 !== null) assignedSlots.push(4)
        
        // Check if any missing slots overlap with already assigned slots
        const hasOverlap = missingSlots.some(slot => assignedSlots.includes(slot))
        if (hasOverlap) {
          return
        }
      }

      // Check floor PCA matching
      // A PCA matches if their floor_pca array includes the team's floor preference
      // e.g., if teamFloor = 'upper' and pca.floor_pca = ['upper'] or ['upper', 'lower'], it matches
      const isFloorPCA = teamFloor !== null && 
        pca.floor_pca !== null && 
        pca.floor_pca !== undefined && 
        Array.isArray(pca.floor_pca) && 
        pca.floor_pca.length > 0 &&
        pca.floor_pca.includes(teamFloor)

      available.push({
        id: pca.id,
        name: pca.name,
        availableSlots: pcaAvailableSlots,
        isPreferred: preferredPCAIds.includes(pca.id),
        isFloorPCA: isFloorPCA || false
      })
    })

    // Sort: preferred → floor → non-floor
    available.sort((a, b) => {
      if (a.isPreferred && !b.isPreferred) return -1
      if (!a.isPreferred && b.isPreferred) return 1
      if (a.isFloorPCA && !b.isFloorPCA) return -1
      if (!a.isFloorPCA && b.isFloorPCA) return 1
      return a.name.localeCompare(b.name)
    })

    return available
  }

  // Part 1.1.5: Whole-day substitution for non-floating PCAs with FTE=0
  // For non-floating PCAs that are completely unavailable (FTE=0), find a floating PCA to substitute all 4 slots
  // NOTE: This is now handled in Part 1.2 via the substitution callback, so we skip automatic assignment here
  // The callback will collect these as substitution needs and let user choose
  const wholeDaySubstitutionNeeds: Array<{
    nonFloatingPCAId: string
    nonFloatingPCAName: string
    team: Team
    fte: number
    missingSlots: number[]
    availableFloatingPCAs: Array<{
      id: string
      name: string
      availableSlots: number[]
      isPreferred: boolean
      isFloorPCA: boolean
    }>
  }> = []

  nonFloatingUnavailable.forEach((pca) => {
    
    if (!pca.team) return
    const team = pca.team  // Capture non-null team for type safety
    
    // Collect as substitution need (will be handled by callback or automatic algorithm)
    const missingSlots = [1, 2, 3, 4] // All slots missing for FTE=0
    const availableFloatingPCAs = getAvailableFloatingPCAsForSubstitution(team, missingSlots, allocations)
    
    wholeDaySubstitutionNeeds.push({
      nonFloatingPCAId: pca.id,
      nonFloatingPCAName: pca.name,
      team,
      fte: 0,
      missingSlots,
      availableFloatingPCAs
    })
  })

  // Collect all substitution needs first (partial substitutions from Part 1.2)
  // Start with whole-day substitutions, then add partial substitutions
  const substitutionNeeds: Array<{
    nonFloatingPCAId: string
    nonFloatingPCAName: string
    team: Team
    fte: number
    missingSlots: number[]
    availableFloatingPCAs: Array<{
      id: string
      name: string
      availableSlots: number[]
      isPreferred: boolean
      isFloorPCA: boolean
    }>
  }> = [...wholeDaySubstitutionNeeds] // Start with whole-day substitutions

  nonFloatingPCA.forEach((pca) => {
    if (!pca.team) return
    const team = pca.team  // Capture non-null team for type safety
    
    const allocation = allocations.find(a => a.staff_id === pca.id)
    if (!allocation) return

    // Identify missing slots (slots NOT in availableSlots)
    const allSlots = [1, 2, 3, 4]
    const availableSlots = pca.availableSlots && pca.availableSlots.length > 0
      ? pca.availableSlots
      : [1, 2, 3, 4]
    const missingSlots = allSlots.filter(slot => !availableSlots.includes(slot))
    
    if (missingSlots.length === 0) return // All slots available, no substitution needed

    // Get actual FTE to determine if substitution is needed
    const actualFTE = pca.fte_pca || 0
    if (Math.abs(actualFTE - 1.0) < 0.001) {
      return // FTE = 1.0, no substitution needed
    }

    // Collect substitution need (will be handled by callback or automatic algorithm)
    const availableFloatingPCAs = getAvailableFloatingPCAsForSubstitution(team, missingSlots, allocations)
    substitutionNeeds.push({
      nonFloatingPCAId: pca.id,
      nonFloatingPCAName: pca.name,
      team,
      fte: actualFTE,
      missingSlots,
      availableFloatingPCAs
    })
  })

  // If callback is provided, use it to get user selections (includes both whole-day and partial substitutions)
  let userSubstitutionSelections: Record<string, { floatingPCAId: string; slots: number[] }> = {}
  if (context.onNonFloatingSubstitution && substitutionNeeds.length > 0) {
    userSubstitutionSelections = await context.onNonFloatingSubstitution(substitutionNeeds)
  }

  // Apply user selections for whole-day substitutions first
  wholeDaySubstitutionNeeds.forEach((subNeed) => {
    const selectionKey = `${subNeed.team}-${subNeed.nonFloatingPCAId}`
    const userSelection = userSubstitutionSelections[selectionKey]

    if (userSelection) {
      // Use user's selection
      const floatingPca = floatingPCA.find(p => p.id === userSelection.floatingPCAId)
      if (!floatingPca) return

      const existingAllocation = allocations.find(a => a.staff_id === floatingPca.id)
      
      if (existingAllocation) {
        // Update existing allocation - assign all 4 slots
        existingAllocation.slot1 = subNeed.team
        existingAllocation.slot2 = subNeed.team
        existingAllocation.slot3 = subNeed.team
        existingAllocation.slot4 = subNeed.team
        existingAllocation.team = subNeed.team
        const baseFTE = floatingPca.fte_pca
        updateAllocationFTE(existingAllocation, baseFTE)
      } else {
        // Create new allocation for whole-day substitution
        const newAllocation: PCAAllocation = {
          id: crypto.randomUUID(),
          schedule_id: '',
          staff_id: floatingPca.id,
          team: subNeed.team,
          fte_pca: 1.0, // Full day
          fte_remaining: floatingPca.fte_pca - 1.0,
          slot_assigned: 1.0,
          slot_whole: null,
          slot1: subNeed.team,
          slot2: subNeed.team,
          slot3: subNeed.team,
          slot4: subNeed.team,
          leave_type: floatingPca.leave_type,
          special_program_ids: null,
        }
        allocations.push(newAllocation)
      }

      // Update tracking
      teamPCAAssigned[subNeed.team] += 1.0
    } else {
      // Use automatic algorithm (original logic) - only if callback not provided or user skipped
      // Get team's PCA preferences
      const teamPreference = context.pcaPreferences.find(p => p.team === subNeed.team)
      const preferredPCAIds = teamPreference?.preferred_pca_ids || []
      
      // Find a floating PCA that can cover all 4 slots
      let substituteFound = false
      
      // Try preferred PCAs first
      for (const preferredPcaId of preferredPCAIds) {
        const floatingPca = floatingPCA.find(
          p => p.id === preferredPcaId &&
          p.is_available &&
          p.fte_pca >= 1.0 // Need full 1.0 FTE for whole-day substitution
        )
        
        if (!floatingPca) continue
        
        // Check if this floating PCA already has allocations
        const existingAllocation = allocations.find(a => a.staff_id === floatingPca.id)
        if (existingAllocation) {
          // Check if all 4 slots are available (not already assigned)
          if (existingAllocation.slot1 !== null || existingAllocation.slot2 !== null ||
              existingAllocation.slot3 !== null || existingAllocation.slot4 !== null) {
            continue // Some slots already assigned, skip
          }
          
          // Assign all 4 slots to the unavailable PCA's team
          existingAllocation.slot1 = subNeed.team
          existingAllocation.slot2 = subNeed.team
          existingAllocation.slot3 = subNeed.team
          existingAllocation.slot4 = subNeed.team
          existingAllocation.team = subNeed.team
          
          const baseFTE = floatingPca.fte_pca
          updateAllocationFTE(existingAllocation, baseFTE)
        } else {
          // Create new allocation for floating PCA to substitute all 4 slots
          const newAllocation: PCAAllocation = {
            id: crypto.randomUUID(),
            schedule_id: '',
            staff_id: floatingPca.id,
            team: subNeed.team,
            fte_pca: 1.0, // Full day
            fte_remaining: floatingPca.fte_pca - 1.0,
            slot_assigned: 1.0,
            slot_whole: null,
            slot1: subNeed.team,
            slot2: subNeed.team,
            slot3: subNeed.team,
            slot4: subNeed.team,
            leave_type: floatingPca.leave_type,
            special_program_ids: null,
          }
          allocations.push(newAllocation)
        }
        
        // Update tracking
        teamPCAAssigned[subNeed.team] += 1.0
        substituteFound = true
        break
      }
      
      // If no preferred PCA found, try any available floating PCA
      if (!substituteFound) {
        const floatingPca = floatingPCA.find(
          p => p.is_available &&
          p.fte_pca >= 1.0 && // Need full 1.0 FTE for whole-day substitution
          !allocations.some(a => a.staff_id === p.id) // Not already allocated
        )
        
        if (floatingPca) {
          // Create new allocation for floating PCA to substitute all 4 slots
          const newAllocation: PCAAllocation = {
            id: crypto.randomUUID(),
            schedule_id: '',
            staff_id: floatingPca.id,
            team: subNeed.team,
            fte_pca: 1.0, // Full day
            fte_remaining: floatingPca.fte_pca - 1.0,
            slot_assigned: 1.0,
            slot_whole: null,
            slot1: subNeed.team,
            slot2: subNeed.team,
            slot3: subNeed.team,
            slot4: subNeed.team,
            leave_type: floatingPca.leave_type,
            special_program_ids: null,
          }
          allocations.push(newAllocation)
          
          // Update tracking
          teamPCAAssigned[subNeed.team] += 1.0
          substituteFound = true
        }
      }
      
      // If still no substitute found, log error
      if (!substituteFound) {
        if (!errors.missingSlotSubstitution) {
          errors.missingSlotSubstitution = `No floating PCA available to substitute for ${subNeed.nonFloatingPCAName} (FTE=0) in team ${subNeed.team}`
        } else {
          errors.missingSlotSubstitution += `; ${subNeed.nonFloatingPCAName} (FTE=0) in team ${subNeed.team}`
        }
      }
    }
  })

  // Part 1.2: Substitute missing slots with floating PCAs
  // For non-floating PCAs with unavailable slots, find floating PCAs to substitute those missing slots
  const unsubstitutedSlots: Array<{pcaName: string, team: Team, slots: number[]}> = []
  
  // Helper function to check if a PCA ID appears in any team's preference
  const isPCAInAnyTeamPreference = (pcaId: string): boolean => {
    return context.pcaPreferences.some(pref => 
      pref.preferred_pca_ids.includes(pcaId)
    )
  }


  // Apply user selections or use automatic algorithm for partial substitutions
  const partialSubstitutionNeeds = substitutionNeeds.filter(sub => sub.fte !== 0)
  partialSubstitutionNeeds.forEach((subNeed) => {
    const selectionKey = `${subNeed.team}-${subNeed.nonFloatingPCAId}`
    const userSelection = userSubstitutionSelections[selectionKey]

    if (userSelection) {
      // Use user's selection
      const floatingPca = floatingPCA.find(p => p.id === userSelection.floatingPCAId)
      if (!floatingPca) return

      const existingAllocation = allocations.find(a => a.staff_id === floatingPca.id)
      
      if (existingAllocation) {
        // Update existing allocation
        userSelection.slots.forEach(slot => {
          const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : 'slot4'
          if (existingAllocation[slotField] === null) {
            existingAllocation[slotField] = subNeed.team
          }
        })
        const baseFTE = floatingPca.fte_pca
        updateAllocationFTE(existingAllocation, baseFTE)
      } else {
        // Create new allocation
        const slot1Team = userSelection.slots.includes(1) ? subNeed.team : null
        const slot2Team = userSelection.slots.includes(2) ? subNeed.team : null
        const slot3Team = userSelection.slots.includes(3) ? subNeed.team : null
        const slot4Team = userSelection.slots.includes(4) ? subNeed.team : null
        
        const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
        const newAllocation: PCAAllocation = {
          id: crypto.randomUUID(),
          schedule_id: '',
          staff_id: floatingPca.id,
          team: subNeed.team,
          fte_pca: floatingPca.fte_pca,
          fte_remaining: floatingPca.fte_pca - fteAssigned,
          slot_assigned: fteAssigned,
          slot_whole: null,
          slot1: slot1Team,
          slot2: slot2Team,
          slot3: slot3Team,
          slot4: slot4Team,
          leave_type: floatingPca.leave_type,
          special_program_ids: null,
        }
        allocations.push(newAllocation)
      }

      // Update tracking
      teamPCAAssigned[subNeed.team] += userSelection.slots.length * 0.25
    } else {
      // Use automatic algorithm (original logic)
      // Get team's PCA preferences
      const teamPreference = context.pcaPreferences.find(p => p.team === subNeed.team)
      const preferredPCAIds = teamPreference?.preferred_pca_ids || []
      
      // Track which slots couldn't be substituted
      const remainingMissingSlots: number[] = []
      
      // For each missing slot, find a floating PCA to substitute
      subNeed.missingSlots.forEach((missingSlot) => {
      let substituteFound = false
      
      // If team has preferences, try preferred PCA IDs first
      if (preferredPCAIds.length > 0) {
        for (const preferredPcaId of preferredPCAIds) {
          const floatingPca = floatingPCA.find(
            pca => pca.id === preferredPcaId &&
            pca.is_available &&
            // Check if this slot is available for the floating PCA
            (!pca.availableSlots || pca.availableSlots.length === 0 || pca.availableSlots.includes(missingSlot))
          )
          
          if (!floatingPca) continue
          
          // Check if this slot is already assigned to special program
          const existingAllocation = allocations.find(a => a.staff_id === floatingPca.id)
          if (existingAllocation) {
            const slotField = missingSlot === 1 ? 'slot1' : missingSlot === 2 ? 'slot2' : missingSlot === 3 ? 'slot3' : 'slot4'
            // Check if slot is assigned to special program
            if (existingAllocation[slotField] !== null && existingAllocation.special_program_ids && existingAllocation.special_program_ids.length > 0) {
              continue // Slot already assigned to special program, skip
            }
          }
          
          // Found suitable floating PCA - assign to non-floating PCA's team for this slot
          if (existingAllocation) {
            // Update existing allocation
            if (missingSlot === 1) existingAllocation.slot1 = subNeed.team
            if (missingSlot === 2) existingAllocation.slot2 = subNeed.team
            if (missingSlot === 3) existingAllocation.slot3 = subNeed.team
            if (missingSlot === 4) existingAllocation.slot4 = subNeed.team
            
            const baseFTE = floatingPca.fte_pca
            updateAllocationFTE(existingAllocation, baseFTE)
          } else {
            // Create new allocation
            const slot1Team = missingSlot === 1 ? subNeed.team : null
            const slot2Team = missingSlot === 2 ? subNeed.team : null
            const slot3Team = missingSlot === 3 ? subNeed.team : null
            const slot4Team = missingSlot === 4 ? subNeed.team : null
            
            const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
            const newAllocation: PCAAllocation = {
              id: crypto.randomUUID(),
              schedule_id: '',
              staff_id: floatingPca.id,
              team: subNeed.team,
              fte_pca: floatingPca.fte_pca,  // Use PCA's actual on-duty FTE (Base_FTE-remaining)
              fte_remaining: floatingPca.fte_pca - 0.25,  // True-FTE remaining after 1 slot assignment
              slot_assigned: fteAssigned,
              slot_whole: null,
              slot1: slot1Team,
              slot2: slot2Team,
              slot3: slot3Team,
              slot4: slot4Team,
              leave_type: floatingPca.leave_type,
              special_program_ids: null,
            }
            allocations.push(newAllocation)
          }
          
          // Update tracking
          teamPCAAssigned[subNeed.team] += 0.25
          substituteFound = true
          break // Exit preference loop - found substitute
        }
      }
      
      // If team has NO preferences, prioritize non-preferred PCAs first
      if (!substituteFound && preferredPCAIds.length === 0) {
        // Step 1: Try floating PCAs that are NOT in any team's preference list
        const nonPreferredFloating = floatingPCA.find(
          pca => pca.is_available &&
          !isPCAInAnyTeamPreference(pca.id) &&
          (!pca.availableSlots || pca.availableSlots.length === 0 || pca.availableSlots.includes(missingSlot))
        )
        
        if (nonPreferredFloating) {
          const existingAllocation = allocations.find(a => a.staff_id === nonPreferredFloating.id)
          
          // Check if slot is assigned to special program
          if (existingAllocation) {
            const slotField = missingSlot === 1 ? 'slot1' : missingSlot === 2 ? 'slot2' : missingSlot === 3 ? 'slot3' : 'slot4'
            if (existingAllocation[slotField] !== null && existingAllocation.special_program_ids && existingAllocation.special_program_ids.length > 0) {
              // Skip this, try fallback
            } else {
              // Assign non-preferred floating PCA
              if (missingSlot === 1) existingAllocation.slot1 = subNeed.team
              if (missingSlot === 2) existingAllocation.slot2 = subNeed.team
              if (missingSlot === 3) existingAllocation.slot3 = subNeed.team
              if (missingSlot === 4) existingAllocation.slot4 = subNeed.team
              
              const baseFTE = nonPreferredFloating.fte_pca
              updateAllocationFTE(existingAllocation, baseFTE)
              teamPCAAssigned[subNeed.team] += 0.25
              substituteFound = true
            }
          } else {
            // Create new allocation
            const slot1Team = missingSlot === 1 ? subNeed.team : null
            const slot2Team = missingSlot === 2 ? subNeed.team : null
            const slot3Team = missingSlot === 3 ? subNeed.team : null
            const slot4Team = missingSlot === 4 ? subNeed.team : null
            
            const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
            const newAllocation: PCAAllocation = {
              id: crypto.randomUUID(),
              schedule_id: '',
              staff_id: nonPreferredFloating.id,
              team: subNeed.team,
              fte_pca: nonPreferredFloating.fte_pca,  // Use PCA's actual on-duty FTE (Base_FTE-remaining)
              fte_remaining: nonPreferredFloating.fte_pca - 0.25,  // True-FTE remaining after 1 slot assignment
              slot_assigned: fteAssigned,
              slot_whole: null,
              slot1: slot1Team,
              slot2: slot2Team,
              slot3: slot3Team,
              slot4: slot4Team,
              leave_type: nonPreferredFloating.leave_type,
              special_program_ids: null,
            }
            allocations.push(newAllocation)
            teamPCAAssigned[subNeed.team] += 0.25
            substituteFound = true
          }
        }
        
        // Step 2: If no non-preferred PCA found, fallback to any available floating PCA (including preferred ones)
        if (!substituteFound) {
          const fallbackFloating = floatingPCA.find(
            pca => pca.is_available &&
            (!pca.availableSlots || pca.availableSlots.length === 0 || pca.availableSlots.includes(missingSlot))
          )
          
          if (fallbackFloating) {
            const existingAllocation = allocations.find(a => a.staff_id === fallbackFloating.id)
            
            // Check if slot is assigned to special program
            if (existingAllocation) {
              const slotField = missingSlot === 1 ? 'slot1' : missingSlot === 2 ? 'slot2' : missingSlot === 3 ? 'slot3' : 'slot4'
              if (existingAllocation[slotField] !== null && existingAllocation.special_program_ids && existingAllocation.special_program_ids.length > 0) {
                // Skip - no substitute available
              } else {
                // Assign fallback floating PCA
                if (missingSlot === 1) existingAllocation.slot1 = subNeed.team
                if (missingSlot === 2) existingAllocation.slot2 = subNeed.team
                if (missingSlot === 3) existingAllocation.slot3 = subNeed.team
                if (missingSlot === 4) existingAllocation.slot4 = subNeed.team
                
                const baseFTE = fallbackFloating.fte_pca
                updateAllocationFTE(existingAllocation, baseFTE)
                teamPCAAssigned[subNeed.team] += 0.25
                substituteFound = true
              }
            } else {
              const slot1Team = missingSlot === 1 ? subNeed.team : null
              const slot2Team = missingSlot === 2 ? subNeed.team : null
              const slot3Team = missingSlot === 3 ? subNeed.team : null
              const slot4Team = missingSlot === 4 ? subNeed.team : null
              
              const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
              const newAllocation: PCAAllocation = {
                id: crypto.randomUUID(),
                schedule_id: '',
                staff_id: fallbackFloating.id,
                team: subNeed.team,
                fte_pca: fallbackFloating.fte_pca,  // Use PCA's actual on-duty FTE (Base_FTE-remaining)
                fte_remaining: fallbackFloating.fte_pca - 0.25,  // True-FTE remaining after 1 slot assignment
                slot_assigned: fteAssigned,
                slot_whole: null,
                slot1: slot1Team,
                slot2: slot2Team,
                slot3: slot3Team,
                slot4: slot4Team,
                leave_type: fallbackFloating.leave_type,
                special_program_ids: null,
              }
              allocations.push(newAllocation)
              teamPCAAssigned[subNeed.team] += 0.25
              substituteFound = true
            }
          }
        }
      } else if (!substituteFound) {
        // If team has preferences but none found, try any available floating PCA
        const fallbackFloating = floatingPCA.find(
          pca => pca.is_available &&
          (!pca.availableSlots || pca.availableSlots.length === 0 || pca.availableSlots.includes(missingSlot))
        )
        
        if (fallbackFloating) {
          const existingAllocation = allocations.find(a => a.staff_id === fallbackFloating.id)
          
          // Check if slot is assigned to special program
          if (existingAllocation) {
            const slotField = missingSlot === 1 ? 'slot1' : missingSlot === 2 ? 'slot2' : missingSlot === 3 ? 'slot3' : 'slot4'
            if (existingAllocation[slotField] !== null && existingAllocation.special_program_ids && existingAllocation.special_program_ids.length > 0) {
              // Skip - no substitute available
            } else {
              // Assign fallback floating PCA
              if (missingSlot === 1) existingAllocation.slot1 = subNeed.team
              if (missingSlot === 2) existingAllocation.slot2 = subNeed.team
              if (missingSlot === 3) existingAllocation.slot3 = subNeed.team
              if (missingSlot === 4) existingAllocation.slot4 = subNeed.team
              
              const baseFTE = fallbackFloating.fte_pca
              updateAllocationFTE(existingAllocation, baseFTE)
              teamPCAAssigned[subNeed.team] += 0.25
              substituteFound = true
            }
          } else {
            const slot1Team = missingSlot === 1 ? subNeed.team : null
            const slot2Team = missingSlot === 2 ? subNeed.team : null
            const slot3Team = missingSlot === 3 ? subNeed.team : null
            const slot4Team = missingSlot === 4 ? subNeed.team : null
            
            const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
            const newAllocation: PCAAllocation = {
              id: crypto.randomUUID(),
              schedule_id: '',
              staff_id: fallbackFloating.id,
              team: subNeed.team,
              fte_pca: fallbackFloating.fte_pca,  // Use PCA's actual on-duty FTE (Base_FTE-remaining)
              fte_remaining: fallbackFloating.fte_pca - 0.25,  // True-FTE remaining after 1 slot assignment
              slot_assigned: fteAssigned,
              slot_whole: null,
              slot1: slot1Team,
              slot2: slot2Team,
              slot3: slot3Team,
              slot4: slot4Team,
              leave_type: fallbackFloating.leave_type,
              special_program_ids: null,
            }
            allocations.push(newAllocation)
            teamPCAAssigned[subNeed.team] += 0.25
            substituteFound = true
          }
        }
      }
      
        // Track if slot couldn't be substituted
        if (!substituteFound) {
          remainingMissingSlots.push(missingSlot)
        }
      })
      
      // Track unsubstituted slots for error reporting
      if (remainingMissingSlots.length > 0) {
        unsubstitutedSlots.push({
          pcaName: subNeed.nonFloatingPCAName,
          team: subNeed.team,
          slots: remainingMissingSlots
        })
      }
    }
  })
  
  // Create error message if any slots couldn't be substituted
  if (unsubstitutedSlots.length > 0) {
    const errorDetails = unsubstitutedSlots.map(item => 
      `${item.pcaName} (${item.team}): slots ${item.slots.join(', ')}`
    ).join('; ')
    errors.missingSlotSubstitution = `Unable to find floating PCA substitutes for missing slots: ${errorDetails}`
  }
  
  } // End of shouldDoNonFloating block

  // After Step 3 & 4: Calculate pending PCA-FTE/team (remaining PCA needed per team)
  // Store RAW pending values (no rounding) for accurate tie-breaking
  // Rounding down happens only when assigning slots
  const pendingPCAFTEPerTeam: Record<Team, number> = {
    FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0
  }
  
  Object.entries(context.averagePCAPerTeam).forEach(([team, baseRequired]) => {
    const teamKey = team as Team
    const assigned = teamPCAAssigned[teamKey]
    const pending = baseRequired - assigned
    // Store RAW pending value (no rounding) - rounding happens when assigning slots
    pendingPCAFTEPerTeam[teamKey] = Math.max(0, pending)
  })

  /*
  // LEGACY: Special-program allocation block (disabled).
  // We now run special-program allocation via runSpecialProgramAllocation() and control the timing:
  // - If non-floating substitution is needed: allocate special programs BEFORE substitution candidate list
  // - Otherwise: allocate special programs here (after non-floating/substitution)
  //
  // Get weekday for special program and floating PCA allocation
  const weekday = getWeekday(context.date)
  
  // ============================================================================
  // SPECIAL PROGRAM PCA ALLOCATION (Phase: 'non-floating-with-special' or 'all')
  // ============================================================================
  if (shouldDoSpecialProgram) {
  // Priority 1: Special program requirements
  // Note: DRM is skipped here because it doesn't have designated PCA staff.
  // DRM only adds +0.4 FTE to DRO's required PCA/team (already applied to averagePCAPerTeam).
  // Floating PCA allocation (Priority 3-4) will respect the higher DRO requirement.
  const unallocatedPrograms: string[] = []
  context.specialPrograms.forEach((program) => {
    if (!program.weekdays.includes(weekday)) return
    
    // Skip DRM - it doesn't have designated PCA staff, only adds to DRO's required FTE
    if (program.name === 'DRM') return
    
    let programSlots = program.slots[weekday] || []
    
    // Fallback: If slots are empty but program is active for this weekday, use default slots
    // For Robotic: always use slots [1, 2, 3, 4] (all slots)
    // For CRP: derive from SPT allocations (therapist running the program determines slots)
    // For other programs: use slots from program configuration or default to [1, 2, 3, 4]
    if (programSlots.length === 0) {
      if (program.name === 'Robotic') {
        programSlots = [1, 2, 3, 4] // Robotic always uses all 4 slots
      } else if (program.name === 'CRP') {
        // For CRP, slots should be determined by which therapist runs it
        // Check SPT allocations to find which therapist is running CRP on this weekday
        // For now, default to slot 2 (most common for CRP)
        programSlots = [2]
      } else {
        // For other programs, default to all slots if not specified
        programSlots = [1, 2, 3, 4]
      }
    }
    
    if (programSlots.length === 0) return

    // Find teams that need this special program PCA
    // Use tolerance (0.01) to avoid floating point precision issues (e.g., 1.0 vs 1.0001)
    const TOLERANCE = 0.01
    const teamsNeedingProgram = Object.entries(context.averagePCAPerTeam)
      .filter(([team, required]) => {
        const teamKey = team as Team
        const preference = context.pcaPreferences.find(p => p.team === teamKey)
        const gymSlot = preference?.gym_schedule ?? null
        const slotConflict = programSlots.some(slot => slot === gymSlot)
        
        // Check if we should avoid gym schedule for this team (floating PCA only)
        const avoidGym = shouldAvoidGymSchedule(preference)
        
        // If there's a conflict and we should avoid gym, skip this team
        if (slotConflict && avoidGym) {
          return false
        }
        
        // Use tolerance to handle floating point precision issues (e.g., DRM add-on creating 1.0001 vs 1.0)
        return teamPCAAssigned[teamKey] < (required - TOLERANCE)
      })
      .map(([team]) => team as Team)

    if (teamsNeedingProgram.length === 0) return

    // Use PCA preference order if available, otherwise use any available PCA
    let pcaToAssign: PCAData | null = null
    let assignedPCAId: string | null = null

    if (program.pca_preference_order && program.pca_preference_order.length > 0) {
      // Try preference order first
      for (const preferredPcaId of program.pca_preference_order) {
        // Check floating PCA first (as per requirement: floating first)
        const floatingPca = floatingPCA.find(
          pca => pca.id === preferredPcaId &&
          pca.special_program?.includes(program.name) &&
          pca.is_available &&
          !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
        )
        
        if (floatingPca) {
          pcaToAssign = floatingPca
          assignedPCAId = preferredPcaId
          break
        }
        
        // Check non-floating PCA (if floating not found)
        const nonFloatingPca = nonFloatingPCA.find(
          pca => pca.id === preferredPcaId &&
          pca.special_program?.includes(program.name) &&
          pca.is_available &&
          !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
        )
        
        if (nonFloatingPca) {
          pcaToAssign = nonFloatingPca
          assignedPCAId = preferredPcaId
          break
        }
      }
      
      // If all in preference list are unavailable, fall back to any available PCA
      if (!pcaToAssign) {
        // For DRM, use any available floating PCA (no special program requirement)
        // For other programs, use PCA with the special program
        if (program.name === 'DRM') {
          // Try floating PCA first (any available floating PCA)
          const fallbackFloating = floatingPCA.find(
            pca => pca.is_available &&
            !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
          )
          
          if (fallbackFloating) {
            pcaToAssign = fallbackFloating
          } else {
            // Try non-floating PCA
            const fallbackNonFloating = nonFloatingPCA.find(
              pca => pca.is_available &&
              !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
            )
            
            if (fallbackNonFloating) {
              pcaToAssign = fallbackNonFloating
            }
          }
        } else {
          // Other programs: use PCA with the special program
          const fallbackFloating = floatingPCA.find(
            pca => pca.special_program?.includes(program.name) &&
            pca.is_available &&
            !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
          )
          
          if (fallbackFloating) {
            pcaToAssign = fallbackFloating
          } else {
            // Try non-floating PCA
            const fallbackNonFloating = nonFloatingPCA.find(
              pca => pca.special_program?.includes(program.name) &&
              pca.is_available &&
              !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
            )
            
            if (fallbackNonFloating) {
              pcaToAssign = fallbackNonFloating
            }
          }
        }
      }
    } else {
      // No preference order - for DRM, use ANY available floating PCA (not just those with DRM in special_program)
      // For other programs, use PCA with the special program
      if (program.name === 'DRM') {
        // DRM: Use any available floating PCA (no special program requirement)
        const availableFloatingPCA = floatingPCA.find(
          pca => pca.is_available &&
          !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
        )
        
        if (availableFloatingPCA) {
          pcaToAssign = availableFloatingPCA
        } else {
          // Fall back to non-floating PCA if no floating available
          const availableNonFloatingPCA = nonFloatingPCA.find(
            pca => pca.is_available &&
            !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
          )
          
          if (availableNonFloatingPCA) {
            pcaToAssign = availableNonFloatingPCA
          }
        }
      } else {
        // Other programs: use PCA with the special program (existing logic)
        const availableFloatingPCA = floatingPCA.find(
          pca => pca.special_program?.includes(program.name) &&
          pca.is_available &&
          !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
        )
        
        if (availableFloatingPCA) {
          pcaToAssign = availableFloatingPCA
        } else {
          // Fall back to non-floating PCA
          const availableNonFloatingPCA = nonFloatingPCA.find(
            pca => pca.special_program?.includes(program.name) &&
            pca.is_available &&
            !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
          )
          
          if (availableNonFloatingPCA) {
            pcaToAssign = availableNonFloatingPCA
          }
        }
      }
    }

    // For special programs, determine target teams based on program type
    // Robotic: slots go to SMM (1-2) and SFM (3-4), so we need to check if SMM or SFM need PCA
    // CRP: slot goes to the team running the program (determined by which team has staff in program)
    // Other programs: use the team that needs PCA
    let targetTeamsForProgram: Team[] = []
    
    if (program.name === 'Robotic') {
      // Robotic: Check if SMM or SFM need PCA (slots 1-2 go to SMM, 3-4 go to SFM)
      if (teamPCAAssigned['SMM'] < context.averagePCAPerTeam['SMM'] || 
          teamPCAAssigned['SFM'] < context.averagePCAPerTeam['SFM']) {
        // Use SMM as the primary team (slots will be mapped correctly by getSlotTeamForSpecialProgram)
        targetTeamsForProgram = ['SMM']
      }
    } else if (program.name === 'CRP') {
      // CRP: Find which team has staff assigned to this program
      // Check program.staff_ids to find which team the staff belongs to
      // For now, default to CPPC (as user mentioned Amanda from CPPC runs it)
      // In the future, this could be determined from therapist allocations
      targetTeamsForProgram = ['CPPC']
    } else {
      // Other programs: use teams needing PCA (existing logic)
      targetTeamsForProgram = teamsNeedingProgram
    }
    
    if (targetTeamsForProgram.length === 0) return
    
    // Assign PCA to target teams (for Robotic/CRP, only one allocation; for others, one per team)
    // For Robotic/CRP, check if we've already created an allocation for this program
    let programAllocationCreated = false
    let programAssigned = false // Track if any PCA was assigned for this program
    
    targetTeamsForProgram.forEach((targetTeam) => {
      // For Robotic/CRP, only create one allocation total (not per team)
      if ((program.name === 'Robotic' || program.name === 'CRP') && programAllocationCreated) {
        return
      }
      
      const neededFTE = context.averagePCAPerTeam[targetTeam] - teamPCAAssigned[targetTeam]
      if (neededFTE <= 0 && program.name !== 'Robotic') return // For Robotic, always create allocation if SMM/SFM need it
      
      let assigned = false
      
      // Try preference order first if available
      if (program.pca_preference_order && program.pca_preference_order.length > 0) {
        for (const preferredPcaId of program.pca_preference_order) {
          // Check floating PCA first
          // For special programs (Robotic/CRP), check if PCA already has allocation for this program (any team)
          // For other programs, check if PCA has allocation for this program and team
          const floatingPca = floatingPCA.find(
            pca => pca.id === preferredPcaId &&
            pca.special_program?.includes(program.name) &&
            pca.is_available &&
            (program.name === 'Robotic' || program.name === 'CRP'
              ? !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
              : !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id) && a.team === targetTeam))
          )
          
          if (floatingPca) {
            // For special programs (Robotic/CRP), find allocation by program, not by team
            // For other programs, find by team
            const existingAllocation = (program.name === 'Robotic' || program.name === 'CRP')
              ? allocations.find(a => a.staff_id === floatingPca.id && a.special_program_ids?.includes(program.id))
              : allocations.find(a => a.staff_id === floatingPca.id && a.team === targetTeam)
            const remainingFTE = existingAllocation?.fte_remaining ?? floatingPca.fte_pca

            // Any allocation (including substitutions) for slot-usage checks
            const anyAllocationForPCA = allocations.find(a => a.staff_id === floatingPca.id)
            const anyAssignedSlots = anyAllocationForPCA
              ? [1, 2, 3, 4].filter(slot => {
                  const slotTeam = slot === 1 ? anyAllocationForPCA.slot1 : slot === 2 ? anyAllocationForPCA.slot2 : slot === 3 ? anyAllocationForPCA.slot3 : anyAllocationForPCA.slot4
                  return slotTeam !== null
                })
              : []

            // CRITICAL: Do not assign special program PCA if required program slots are already occupied
            // (e.g., PCA used as non-floating substitute already has slots assigned)
            const requiredProgramSlots = programSlots
            const anyAllocationHasRequiredSlotsOccupied = anyAllocationForPCA
              ? requiredProgramSlots.some(slot => {
                  const slotTeam = slot === 1 ? anyAllocationForPCA.slot1 : slot === 2 ? anyAllocationForPCA.slot2 : slot === 3 ? anyAllocationForPCA.slot3 : anyAllocationForPCA.slot4
                  return slotTeam !== null
                })
              : false
            if (anyAllocationHasRequiredSlotsOccupied) {
              continue
            }
              if (remainingFTE > 0) {
              // Calculate FTE based on number of slots assigned
              // Each slot is 0.25 FTE, so slots 1+2+3+4 = 1.0 FTE total
              const slotsToAssign = programSlots.length
              const ftePerSlot = 0.25
              const fteForSlots = slotsToAssign * ftePerSlot
              // For special programs, use all slots FTE, not just what's needed by the team
              const fteToAssign = program.name === 'Robotic' || program.name === 'CRP'
                ? Math.min(remainingFTE, fteForSlots) // Use full slot FTE for special programs
                : Math.min(neededFTE, remainingFTE, fteForSlots, program.pca_required || fteForSlots)
              
              // IMPORTANT: reuse the PCA's existing allocation (if any) to avoid duplicate allocations for the same staff_id
              const baseAllocationForPCA = allocations.find(a => a.staff_id === floatingPca.id) ?? existingAllocation

              if (baseAllocationForPCA) {
                // Track newly assigned slots to avoid double-counting
                const newlyAssignedSlots: { slot: number, team: Team }[] = []
                programSlots.forEach(slot => {
                  const slotTeam = getSlotTeamForSpecialProgram(program.name, slot, targetTeam)
                  if (slot === 1 && baseAllocationForPCA.slot1 === null && slotTeam) {
                    baseAllocationForPCA.slot1 = slotTeam
                    newlyAssignedSlots.push({ slot: 1, team: slotTeam })
                  }
                  if (slot === 2 && baseAllocationForPCA.slot2 === null && slotTeam) {
                    baseAllocationForPCA.slot2 = slotTeam
                    newlyAssignedSlots.push({ slot: 2, team: slotTeam })
                  }
                  if (slot === 3 && baseAllocationForPCA.slot3 === null && slotTeam) {
                    baseAllocationForPCA.slot3 = slotTeam
                    newlyAssignedSlots.push({ slot: 3, team: slotTeam })
                  }
                  if (slot === 4 && baseAllocationForPCA.slot4 === null && slotTeam) {
                    baseAllocationForPCA.slot4 = slotTeam
                    newlyAssignedSlots.push({ slot: 4, team: slotTeam })
                  }
                })
                baseAllocationForPCA.fte_remaining -= fteToAssign
                if (!baseAllocationForPCA.special_program_ids) {
                  baseAllocationForPCA.special_program_ids = []
                }
                if (!baseAllocationForPCA.special_program_ids.includes(program.id)) {
                  baseAllocationForPCA.special_program_ids.push(program.id)
                }
                // Update teamPCAAssigned only for newly assigned slots (0.25 per slot)
                newlyAssignedSlots.forEach(({ team }) => {
                  teamPCAAssigned[team] += 0.25
                })
              } else {
                const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program.name, 1, targetTeam) : null
                const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program.name, 2, targetTeam) : null
                const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program.name, 3, targetTeam) : null
                const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program.name, 4, targetTeam) : null
                
                const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
                const allocation: PCAAllocation = {
                  id: crypto.randomUUID(),
                  schedule_id: '',
                  staff_id: floatingPca.id,
                  team: targetTeam,
                  fte_pca: floatingPca.fte_pca,  // Use PCA's actual on-duty FTE (Base_FTE-remaining)
                  fte_remaining: floatingPca.fte_pca - fteToAssign,  // True-FTE remaining after this assignment
                  slot_assigned: fteAssigned,
                  slot_whole: null,
                  slot1: slot1Team,
                  slot2: slot2Team,
                  slot3: slot3Team,
                  slot4: slot4Team,
                  leave_type: null,
                  special_program_ids: [program.id],
                }
                allocations.push(allocation)
                // Update teamPCAAssigned for each slot team (not just targetTeam)
                updateTeamPCAAssignedFromSlots(teamPCAAssigned, slot1Team, slot2Team, slot3Team, slot4Team)
              }
              assigned = true
              programAssigned = true
              if (program.name === 'Robotic' || program.name === 'CRP') {
                programAllocationCreated = true
              }
              break
            }
          }
          
          // Check non-floating PCA if floating not found
          // For special programs (Robotic/CRP), check if PCA already has allocation for this program (any team)
          const nonFloatingPca = nonFloatingPCA.find(
            pca => pca.id === preferredPcaId &&
            pca.special_program?.includes(program.name) &&
            pca.is_available &&
            (program.name === 'Robotic' || program.name === 'CRP'
              ? !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
              : !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id) && a.team === targetTeam))
          )
          
          if (nonFloatingPca) {
            // For special programs (Robotic/CRP), find allocation by program, not by team
            const existingAllocation = (program.name === 'Robotic' || program.name === 'CRP')
              ? allocations.find(a => a.staff_id === nonFloatingPca.id && a.special_program_ids?.includes(program.id))
              : allocations.find(a => a.staff_id === nonFloatingPca.id && a.team === targetTeam)
            const remainingFTE = existingAllocation?.fte_remaining || 1
            
            if (remainingFTE > 0) {
              // Calculate FTE based on number of slots assigned
              const slotsToAssign = programSlots.length
              const ftePerSlot = 0.25
              const fteForSlots = slotsToAssign * ftePerSlot
              const fteToAssign = Math.min(neededFTE, remainingFTE, fteForSlots, program.pca_required || fteForSlots)
              
              if (existingAllocation) {
                // Track newly assigned slots to avoid double-counting
                const newlyAssignedSlots: { slot: number, team: Team }[] = []
                programSlots.forEach(slot => {
                  const slotTeam = getSlotTeamForSpecialProgram(program.name, slot, targetTeam)
                  if (slot === 1 && existingAllocation.slot1 === null && slotTeam) {
                    existingAllocation.slot1 = slotTeam
                    newlyAssignedSlots.push({ slot: 1, team: slotTeam })
                  }
                  if (slot === 2 && existingAllocation.slot2 === null && slotTeam) {
                    existingAllocation.slot2 = slotTeam
                    newlyAssignedSlots.push({ slot: 2, team: slotTeam })
                  }
                  if (slot === 3 && existingAllocation.slot3 === null && slotTeam) {
                    existingAllocation.slot3 = slotTeam
                    newlyAssignedSlots.push({ slot: 3, team: slotTeam })
                  }
                  if (slot === 4 && existingAllocation.slot4 === null && slotTeam) {
                    existingAllocation.slot4 = slotTeam
                    newlyAssignedSlots.push({ slot: 4, team: slotTeam })
                  }
                })
                existingAllocation.fte_remaining -= fteToAssign
                if (!existingAllocation.special_program_ids) {
                  existingAllocation.special_program_ids = []
                }
                if (!existingAllocation.special_program_ids.includes(program.id)) {
                  existingAllocation.special_program_ids.push(program.id)
                }
                // Update teamPCAAssigned only for newly assigned slots (0.25 per slot)
                newlyAssignedSlots.forEach(({ team }) => {
                  teamPCAAssigned[team] += 0.25
                })
              } else {
                const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program.name, 1, targetTeam) : null
                const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program.name, 2, targetTeam) : null
                const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program.name, 3, targetTeam) : null
                const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program.name, 4, targetTeam) : null
                const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
                
                const allocation: PCAAllocation = {
                  id: crypto.randomUUID(),
                  schedule_id: '',
                  staff_id: nonFloatingPca.id,
                  team: targetTeam,
                  fte_pca: nonFloatingPca.fte_pca,  // Use PCA's actual on-duty FTE (Base_FTE-remaining)
                  fte_remaining: nonFloatingPca.fte_pca - fteToAssign,  // True-FTE remaining after this assignment
                  slot_assigned: fteAssigned,
                  slot_whole: null,
                  slot1: slot1Team,
                  slot2: slot2Team,
                  slot3: slot3Team,
                  slot4: slot4Team,
                  leave_type: null,
                  special_program_ids: [program.id],
                }
                allocations.push(allocation)
                // Update teamPCAAssigned for each slot team (not just targetTeam)
                updateTeamPCAAssignedFromSlots(teamPCAAssigned, slot1Team, slot2Team, slot3Team, slot4Team)
              }
              assigned = true
              programAssigned = true
              if (program.name === 'Robotic' || program.name === 'CRP') {
                programAllocationCreated = true
              }
              break
            }
          }
        }
      }
      
      // If not assigned from preference order, fall back to any available PCA
      if (!assigned) {
        // Try floating PCA first
        // For special programs (Robotic/CRP), check if PCA already has allocation for this program (any team)
        const fallbackFloating = floatingPCA.find(
          pca => pca.special_program?.includes(program.name) &&
          pca.is_available &&
          (program.name === 'Robotic' || program.name === 'CRP'
            ? !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
            : !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id) && a.team === targetTeam))
        )
        
        if (fallbackFloating) {
          const existingAllocation = allocations.find(a => a.staff_id === fallbackFloating.id && a.team === targetTeam)
          const remainingFTE = existingAllocation?.fte_remaining || 1
          
          if (remainingFTE > 0) {
            // Calculate FTE based on number of slots assigned
            const slotsToAssign = programSlots.length
            const ftePerSlot = 0.25
            const fteForSlots = slotsToAssign * ftePerSlot
            // For special programs, use all slots FTE, not just what's needed by the team
            const fteToAssign = program.name === 'Robotic' || program.name === 'CRP'
              ? Math.min(remainingFTE, fteForSlots) // Use full slot FTE for special programs
              : Math.min(neededFTE, remainingFTE, fteForSlots, program.pca_required || fteForSlots)
            
            if (existingAllocation) {
              // Track newly assigned slots to avoid double-counting
              const newlyAssignedSlots: { slot: number, team: Team }[] = []
              programSlots.forEach(slot => {
                const slotTeam = getSlotTeamForSpecialProgram(program.name, slot, targetTeam)
                if (slot === 1 && existingAllocation.slot1 === null && slotTeam) {
                  existingAllocation.slot1 = slotTeam
                  newlyAssignedSlots.push({ slot: 1, team: slotTeam })
                }
                if (slot === 2 && existingAllocation.slot2 === null && slotTeam) {
                  existingAllocation.slot2 = slotTeam
                  newlyAssignedSlots.push({ slot: 2, team: slotTeam })
                }
                if (slot === 3 && existingAllocation.slot3 === null && slotTeam) {
                  existingAllocation.slot3 = slotTeam
                  newlyAssignedSlots.push({ slot: 3, team: slotTeam })
                }
                if (slot === 4 && existingAllocation.slot4 === null && slotTeam) {
                  existingAllocation.slot4 = slotTeam
                  newlyAssignedSlots.push({ slot: 4, team: slotTeam })
                }
              })
              existingAllocation.fte_remaining -= fteToAssign
              if (!existingAllocation.special_program_ids) {
                existingAllocation.special_program_ids = []
              }
              if (!existingAllocation.special_program_ids.includes(program.id)) {
                existingAllocation.special_program_ids.push(program.id)
              }
              // Update teamPCAAssigned only for newly assigned slots (0.25 per slot)
              newlyAssignedSlots.forEach(({ team }) => {
                teamPCAAssigned[team] += 0.25
              })
            } else {
              const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program.name, 1, targetTeam) : null
              const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program.name, 2, targetTeam) : null
              const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program.name, 3, targetTeam) : null
              const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program.name, 4, targetTeam) : null
              const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
              
              const allocation: PCAAllocation = {
                id: crypto.randomUUID(),
                schedule_id: '',
                staff_id: fallbackFloating.id,
                team: targetTeam,
                fte_pca: fallbackFloating.fte_pca,  // Use PCA's actual on-duty FTE (Base_FTE-remaining)
                fte_remaining: fallbackFloating.fte_pca - fteToAssign,  // True-FTE remaining after this assignment
                slot_assigned: fteAssigned,
                slot_whole: null,
                slot1: slot1Team,
                slot2: slot2Team,
                slot3: slot3Team,
                slot4: slot4Team,
                leave_type: null,
                special_program_ids: [program.id],
              }
              allocations.push(allocation)
              // Update teamPCAAssigned for each slot team (not just targetTeam)
              updateTeamPCAAssignedFromSlots(teamPCAAssigned, slot1Team, slot2Team, slot3Team, slot4Team)
            }
            assigned = true
            programAssigned = true
          }
        }
        
        // Try non-floating PCA if floating not available
        if (!assigned) {
          // For special programs (Robotic/CRP), check if PCA already has allocation for this program (any team)
          const fallbackNonFloating = nonFloatingPCA.find(
            pca => pca.special_program?.includes(program.name) &&
            pca.is_available &&
            (program.name === 'Robotic' || program.name === 'CRP'
              ? !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id))
              : !allocations.some(a => a.staff_id === pca.id && a.special_program_ids?.includes(program.id) && a.team === targetTeam))
          )
          
          if (fallbackNonFloating) {
            const existingAllocation = allocations.find(a => a.staff_id === fallbackNonFloating.id && a.team === targetTeam)
            const remainingFTE = existingAllocation?.fte_remaining || 1
            
            if (remainingFTE > 0) {
              // Calculate FTE based on number of slots assigned
              const slotsToAssign = programSlots.length
              const ftePerSlot = 0.25
              const fteForSlots = slotsToAssign * ftePerSlot
              const fteToAssign = Math.min(neededFTE, remainingFTE, fteForSlots, program.pca_required || fteForSlots)
              
              if (existingAllocation) {
                // Track newly assigned slots to avoid double-counting
                const newlyAssignedSlots: { slot: number, team: Team }[] = []
                programSlots.forEach(slot => {
                  const slotTeam = getSlotTeamForSpecialProgram(program.name, slot, targetTeam)
                  if (slot === 1 && existingAllocation.slot1 === null && slotTeam) {
                    existingAllocation.slot1 = slotTeam
                    newlyAssignedSlots.push({ slot: 1, team: slotTeam })
                  }
                  if (slot === 2 && existingAllocation.slot2 === null && slotTeam) {
                    existingAllocation.slot2 = slotTeam
                    newlyAssignedSlots.push({ slot: 2, team: slotTeam })
                  }
                  if (slot === 3 && existingAllocation.slot3 === null && slotTeam) {
                    existingAllocation.slot3 = slotTeam
                    newlyAssignedSlots.push({ slot: 3, team: slotTeam })
                  }
                  if (slot === 4 && existingAllocation.slot4 === null && slotTeam) {
                    existingAllocation.slot4 = slotTeam
                    newlyAssignedSlots.push({ slot: 4, team: slotTeam })
                  }
                })
                existingAllocation.fte_remaining -= fteToAssign
                if (!existingAllocation.special_program_ids) {
                  existingAllocation.special_program_ids = []
                }
                if (!existingAllocation.special_program_ids.includes(program.id)) {
                  existingAllocation.special_program_ids.push(program.id)
                }
                // Update teamPCAAssigned only for newly assigned slots (0.25 per slot)
                newlyAssignedSlots.forEach(({ team }) => {
                  teamPCAAssigned[team] += 0.25
                })
              } else {
                const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program.name, 1, targetTeam) : null
                const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program.name, 2, targetTeam) : null
                const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program.name, 3, targetTeam) : null
                const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program.name, 4, targetTeam) : null
                const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
                
                const allocation: PCAAllocation = {
                  id: crypto.randomUUID(),
                  schedule_id: '',
                  staff_id: fallbackNonFloating.id,
                  team: targetTeam,
                  fte_pca: fallbackNonFloating.fte_pca,  // Use PCA's actual on-duty FTE (Base_FTE-remaining)
                  fte_remaining: fallbackNonFloating.fte_pca - fteToAssign,  // True-FTE remaining after this assignment
                  slot_assigned: fteAssigned,
                  slot_whole: null,
                  slot1: slot1Team,
                  slot2: slot2Team,
                  slot3: slot3Team,
                  slot4: slot4Team,
                  leave_type: null,
                  special_program_ids: [program.id],
                }
                allocations.push(allocation)
                // Update teamPCAAssigned for each slot team (not just targetTeam)
                updateTeamPCAAssignedFromSlots(teamPCAAssigned, slot1Team, slot2Team, slot3Team, slot4Team)
              }
            }
          }
        }
      }
    })
    
    // Track if program couldn't be allocated
    if (!programAssigned && teamsNeedingProgram.length > 0) {
      unallocatedPrograms.push(program.name)
    }
  })
  
  // Create error message if any programs couldn't be allocated
  if (unallocatedPrograms.length > 0) {
    errors.specialProgramAllocation = `Unable to find PCA for special programs: ${unallocatedPrograms.join(', ')}`
  }
  } // End of shouldDoSpecialProgram block
  */

  // ============================================================================
  // SPECIAL PROGRAM PCA ALLOCATION (Phase: 'non-floating-with-special' or 'all')
  // ============================================================================
  if (shouldDoSpecialProgram && !specialProgramsAllocated) {
    runSpecialProgramAllocation()
    specialProgramsAllocated = true
  }

  // ============================================================================
  // FLOATING PCA ALLOCATION (Phase: 'floating' or 'all')
  // ============================================================================
  if (shouldDoFloating) {
  // Priority 2: Specific preferences
  // NOTE: Skip preference-based allocation here - preferences are now handled WITHIN the floating PCA loop
  // This ensures tie-breakers work correctly based on pending FTE, and preferences only affect WHICH PCA
  // is assigned to a team AFTER the team is selected by tie-breaker
  const SKIP_PREFERENCE_ALLOCATION = true
  if (!SKIP_PREFERENCE_ALLOCATION) context.pcaPreferences.forEach((pref) => {
    const prefSlots = pref.preferred_slots
    const gymSlot = pref.gym_schedule ?? null
    const slotConflict = prefSlots.some(slot => slot === gymSlot)

    const requiredFTE = context.averagePCAPerTeam[pref.team]
    const currentFTE = teamPCAAssigned[pref.team]
    const neededFTE = Math.max(0, requiredFTE - currentFTE)
    
    // Check if we should avoid gym schedule (floating PCA only)
    const avoidGym = shouldAvoidGymSchedule(pref)
    
    // Skip if conflicts with gym schedule and we should avoid it
    if (slotConflict && avoidGym && prefSlots.length > 0) {
      return
    }

    // Handle preferred PCA assignments (when preferred_pca_ids is specified)
    if (pref.preferred_pca_ids.length > 0) {
      pref.preferred_pca_ids.forEach((pcaId) => {
        const pca = floatingPCA.find(p => p.id === pcaId && p.is_available)
        if (!pca) return

        const existingAllocation = allocations.find(a => a.staff_id === pcaId)
        if (existingAllocation && existingAllocation.fte_remaining <= 0) return

        if (neededFTE > 0) {
          // Check which preferred slots are available for this PCA
          const availableSlots: number[] = []
          prefSlots.forEach(slot => {
            if (existingAllocation) {
              // Check if slot is already assigned to another team (special program takes priority)
              const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : 'slot4'
              const currentSlotTeam = existingAllocation[slotField]
              // Only assign if slot is null or already assigned to this team
              if (currentSlotTeam === null || currentSlotTeam === pref.team) {
                availableSlots.push(slot)
              }
              // Don't overwrite if assigned to another team (special program takes priority)
            } else {
              // New allocation - all slots available
              availableSlots.push(slot)
            }
          })

          if (availableSlots.length === 0) return // No available slots

          const fteToAssign = Math.min(neededFTE, existingAllocation?.fte_remaining || 1, 0.25 * availableSlots.length)
          
          if (existingAllocation) {
            // Only assign available slots
            availableSlots.forEach(slot => {
              if (slot === 1) existingAllocation.slot1 = pref.team
              if (slot === 2) existingAllocation.slot2 = pref.team
              if (slot === 3) existingAllocation.slot3 = pref.team
              if (slot === 4) existingAllocation.slot4 = pref.team
            })
            existingAllocation.fte_remaining -= fteToAssign
          } else {
            const slot1Team = availableSlots.includes(1) ? pref.team : null
            const slot2Team = availableSlots.includes(2) ? pref.team : null
            const slot3Team = availableSlots.includes(3) ? pref.team : null
            const slot4Team = availableSlots.includes(4) ? pref.team : null
            const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
            
            const allocation: PCAAllocation = {
              id: crypto.randomUUID(),
              schedule_id: '',
              staff_id: pcaId,
              team: pref.team,
              fte_pca: pca.fte_pca,  // Use PCA's actual on-duty FTE (Base_FTE-remaining)
              fte_remaining: pca.fte_pca - fteToAssign,  // True-FTE remaining after this assignment
              slot_assigned: fteAssigned,
              slot_whole: null,
              slot1: slot1Team,
              slot2: slot2Team,
              slot3: slot3Team,
              slot4: slot4Team,
              leave_type: null,
              special_program_ids: null,
            }
            allocations.push(allocation)
          }
          // NOTE: Do NOT increment teamPCAAssigned here - let the floating PCA loop handle FTE counting
          // This ensures tie-breakers work correctly based on pending FTE, not preferences
          // teamPCAAssigned[pref.team] += fteToAssign

          // Find alternative floating PCA for remaining preferred slots that couldn't be assigned
          const unassignedSlots = prefSlots.filter(slot => !availableSlots.includes(slot))
          if (unassignedSlots.length > 0 && teamPCAAssigned[pref.team] < requiredFTE) {
            // Try to find other floating PCA for these slots
            const alternativePCA = floatingPCA.find(p => 
              p.id !== pcaId && 
              p.is_available &&
              !allocations.some(a => 
                a.staff_id === p.id && 
                a.special_program_ids && 
                a.special_program_ids.length > 0
              ) // Don't use PCA already assigned to special programs
            )

            if (alternativePCA) {
              const altAllocation = allocations.find(a => a.staff_id === alternativePCA.id)
              const altRemainingFTE = altAllocation?.fte_remaining || 1
              const stillNeededFTE = requiredFTE - teamPCAAssigned[pref.team]
              const fteForAlt = Math.min(stillNeededFTE, altRemainingFTE, 0.25 * unassignedSlots.length)

              if (altAllocation) {
                unassignedSlots.forEach(slot => {
                  const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : 'slot4'
                  // Only assign if slot is not already assigned (respect special programs)
                  if (altAllocation[slotField] === null) {
                    altAllocation[slotField] = pref.team
                  }
                })
                altAllocation.fte_remaining -= fteForAlt
              } else {
                const slot1Team = unassignedSlots.includes(1) ? pref.team : null
                const slot2Team = unassignedSlots.includes(2) ? pref.team : null
                const slot3Team = unassignedSlots.includes(3) ? pref.team : null
                const slot4Team = unassignedSlots.includes(4) ? pref.team : null
                const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
                
                const newAllocation: PCAAllocation = {
                  id: crypto.randomUUID(),
                  schedule_id: '',
                  staff_id: alternativePCA.id,
                  team: pref.team,
                  fte_pca: fteForAlt,
                  fte_remaining: 1 - fteForAlt,
                  slot_assigned: fteAssigned,
                  slot_whole: null,
                  slot1: slot1Team,
                  slot2: slot2Team,
                  slot3: slot3Team,
                  slot4: slot4Team,
                  leave_type: null,
                  special_program_ids: null,
                }
                allocations.push(newAllocation)
              }
              // NOTE: Do NOT increment teamPCAAssigned here - let the floating PCA loop handle FTE counting
              // teamPCAAssigned[pref.team] += fteForAlt
            }
          }
        }
      })
    }

    // Handle preferred slots without preferred PCA (slots only preference)
    if (pref.preferred_pca_ids.length === 0 && prefSlots.length > 0 && neededFTE > 0) {
      // Find available floating PCA for these preferred slots
      const availablePCA = floatingPCA.find(p => 
        p.is_available &&
        !allocations.some(a => 
          a.staff_id === p.id && 
          a.special_program_ids && 
          a.special_program_ids.length > 0
        ) // Don't use PCA already assigned to special programs
      )

      if (availablePCA) {
        const existingAllocation = allocations.find(a => a.staff_id === availablePCA.id)
        const remainingFTE = existingAllocation?.fte_remaining || 1
        const fteToAssign = Math.min(neededFTE, remainingFTE, 0.25 * prefSlots.length)

        // Check which preferred slots are available
        const availableSlots: number[] = []
        prefSlots.forEach(slot => {
          if (existingAllocation) {
            const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : 'slot4'
            // Only assign if slot is not already assigned (respect special programs)
            if (existingAllocation[slotField] === null) {
              availableSlots.push(slot)
            }
          } else {
            availableSlots.push(slot)
          }
        })

        if (availableSlots.length > 0) {
          const finalFte = Math.min(fteToAssign, 0.25 * availableSlots.length)

          if (existingAllocation) {
            availableSlots.forEach(slot => {
              if (slot === 1) existingAllocation.slot1 = pref.team
              if (slot === 2) existingAllocation.slot2 = pref.team
              if (slot === 3) existingAllocation.slot3 = pref.team
              if (slot === 4) existingAllocation.slot4 = pref.team
            })
            existingAllocation.fte_remaining -= finalFte
          } else {
            const slot1Team = availableSlots.includes(1) ? pref.team : null
            const slot2Team = availableSlots.includes(2) ? pref.team : null
            const slot3Team = availableSlots.includes(3) ? pref.team : null
            const slot4Team = availableSlots.includes(4) ? pref.team : null
            const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
            
            const allocation: PCAAllocation = {
              id: crypto.randomUUID(),
              schedule_id: '',
              staff_id: availablePCA.id,
              team: pref.team,
              fte_pca: finalFte,
              fte_remaining: 1 - finalFte,
              slot_assigned: fteAssigned,
              slot_whole: null,
              slot1: slot1Team,
              slot2: slot2Team,
              slot3: slot3Team,
              slot4: slot4Team,
              leave_type: null,
              special_program_ids: null,
            }
            allocations.push(allocation)
          }
          // NOTE: Do NOT increment teamPCAAssigned here - let the floating PCA loop handle FTE counting
          // teamPCAAssigned[pref.team] += finalFte
        }
      }
    }
  })

  // Recalculate pending values after special programs and preferences allocations
  updatePendingValues(pendingPCAFTEPerTeam, teamPCAAssigned, context.averagePCAPerTeam)

  // Priority 3 & 4: Fill remaining needs using highest-pending-first strategy
  const remainingFloatingPCA = floatingPCA.filter(
    pca => {
      const allocation = allocations.find(a => a.staff_id === pca.id)
      if (!allocation) {
        // No allocation yet - PCA is fully available
        return true
      }
      
      // Check if all slots are already assigned (for substitution or other allocation)
      // If all 4 slots are assigned, the PCA is not available for further allocation
      const allSlotsAssigned = allocation.slot1 !== null && 
                              allocation.slot2 !== null && 
                              allocation.slot3 !== null && 
                              allocation.slot4 !== null
      
      if (allSlotsAssigned) {
        // All slots assigned - PCA is not available for further allocation
        return false
      }
      
      // Include PCA with remaining FTE and available slots
      // (they can still be assigned to other teams using remaining slots)
      return allocation.fte_remaining > 0
    }
  )

  // Helper function to get next team with highest pending FTE
  // If userTeamOrder is provided, use it as the priority order instead of sorting by pending FTE
  // If userAdjustedPendingFTE is provided, use it instead of computed pending values
  const getNextHighestPendingTeam = async (excludedTeams: Set<Team> = new Set()): Promise<Team | null> => {
    // Use user-adjusted pending FTE if provided, otherwise use computed values
    const effectivePendingFTE = context.userAdjustedPendingFTE ?? pendingPCAFTEPerTeam
    
    // Filter teams with ROUNDED pending > 0, excluding preference_not teams and already-fulfilled teams
    // IMPORTANT: Use rounded pending to be consistent with the inner while loop condition
    // This prevents infinite loops when raw pending > 0 but rounded pending = 0
    const teamsWithPending: Array<{ team: Team; pending: number; orderIndex: number }> = []
    
    Object.entries(effectivePendingFTE).forEach(([team, pending]) => {
      const teamKey = team as Team
      // Use rounded pending to check if team needs more PCA
      const roundedPending = roundToNearestQuarterWithMidpoint(pending)
      if (roundedPending > 0 && !excludedTeams.has(teamKey)) {
        // Get order index from userTeamOrder if provided
        const orderIndex = context.userTeamOrder 
          ? context.userTeamOrder.indexOf(teamKey)
          : -1
        teamsWithPending.push({ team: teamKey, pending, orderIndex })
      }
    })
    
    if (teamsWithPending.length === 0) return null
    
    // If user specified a team order, use it as primary sort
    if (context.userTeamOrder) {
      // Sort by user-specified order (teams not in order list go last)
      teamsWithPending.sort((a, b) => {
        const aIndex = a.orderIndex >= 0 ? a.orderIndex : 999
        const bIndex = b.orderIndex >= 0 ? b.orderIndex : 999
        return aIndex - bIndex
      })
      
      // Return the first team (highest priority in user order that still needs PCA)
      return teamsWithPending[0].team
    }
    
    // No user order - use original logic: sort by pending (descending)
    teamsWithPending.sort((a, b) => b.pending - a.pending)
    
    const highestPending = teamsWithPending[0].pending
    // Use exact equality for tie-breaking (compare RAW values, not rounded)
    // Teams with exactly the same raw pending value are truly tied
    const tiedTeams = teamsWithPending.filter(t => t.pending === highestPending).map(t => t.team)
    
    if (tiedTeams.length > 1 && context.onTieBreak) {
      // Multiple teams tied - use callback to get user selection
      const selectedTeam = await context.onTieBreak(tiedTeams, highestPending)
      return selectedTeam
    }
    
    // No callback or single team - return first team (alphabetical order for consistency)
    return tiedTeams.sort()[0]
  }

  // Allocate floating PCA to highest pending teams first, filling each completely
  const excludedTeams = new Set<Team>() // Track teams that can't be filled
  while (remainingFloatingPCA.length > 0) {
    // Get next team with highest pending FTE (excluding teams that can't be filled)
    const targetTeam = await getNextHighestPendingTeam(excludedTeams)
    if (!targetTeam) break // No more teams need PCA
    
    // Fill this team completely (until pending = 0)
    // Get team's preferences to guide PCA selection
    const targetPreference = context.pcaPreferences.find(p => p.team === targetTeam)
    const preferredPCAIds = targetPreference?.preferred_pca_ids || []
    const preferredSlots = targetPreference?.preferred_slots || []
    const gymSlot = targetPreference?.gym_schedule ?? null
    const avoidGym = shouldAvoidGymSchedule(targetPreference)
    
    // Keep assigning slots until rounded pending reaches 0
    // We work with raw pending values, but round to nearest 0.25 (with midpoint) when checking if we should continue
    // This ensures 0.96 rounds to 1.0 (4 slots) instead of 0.75 (3 slots)
    while (roundToNearestQuarterWithMidpoint(pendingPCAFTEPerTeam[targetTeam]) > 0 && remainingFloatingPCA.length > 0) {
      // Find next available floating PCA - prioritize preferred PCAs
      let pcaToAssign: PCAData | null = null
      let pcaIndex = -1
      
      // Calculate slots needed upfront - use roundToNearestQuarterWithMidpoint to ensure correct rounding
      // (e.g., 0.96 → 1.0 → 4 slots, not 0.75 → 3 slots)
      const remainingPending = roundToNearestQuarterWithMidpoint(pendingPCAFTEPerTeam[targetTeam])
      const slotsNeeded = Math.floor(remainingPending / 0.25)
      
      // First, try to find a preferred PCA
      if (preferredPCAIds.length > 0) {
        const preferWholeDay = slotsNeeded >= 4
        let bestPCA: PCAData | null = null
        let bestPCAIndex = -1
        let bestHasWholeDay = false
        let bestAvailableSlotCount = 0
        
        // First pass: if we need whole day (>=4 slots), prioritize preferred PCAs with whole day available
        // Otherwise, collect all candidates and pick the best one
        for (let i = 0; i < remainingFloatingPCA.length; i++) {
          const pca = remainingFloatingPCA[i]
          if (!preferredPCAIds.includes(pca.id)) continue
          
    const allocation = allocations.find(a => a.staff_id === pca.id)
    const remainingFTE = allocation?.fte_remaining || 1

          if (remainingFTE <= 0) continue
          
          // Check available slots for this PCA
          const pcaAvailableSlots = pca.availableSlots && pca.availableSlots.length > 0 ? pca.availableSlots : [1, 2, 3, 4]
          const availableSlots: number[] = []
          pcaAvailableSlots.forEach(slot => {
            const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : slot === 4 ? 'slot4' : 'slot1'
            if (allocation && allocation[slotField] === null) {
              availableSlots.push(slot)
            } else if (!allocation) {
              availableSlots.push(slot)
            }
          })
          const availableSlotCount = availableSlots.length
          const hasWholeDay = availableSlotCount >= 4 && availableSlots.includes(1) && availableSlots.includes(2) && availableSlots.includes(3) && availableSlots.includes(4)
          
          // If we prefer whole day and this PCA has whole day, select it immediately
          if (preferWholeDay && hasWholeDay) {
            pcaToAssign = pca
            pcaIndex = i
            break
          }
          
          // Otherwise, track the best candidate (prefer whole day, then most available slots)
          if (!bestPCA || 
              (hasWholeDay && !bestHasWholeDay) ||
              (hasWholeDay === bestHasWholeDay && availableSlotCount > bestAvailableSlotCount)) {
            bestPCA = pca
            bestPCAIndex = i
            bestHasWholeDay = hasWholeDay
            bestAvailableSlotCount = availableSlotCount
          }
        }
        
        // If we didn't find a whole day PCA but have a best candidate, use it
        if (!pcaToAssign && bestPCA) {
          pcaToAssign = bestPCA
          pcaIndex = bestPCAIndex
        }
      }
      
      // If no preferred PCA found, fall back to any available PCA
      // When slotsNeeded >= 4, prioritize PCAs with whole day available
      if (!pcaToAssign) {
        let bestFallbackPCA: PCAData | null = null
        let bestFallbackIndex = -1
        let bestFallbackHasWholeDay = false
        let bestFallbackAvailableSlotCount = 0
        
        for (let i = 0; i < remainingFloatingPCA.length; i++) {
          const pca = remainingFloatingPCA[i]
          const allocation = allocations.find(a => a.staff_id === pca.id)
          const remainingFTE = allocation?.fte_remaining || 1
          
          if (remainingFTE <= 0) continue
          
          // Check available slots for this PCA
          const pcaAvailableSlots = pca.availableSlots && pca.availableSlots.length > 0 ? pca.availableSlots : [1, 2, 3, 4]
          const availableSlots: number[] = []
          pcaAvailableSlots.forEach(slot => {
            const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : slot === 4 ? 'slot4' : 'slot1'
            if (allocation && allocation[slotField] === null) {
              availableSlots.push(slot)
            } else if (!allocation) {
              availableSlots.push(slot)
            }
          })
          const availableSlotCount = availableSlots.length
          const hasWholeDay = availableSlotCount >= 4 && availableSlots.includes(1) && availableSlots.includes(2) && availableSlots.includes(3) && availableSlots.includes(4)
          
          // If we need whole day (>=4 slots), prioritize PCAs with whole day available
          if (slotsNeeded >= 4 && hasWholeDay) {
            pcaToAssign = pca
            pcaIndex = i
            break
          }
          
          // Otherwise, track the best candidate (prefer whole day, then most available slots)
          if (!bestFallbackPCA || 
              (hasWholeDay && !bestFallbackHasWholeDay) ||
              (hasWholeDay === bestFallbackHasWholeDay && availableSlotCount > bestFallbackAvailableSlotCount)) {
            bestFallbackPCA = pca
            bestFallbackIndex = i
            bestFallbackHasWholeDay = hasWholeDay
            bestFallbackAvailableSlotCount = availableSlotCount
          }
        }
        
        // If we didn't find a whole day PCA but have a best candidate, use it
        if (!pcaToAssign && bestFallbackPCA) {
          pcaToAssign = bestFallbackPCA
          pcaIndex = bestFallbackIndex
        }
      }
      
      if (!pcaToAssign) {
        // No available PCA for this team - exclude it from further selection to prevent infinite loop
        excludedTeams.add(targetTeam)
        break // Exit inner loop, outer loop will try next team
      }
      
      const allocation = allocations.find(a => a.staff_id === pcaToAssign!.id)
      const remainingFTE = allocation?.fte_remaining || 1
      
      if (allocation) {
        // Find available slots - prioritize preferred slots, then PCA's available slots
        // BUT: When slotsNeeded >= 4 (pending >= 1.0), ignore slot preferences and use all slots
        const pcaAvailableSlots = pcaToAssign.availableSlots && pcaToAssign.availableSlots.length > 0
          ? pcaToAssign.availableSlots
          : [1, 2, 3, 4]
        
        // IMPORTANT: Find slots already taken by OTHER floating PCAs for this team
        // This prevents assigning multiple floating PCAs to the same slot for substitution
        const slotsTakenByOtherFloating: number[] = []
        allocations.forEach(alloc => {
          if (alloc.staff_id === pcaToAssign!.id) return // Skip self
          const allocStaff = context.pcaPool.find(p => p.id === alloc.staff_id)
          if (allocStaff?.floating) {
            if (alloc.slot1 === targetTeam) slotsTakenByOtherFloating.push(1)
            if (alloc.slot2 === targetTeam) slotsTakenByOtherFloating.push(2)
            if (alloc.slot3 === targetTeam) slotsTakenByOtherFloating.push(3)
            if (alloc.slot4 === targetTeam) slotsTakenByOtherFloating.push(4)
          }
        })
        
        // Build ordered slot list
        const orderedSlots: number[] = []
        
        // When slotsNeeded >= 4 (pending >= 1.0), ignore slot preferences - use all available slots
        if (slotsNeeded >= 4) {
          // Just use all available slots in order (1, 2, 3, 4)
          pcaAvailableSlots.forEach(slot => {
            orderedSlots.push(slot)
          })
        } else {
          // When slotsNeeded < 4, prioritize preferred slots first, then others
          if (preferredSlots.length > 0) {
            // Add preferred slots that are also available for this PCA
            preferredSlots.forEach(slot => {
              if (pcaAvailableSlots.includes(slot) && !orderedSlots.includes(slot)) {
                orderedSlots.push(slot)
              }
            })
          }
          // Add remaining PCA available slots
          pcaAvailableSlots.forEach(slot => {
            if (!orderedSlots.includes(slot)) {
              orderedSlots.push(slot)
            }
          })
        }
        
        // Try to assign as many slots as possible from this PCA (up to slotsNeeded)
        // Exclude slots already taken by other floating PCAs for this team
        let slotsAssigned = 0
        const assignedSlotNumbers: number[] = []
        for (const slot of orderedSlots) {
          if (slotsAssigned >= slotsNeeded) break // Already fulfilled the need
          
          // Skip slots already taken by other floating PCAs for this team
          if (slotsTakenByOtherFloating.includes(slot)) continue
          
          const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : 'slot4'
          // Only assign if slot is null (not already assigned, including special program assignments)
          if (allocation[slotField] === null && (!avoidGym || gymSlot !== slot)) {
            allocation[slotField] = targetTeam
            slotsAssigned++
            assignedSlotNumbers.push(slot)
          }
        }
        
        if (slotsAssigned === 0) {
          // No available slots for this PCA
          remainingFloatingPCA.splice(pcaIndex, 1)
          continue
        }
        
        // Update FTE based on how many slots were assigned
        const baseFTE = pcaToAssign.fte_pca
        updateAllocationFTE(allocation, baseFTE)
        
        // Update tracking for all slots assigned in this iteration
        const fteToAssign = slotsAssigned * 0.25
        teamPCAAssigned[targetTeam] += fteToAssign
        pendingPCAFTEPerTeam[targetTeam] = Math.max(0, pendingPCAFTEPerTeam[targetTeam] - fteToAssign)
      } else {
        // Create new allocation - assign as many slots as needed
        // BUT: When slotsNeeded >= 4 (pending >= 1.0), ignore slot preferences and use all slots
        const pcaAvailableSlots = pcaToAssign.availableSlots && pcaToAssign.availableSlots.length > 0
          ? pcaToAssign.availableSlots
          : [1, 2, 3, 4]
        
        // IMPORTANT: Find slots already taken by OTHER floating PCAs for this team
        // This prevents assigning multiple floating PCAs to the same slot for substitution
        const slotsTakenByOtherFloating: number[] = []
        allocations.forEach(alloc => {
          const allocStaff = context.pcaPool.find(p => p.id === alloc.staff_id)
          if (allocStaff?.floating) {
            // Check each slot - if assigned to target team, it's taken
            if (alloc.slot1 === targetTeam) slotsTakenByOtherFloating.push(1)
            if (alloc.slot2 === targetTeam) slotsTakenByOtherFloating.push(2)
            if (alloc.slot3 === targetTeam) slotsTakenByOtherFloating.push(3)
            if (alloc.slot4 === targetTeam) slotsTakenByOtherFloating.push(4)
          }
        })
        
        // Build ordered slot list
        const orderedSlots: number[] = []
        
        // When slotsNeeded >= 4 (pending >= 1.0), ignore slot preferences - use all available slots
        if (slotsNeeded >= 4) {
          // Just use all available slots in order (1, 2, 3, 4)
          pcaAvailableSlots.forEach(slot => {
            orderedSlots.push(slot)
          })
        } else {
          // When slotsNeeded < 4, prioritize preferred slots first, then others
          if (preferredSlots.length > 0) {
            preferredSlots.forEach(slot => {
              if (pcaAvailableSlots.includes(slot) && !orderedSlots.includes(slot)) {
                orderedSlots.push(slot)
              }
            })
          }
          pcaAvailableSlots.forEach(slot => {
            if (!orderedSlots.includes(slot)) {
              orderedSlots.push(slot)
            }
          })
        }
        
        // Try to assign as many slots as needed from this PCA
        // Exclude slots already taken by other floating PCAs for this team
        const assignedSlots: number[] = []
        for (const slot of orderedSlots) {
          if (assignedSlots.length >= slotsNeeded) break // Already fulfilled the need
          
          // Skip slots already taken by other floating PCAs for this team
          if (slotsTakenByOtherFloating.includes(slot)) continue
          
          if (!avoidGym || gymSlot !== slot) {
            assignedSlots.push(slot)
          }
        }
        
        if (assignedSlots.length === 0) {
          // No available slots for this PCA
          remainingFloatingPCA.splice(pcaIndex, 1)
          continue
        }
        
        // Create new allocation with all assigned slots
        // Note: assignedSlots should NOT include invalid slot (it's excluded from availableSlots)
        const fteToAssign = assignedSlots.length * 0.25
        // True FTE = available slots only (invalid slot not counted)
        const trueFTE = assignedSlots.length * 0.25
        
        const newAllocation: PCAAllocation = {
          id: crypto.randomUUID(),
          schedule_id: '',
          staff_id: pcaToAssign.id,
          team: targetTeam,
          fte_pca: trueFTE, // Use true FTE (available slots only, invalid slot not counted)
          fte_remaining: pcaToAssign.fte_pca - fteToAssign,
          slot_assigned: fteToAssign,
          slot_whole: null,
          slot1: assignedSlots.includes(1) ? targetTeam : null,
          slot2: assignedSlots.includes(2) ? targetTeam : null,
          slot3: assignedSlots.includes(3) ? targetTeam : null,
          slot4: assignedSlots.includes(4) ? targetTeam : null,
          leave_type: pcaToAssign.leave_type,
          special_program_ids: null,
        }
        
        // Add invalid slot fields if they exist (invalid slot will be assigned in post-processing)
        if (pcaToAssign.invalidSlot !== undefined && pcaToAssign.invalidSlot !== null) {
          (newAllocation as any).invalid_slot = pcaToAssign.invalidSlot
          if (pcaToAssign.leaveComebackTime) {
            (newAllocation as any).leave_comeback_time = pcaToAssign.leaveComebackTime
          }
          if (pcaToAssign.isLeave !== undefined) {
            (newAllocation as any).leave_mode = pcaToAssign.isLeave ? 'leave' : 'come_back'
          }
        }
        
        allocations.push(newAllocation)
        
        // Update tracking using true FTE (invalid slot not counted)
        teamPCAAssigned[targetTeam] += trueFTE
        pendingPCAFTEPerTeam[targetTeam] = Math.max(0, pendingPCAFTEPerTeam[targetTeam] - trueFTE)
      }
      
      // Remove PCA from available list if fully allocated
      const updatedAllocation = allocations.find(a => a.staff_id === pcaToAssign.id)
      if (updatedAllocation && updatedAllocation.fte_remaining <= 0) {
        remainingFloatingPCA.splice(pcaIndex, 1)
      }
    }
  }

  // Post-processing: Handle invalid slots for floating PCA (bundle with neighboring slot)
  // This should only run in floating or all phase
  floatingPCA.forEach((pca) => {
    if (pca.invalidSlot === undefined || pca.invalidSlot === null) return
    
    const allocation = allocations.find(a => a.staff_id === pca.id)
    if (!allocation) return
    
    // Find neighboring slot in same half-day
    // AM: slots 1-2, PM: slots 3-4
    const invalidSlot = pca.invalidSlot
    let neighboringSlot: number | null = null
    let neighboringTeam: Team | null = null
    
    if (invalidSlot === 1 || invalidSlot === 2) {
      // AM half-day: find slot 1 or 2 that is assigned
      if (allocation.slot1 && invalidSlot !== 1) {
        neighboringSlot = 1
        neighboringTeam = allocation.slot1
      } else if (allocation.slot2 && invalidSlot !== 2) {
        neighboringSlot = 2
        neighboringTeam = allocation.slot2
      }
    } else if (invalidSlot === 3 || invalidSlot === 4) {
      // PM half-day: find slot 3 or 4 that is assigned
      if (allocation.slot3 && invalidSlot !== 3) {
        neighboringSlot = 3
        neighboringTeam = allocation.slot3
      } else if (allocation.slot4 && invalidSlot !== 4) {
        neighboringSlot = 4
        neighboringTeam = allocation.slot4
      }
    }
    
    // If neighboring slot found, assign invalid slot to same team
    if (neighboringTeam) {
      if (invalidSlot === 1) allocation.slot1 = neighboringTeam
      if (invalidSlot === 2) allocation.slot2 = neighboringTeam
      if (invalidSlot === 3) allocation.slot3 = neighboringTeam
      if (invalidSlot === 4) allocation.slot4 = neighboringTeam
      
      // Add invalid slot fields
      ;(allocation as any).invalid_slot = invalidSlot
      if (pca.leaveComebackTime) {
        ;(allocation as any).leave_comeback_time = pca.leaveComebackTime
      }
      if (pca.isLeave !== undefined) {
        ;(allocation as any).leave_mode = pca.isLeave ? 'leave' : 'come_back'
      }
    }
  })
  } // End of shouldDoFloating block

  // Check for insufficient PCA pool (only in 'all' or 'floating' phase)
  const totalRequired = Object.values(context.averagePCAPerTeam).reduce((sum, val) => sum + val, 0)
  const totalAssigned = Object.values(teamPCAAssigned).reduce((sum, val) => sum + val, 0)
  
  if (shouldDoFloating && totalAssigned < totalRequired) {
    const teamsBelowOne = Object.entries(context.averagePCAPerTeam)
      .filter(([team, required]) => teamPCAAssigned[team as Team] < 1)
      .map(([team]) => team)
    
    if (teamsBelowOne.length > 0) {
      throw new Error(`Insufficient PCA pool. Teams below 1.0 FTE: ${teamsBelowOne.join(', ')}`)
    }
  }

  return {
    allocations,
    totalPCAOnDuty: totalAssigned,
    pendingPCAFTEPerTeam, // Return final pending values for tracking unmet needs
    teamPCAAssigned, // Return for passing to next phase (used when phase = 'non-floating')
    errors: Object.keys(errors).length > 0 ? errors : undefined, // Only include if errors exist
  }
}

function getWeekday(date: Date): 'mon' | 'tue' | 'wed' | 'thu' | 'fri' {
  const day = date.getDay()
  const weekdays: ('mon' | 'tue' | 'wed' | 'thu' | 'fri')[] = ['mon', 'tue', 'wed', 'thu', 'fri']
  return weekdays[day === 0 ? 6 : day - 1]
}

// ============================================================================
// Revised Floating PCA Algorithm v2 (Step 3.4)
// ============================================================================

import { 
  AllocationTracker,
} from '@/types/schedule'
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
  getAvailableSlotsForTeam,
  TeamPreferenceInfo,
} from '@/lib/utils/floatingPCAHelpers'

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
}

/**
 * Result of the revised floating PCA allocation algorithm v2.
 */
export interface FloatingPCAAllocationResultV2 {
  allocations: PCAAllocation[]
  pendingPCAFTEPerTeam: Record<Team, number>
  tracker: AllocationTracker
  errors?: {
    preferredSlotUnassigned?: string[]
  }
}

/**
 * Revised Floating PCA Allocation Algorithm v2
 * 
 * Operates in 3 cycles:
 * - Cycle 1: Team-centric with preference priority (conditions A, B, C, D)
 * - Cycle 2: Fallback with lifted restrictions (floor PCA, then non-floor PCA)
 * - Cycle 3: PCA-centric cleanup (assign remaining slots)
 */
export async function allocateFloatingPCA_v2(
  context: FloatingPCAAllocationContextV2
): Promise<FloatingPCAAllocationResultV2> {
  const {
    teamOrder,
    currentPendingFTE: initialPendingFTE,
    existingAllocations,
    pcaPool,
    pcaPreferences,
  } = context

  // Clone allocations and pending FTE to avoid mutating originals
  const allocations = existingAllocations.map(a => ({ ...a }))
  const pendingFTE = { ...initialPendingFTE }
  
  // Initialize tracker
  const tracker = createEmptyTracker()
  
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
  
  // Build preference maps
  const preferredPCAMap = buildPreferredPCAMap(pcaPreferences, pendingFTE)
  
  // Get team preference info for all teams
  const teamPrefs: Record<Team, TeamPreferenceInfo> = {} as Record<Team, TeamPreferenceInfo>
  for (const team of TEAMS) {
    teamPrefs[team] = getTeamPreferenceInfo(team, pcaPreferences)
  }

  // Helper to check if allocation is complete
  const isAllocationComplete = () => {
    // Check if all teams have pendingFTE = 0
    const allTeamsSatisfied = TEAMS.every(t => pendingFTE[t] <= 0)
    if (allTeamsSatisfied) return true
    
    // Check if all PCAs have no available slots
    const anyPCAHasSlots = pcaPool.some(pca => {
      if (pca.fte_pca <= 0) return false
      const alloc = allocations.find(a => a.staff_id === pca.id)
      if (!alloc) return true // No allocation yet, has slots
      return alloc.fte_remaining > 0
    })
    
    return !anyPCAHasSlots
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
        await processConditionA(team, pref, allocations, pendingFTE, pcaPool, pcaPreferences, preferredPCAMap, tracker, errors, recordAssignmentWithOrder)
        break
      case 'B':
        // Condition B: Preferred Slot only
        await processConditionB(team, pref, allocations, pendingFTE, pcaPool, pcaPreferences, preferredPCAMap, tracker, errors, recordAssignmentWithOrder)
        break
      case 'C':
        // Condition C: Preferred PCA only
        await processConditionC(team, pref, allocations, pendingFTE, pcaPool, pcaPreferences, preferredPCAMap, tracker, recordAssignmentWithOrder)
        break
      case 'D':
        // Condition D: No preferences
        await processConditionD(team, pref, allocations, pendingFTE, pcaPool, pcaPreferences, preferredPCAMap, tracker, recordAssignmentWithOrder)
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
      await processFloorPCAFallback(team, pref, allocations, pendingFTE, pcaPool, pcaPreferences, tracker, 2, recordAssignmentWithOrder, undefined)
    }
    
    // Phase 2b: Non-Floor PCA
    if (!isAllocationComplete()) {
      const cycle2bTeams = [...teamOrder].sort((a, b) => pendingFTE[b] - pendingFTE[a])
      
      for (const team of cycle2bTeams) {
        if (pendingFTE[team] <= 0) continue
        if (isAllocationComplete()) break
        
        const pref = teamPrefs[team]
        await processNonFloorPCAFallback(team, pref, allocations, pendingFTE, pcaPool, pcaPreferences, tracker, recordAssignmentWithOrder)
      }
    }
  }
  
  // ========================================================================
  // CYCLE 3: PCA-centric cleanup
  // ========================================================================
  
  if (!isAllocationComplete()) {
    await processCycle3Cleanup(allocations, pendingFTE, pcaPool, pcaPreferences, teamPrefs, tracker, recordAssignmentWithOrder)
  }
  
  // Finalize tracker summary
  finalizeTrackerSummary(tracker)

  return {
    allocations,
    pendingPCAFTEPerTeam: pendingFTE,
    tracker,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
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
  recordAssignmentWithOrder: (team: Team, log: Parameters<typeof recordAssignment>[2]) => void
): Promise<void> {
  const { preferredPCAIds, preferredSlot, teamFloor, gymSlot, avoidGym } = pref

  if (!preferredSlot) return
  
  let preferredSlotAssigned = false
  
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
  if (!preferredSlotAssigned) {
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
      
      if (team === 'FO') {
      }

      // Get or create allocation for this PCA
      const allocation = getOrCreateAllocation(pca.id, pca.name, pca.fte_pca, pca.leave_type, team, allocations)

      if (team === 'FO') {
      }
      
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
        if (team === 'FO') {
        }

        if (availableSlots.length === 0) {
          if (team === 'FO') {
          }
          break
        }
        
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

        if (team === 'FO') {
        }
        
        // If no slots were assigned, break (shouldn't happen, but safety check)
        if (result.slotsAssigned.length === 0) {
          if (team === 'FO') {
          }
          break
        }
        
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
    await processFloorPCAFallback(team, pref, allocations, pendingFTE, pcaPool, pcaPreferences, tracker, 1, recordAssignmentWithOrder, 'A')
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
  recordAssignmentWithOrder: (team: Team, log: Parameters<typeof recordAssignment>[2]) => void
): Promise<void> {
  const { preferredSlot, teamFloor, gymSlot, avoidGym } = pref
  
  if (!preferredSlot) return
  
  let preferredSlotAssigned = false
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
  if (!preferredSlotAssigned) {
    if (!errors.preferredSlotUnassigned) errors.preferredSlotUnassigned = []
    errors.preferredSlotUnassigned.push(`${team}: Could not assign preferred slot ${preferredSlot}`)
  }
  
  // Step 3: Continue filling from floor PCAs
  if (pendingFTE[team] > 0) {
    await processFloorPCAFallback(team, pref, allocations, pendingFTE, pcaPool, pcaPreferences, tracker, 1, recordAssignmentWithOrder, 'B')
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
  recordAssignmentWithOrder: (team: Team, log: Parameters<typeof recordAssignment>[2]) => void
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
    await processFloorPCAFallback(team, pref, allocations, pendingFTE, pcaPool, pcaPreferences, tracker, 1, recordAssignmentWithOrder, 'C')
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
  recordAssignmentWithOrder: (team: Team, log: Parameters<typeof recordAssignment>[2]) => void
): Promise<void> {
  // Just use floor PCA fallback directly
  await processFloorPCAFallback(team, pref, allocations, pendingFTE, pcaPool, pcaPreferences, tracker, 1, recordAssignmentWithOrder, 'D')
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
  condition?: 'A' | 'B' | 'C' | 'D'
): Promise<void> {
  const { teamFloor, gymSlot, avoidGym } = pref
  
  const preferredPCAMap = buildPreferredPCAMap(pcaPreferences, pendingFTE)
  
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

  if (team === 'FO' && cycle === 2) {
  }
  
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
  recordAssignmentWithOrder: (team: Team, log: Parameters<typeof recordAssignment>[2]) => void
): Promise<void> {
  const { teamFloor, gymSlot, avoidGym } = pref
  
  const preferredPCAMap = buildPreferredPCAMap(pcaPreferences, pendingFTE)
  
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
  // Find PCAs with unassigned slots
  const pcasWithSlots = pcaPool.filter(pca => {
    if (pca.fte_pca <= 0) return false
    const alloc = allocations.find(a => a.staff_id === pca.id)
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

