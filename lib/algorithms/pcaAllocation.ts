import { Team } from '@/types/staff'
import { PCAAllocation } from '@/types/schedule'
import { PCAPreference, SpecialProgram } from '@/types/allocation'
import { roundToNearestQuarter, roundDownToQuarter, roundToNearestQuarterWithMidpoint } from '@/lib/utils/rounding'
import { assignSlotIfValid, getTeamFloor, isFloorPCAForTeam, TEAMS } from '@/lib/utils/floatingPCAHelpers'
import { getEffectiveSpecialProgramWeekdaySlots } from '@/lib/utils/specialProgramConfigRows'
import { resolveSpecialProgramRuntimeModel } from '@/lib/utils/specialProgramRuntimeModel'
import type { PCAData } from './pcaAllocationTypes'

export type { PCAData } from './pcaAllocationTypes'

export interface PCAAllocationContext {
  date: Date
  totalPCAAvailable: number
  pcaPool: PCAData[]
  averagePCAPerTeam: Record<Team, number>
  specialPrograms: SpecialProgram[]
  specialProgramTargetTeamById?: Partial<Record<string, Team>>
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
      availableFloatingPCAs: FloatingSubCandidate[]
    }>
  ) => Promise<Record<string, Array<{ floatingPCAId: string; slots: number[] }>>> // Returns user selections: key = `${team}-${nonFloatingPCAId}`
}

export type BlockedSlotInfo = { slot: number; reasons: string[] }
export type FloatingSubCandidate = {
  id: string
  name: string
  availableSlots: number[]
  isPreferred: boolean
  isFloorPCA: boolean
  // When a floating PCA is already assigned to special program(s) (Step 2.0),
  // these slots are blocked and should be shown in Step 2.1.
  blockedSlotsInfo?: BlockedSlotInfo[]
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
 * @param program The special program
 * @param slot The slot number (1, 2, 3, or 4)
 * @param targetTeam The original target team for allocation
 * @returns The team to assign this slot to
 */
function getSlotTeamForSpecialProgram(
  program: SpecialProgram,
  slot: number,
  targetTeam: Team
): Team | null {
  let runtimeModel = resolveSpecialProgramRuntimeModel({
    program,
    targetTeam,
  })
  if (runtimeModel.effectiveRequiredSlots.length === 0 && Array.isArray(program.weekdays) && program.weekdays.length > 0) {
    for (const weekday of program.weekdays) {
      const weekdayRuntimeModel = resolveSpecialProgramRuntimeModel({
        program,
        targetTeam,
        weekday,
      })
      if (weekdayRuntimeModel.effectiveRequiredSlots.includes(slot as 1 | 2 | 3 | 4)) {
        runtimeModel = weekdayRuntimeModel
        break
      }
    }
  }
  return runtimeModel.slotTeamBySlot[slot as 1 | 2 | 3 | 4] ?? runtimeModel.allocatorDefaultTargetTeam ?? targetTeam
}

function usesSharedAllocationIdentityForProgram(program: SpecialProgram): boolean {
  return resolveSpecialProgramRuntimeModel({ program }).usesSharedAllocationIdentity
}

function bypassesPrimaryTargetPendingGateForProgram(program: SpecialProgram): boolean {
  return resolveSpecialProgramRuntimeModel({ program }).bypassesPrimaryTargetPendingGate
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

function getRemainingAssignableSlotCount(baseFTE: number, allocation?: PCAAllocation): number {
  const remainingFTE = allocation ? allocation.fte_remaining : baseFTE
  return Math.max(0, Math.floor((remainingFTE + 1e-9) / 0.25))
}

function assignSlotsToExistingAllocation(
  allocation: PCAAllocation,
  slots: number[],
  team: Team,
  maxAssignableSlots: number
): number {
  let assignedCount = 0

  for (const slot of slots) {
    if (assignedCount >= maxAssignableSlots) break

    const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : 'slot4'
    if (allocation[slotField] === null) {
      allocation[slotField] = team
      assignedCount += 1
    }
  }

  return assignedCount
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

function resolveTargetTeamsForSpecialProgram(args: {
  context: PCAAllocationContext
  program: SpecialProgram
  teamsNeedingProgram: Team[]
  teamPCAAssigned: Record<Team, number>
}): Team[] {
  const { context, program, teamsNeedingProgram, teamPCAAssigned } = args
  const runtimeModel = resolveSpecialProgramRuntimeModel({
    program,
    targetTeam: context.specialProgramTargetTeamById?.[program.id] ?? null,
  })
  const slotTeams = Array.from(new Set(Object.values(runtimeModel.slotTeamBySlot))) as Team[]

  if (runtimeModel.usesSharedAllocationIdentity) {
    if (slotTeams.length > 1) {
      const anySlotTeamNeedsProgram = slotTeams.some(
        (team) => teamPCAAssigned[team] < context.averagePCAPerTeam[team]
      )
      return anySlotTeamNeedsProgram && runtimeModel.allocatorDefaultTargetTeam
        ? [runtimeModel.allocatorDefaultTargetTeam]
        : []
    }
    return runtimeModel.allocatorDefaultTargetTeam ? [runtimeModel.allocatorDefaultTargetTeam] : []
  }

  return teamsNeedingProgram
}

type SpecialProgramCandidateSelection = {
  pcaToAssign: PCAData | null
  assignedPCAId: string | null
}

function selectSpecialProgramCandidate(args: {
  program: SpecialProgram
  floatingPCA: PCAData[]
  nonFloatingPCA: PCAData[]
  allocations: PCAAllocation[]
}): SpecialProgramCandidateSelection {
  const { program, floatingPCA, nonFloatingPCA, allocations } = args

  const assignedToProgram = new Set<string>()
  allocations.forEach((allocation) => {
    if (allocation.special_program_ids?.includes(program.id)) {
      assignedToProgram.add(allocation.staff_id)
    }
  })

  const isEligible = (pca: PCAData, requireProgramTag: boolean) => {
    if (!pca.is_available) return false
    if (requireProgramTag && !pca.special_program?.includes(program.name)) return false
    if (assignedToProgram.has(pca.id)) return false
    return true
  }

  const findById = (pcaId: string, requireProgramTag: boolean): PCAData | null => {
    const floatingMatch = floatingPCA.find((pca) => pca.id === pcaId && isEligible(pca, requireProgramTag))
    if (floatingMatch) return floatingMatch
    const nonFloatingMatch = nonFloatingPCA.find((pca) => pca.id === pcaId && isEligible(pca, requireProgramTag))
    return nonFloatingMatch ?? null
  }

  const findAny = (requireProgramTag: boolean): PCAData | null => {
    const floatingMatch = floatingPCA.find((pca) => isEligible(pca, requireProgramTag))
    if (floatingMatch) return floatingMatch
    const nonFloatingMatch = nonFloatingPCA.find((pca) => isEligible(pca, requireProgramTag))
    return nonFloatingMatch ?? null
  }

  const preferredIds = program.pca_preference_order || []
  if (preferredIds.length > 0) {
    for (const preferredPcaId of preferredIds) {
      // Preserve legacy behavior: preference-list matching always requires program-tagged PCA.
      const candidate = findById(preferredPcaId, true)
      if (candidate) {
        return { pcaToAssign: candidate, assignedPCAId: preferredPcaId }
      }
    }

    const fallbackCandidate = findAny(program.name !== 'DRM')
    return { pcaToAssign: fallbackCandidate, assignedPCAId: null }
  }

  const candidate = findAny(program.name !== 'DRM')
  return { pcaToAssign: candidate, assignedPCAId: null }
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

  // Hot-path indexes: preserve first-match semantics of Array.find while avoiding repeated scans.
  const teamPreferenceByTeam = new Map<Team, PCAPreference>()
  context.pcaPreferences.forEach((pref) => {
    if (!teamPreferenceByTeam.has(pref.team)) {
      teamPreferenceByTeam.set(pref.team, pref)
    }
  })
  const getTeamPreference = (team: Team): PCAPreference | undefined => teamPreferenceByTeam.get(team)

  const specialProgramById = new Map<string, SpecialProgram>()
  context.specialPrograms.forEach((program) => {
    if (!specialProgramById.has(program.id)) {
      specialProgramById.set(program.id, program)
    }
  })
  const getSpecialProgramById = (programId: string): SpecialProgram | undefined =>
    specialProgramById.get(programId)

  const pcaPoolById = new Map<string, PCAData>()
  context.pcaPool.forEach((pca) => {
    if (!pcaPoolById.has(pca.id)) {
      pcaPoolById.set(pca.id, pca)
    }
  })
  const getPcaById = (pcaId: string): PCAData | undefined => pcaPoolById.get(pcaId)

  let allocationIndexSize = -1
  let firstAllocationByStaffId = new Map<string, PCAAllocation>()
  let allocationsByStaffId = new Map<string, PCAAllocation[]>()
  const refreshAllocationIndexes = () => {
    if (allocationIndexSize === allocations.length) return

    const nextFirstByStaffId = new Map<string, PCAAllocation>()
    const nextByStaffId = new Map<string, PCAAllocation[]>()
    allocations.forEach((allocation) => {
      if (!nextFirstByStaffId.has(allocation.staff_id)) {
        nextFirstByStaffId.set(allocation.staff_id, allocation)
      }
      const list = nextByStaffId.get(allocation.staff_id)
      if (list) {
        list.push(allocation)
      } else {
        nextByStaffId.set(allocation.staff_id, [allocation])
      }
    })

    firstAllocationByStaffId = nextFirstByStaffId
    allocationsByStaffId = nextByStaffId
    allocationIndexSize = allocations.length
  }
  const getFirstAllocationByStaffId = (staffId: string): PCAAllocation | undefined => {
    refreshAllocationIndexes()
    return firstAllocationByStaffId.get(staffId)
  }
  const getAllocationsByStaffId = (staffId: string): PCAAllocation[] => {
    refreshAllocationIndexes()
    return allocationsByStaffId.get(staffId) ?? []
  }
  const hasProgramAllocationForStaff = (staffId: string, programId: string, targetTeam?: Team): boolean => {
    const staffAllocations = getAllocationsByStaffId(staffId)
    return staffAllocations.some((allocation) => {
      if (!allocation.special_program_ids?.includes(programId)) return false
      if (targetTeam == null) return true
      return allocation.team === targetTeam
    })
  }
  

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

  // Special-program slot FTE tracking (Step 2 only).
  // Legacy behavior: special program slots are "designated work" and should NOT reduce Step 3 pending needs.
  const teamPCASpecialProgramAssigned: Record<Team, number> = {
    FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0,
  }
  
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
    const assignSpecialProgramSlotsToPca = (args: {
      program: SpecialProgram
      pca: PCAData
      targetTeam: Team
      slots: number[]
    }): number[] => {
      const availableSlots = Array.isArray(args.pca.availableSlots) && args.pca.availableSlots.length > 0
        ? args.pca.availableSlots
        : [1, 2, 3, 4]
      const baseAllocation = getFirstAllocationByStaffId(args.pca.id)
      const freeRequestedSlots = args.slots.filter((slot) => {
        if (!availableSlots.includes(slot)) return false
        if (!baseAllocation) return true
        const slotTeam =
          slot === 1 ? baseAllocation.slot1 :
          slot === 2 ? baseAllocation.slot2 :
          slot === 3 ? baseAllocation.slot3 :
          slot === 4 ? baseAllocation.slot4 :
          null
        return slotTeam === null
      })
      if (freeRequestedSlots.length === 0) return []

      const remainingFTE = baseAllocation?.fte_remaining ?? args.pca.fte_pca
      if (remainingFTE <= 0) return []

      const maxSlotsByFte = Math.max(0, Math.floor((remainingFTE + 1e-6) / 0.25))
      const slotsToApply = freeRequestedSlots.slice(0, maxSlotsByFte)
      if (slotsToApply.length === 0) return []

      if (baseAllocation) {
        slotsToApply.forEach((slot) => {
          const slotTeam = getSlotTeamForSpecialProgram(args.program, slot, args.targetTeam)
          if (!slotTeam) return
          if (assignSlotIfValid({ allocation: baseAllocation, slot, team: slotTeam, availableSlots: slotsToApply, minFteRemaining: 0.25 })) {
            teamPCAAssigned[slotTeam] += 0.25
          }
        })
        baseAllocation.slot_assigned = calculateFTEAssigned(
          baseAllocation.slot1,
          baseAllocation.slot2,
          baseAllocation.slot3,
          baseAllocation.slot4
        )
        baseAllocation.fte_remaining = Math.max(0, (baseAllocation.fte_remaining ?? 0) - (slotsToApply.length * 0.25))
        if (!baseAllocation.special_program_ids) {
          baseAllocation.special_program_ids = []
        }
        if (!baseAllocation.special_program_ids.includes(args.program.id)) {
          baseAllocation.special_program_ids.push(args.program.id)
        }
        return slotsToApply
      }

      const slot1Team = slotsToApply.includes(1) ? getSlotTeamForSpecialProgram(args.program, 1, args.targetTeam) : null
      const slot2Team = slotsToApply.includes(2) ? getSlotTeamForSpecialProgram(args.program, 2, args.targetTeam) : null
      const slot3Team = slotsToApply.includes(3) ? getSlotTeamForSpecialProgram(args.program, 3, args.targetTeam) : null
      const slot4Team = slotsToApply.includes(4) ? getSlotTeamForSpecialProgram(args.program, 4, args.targetTeam) : null
      const fteAssigned = calculateFTEAssigned(slot1Team, slot2Team, slot3Team, slot4Team)
      const allocation: PCAAllocation = {
        id: crypto.randomUUID(),
        schedule_id: '',
        staff_id: args.pca.id,
        team: args.targetTeam,
        fte_pca: args.pca.fte_pca,
        fte_remaining: Math.max(0, args.pca.fte_pca - (slotsToApply.length * 0.25)),
        slot_assigned: fteAssigned,
        slot_whole: null,
        slot1: slot1Team,
        slot2: slot2Team,
        slot3: slot3Team,
        slot4: slot4Team,
        leave_type: null,
        special_program_ids: [args.program.id],
      }
      allocations.push(allocation)
      updateTeamPCAAssignedFromSlots(teamPCAAssigned, slot1Team, slot2Team, slot3Team, slot4Team)
      return slotsToApply
    }

    context.specialPrograms.forEach((program) => {
      if (!program.weekdays.includes(weekday)) return

      // Skip DRM - it doesn't have designated PCA staff, only adds to DRO's required FTE
      if (program.name === 'DRM') return

      let programSlots = getEffectiveSpecialProgramWeekdaySlots({
        program,
        day: weekday,
        preferDirectWeekdaySlots: true,
      })

      if (programSlots.length === 0) return

      // Find teams that need this special program PCA
      // Use tolerance (0.01) to avoid floating point precision issues (e.g., 1.0 vs 1.0001)
      const TOLERANCE = 0.01
      const teamsNeedingProgram = Object.entries(context.averagePCAPerTeam)
        .filter(([team, required]) => {
          const teamKey = team as Team
          const preference = getTeamPreference(teamKey)
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

      

      // Use PCA preference order first, then fallback (floating first in all cases).
      const { pcaToAssign } = selectSpecialProgramCandidate({
        program,
        floatingPCA,
        nonFloatingPCA,
        allocations,
      })

      const targetTeamsForProgram = resolveTargetTeamsForSpecialProgram({
        context,
        program,
        teamsNeedingProgram,
        teamPCAAssigned,
      })

      if (targetTeamsForProgram.length === 0) return

      const manualPcaCovers: Array<{ pcaId: string; slots: number[] }> = Array.isArray((program as any).__manualPcaCovers)
        ? (program as any).__manualPcaCovers
            .filter((entry: any) => entry && typeof entry === 'object' && typeof entry.pcaId === 'string')
            .map((entry: any) => ({
              pcaId: entry.pcaId as string,
              slots: Array.isArray(entry.slots)
                ? entry.slots.filter((slot: any) => [1, 2, 3, 4].includes(slot))
                : [],
            }))
        : []
      const allowMultiSpecialProgramCoverage = manualPcaCovers.length > 0

      // Assign PCA to target teams (for Robotic/CRP, only one allocation; for others, one per team)
      // For Robotic/CRP, check if we've already created an allocation for this program
      let programAllocationCreated = false
      let programAssigned = false // Track if any PCA was assigned for this program

      if (manualPcaCovers.length > 0 && targetTeamsForProgram.length > 0) {
        const primaryTargetTeam = targetTeamsForProgram[0]
        manualPcaCovers.forEach((cover: { pcaId: string; slots: number[] }) => {
          if (!Array.isArray(cover.slots) || cover.slots.length === 0) return
          const pool = [...floatingPCA, ...nonFloatingPCA]
          const candidate = pool.find((pca) => pca.id === cover.pcaId && pca.special_program?.includes(program.name) && pca.is_available)
          if (!candidate) return
          const slotsRequested = cover.slots.filter((slot: number) => programSlots.includes(slot))
          if (slotsRequested.length === 0) return
          const assigned = assignSpecialProgramSlotsToPca({
            program,
            pca: candidate,
            targetTeam: primaryTargetTeam,
            slots: slotsRequested,
          })
          if (assigned.length === 0) return
          programAssigned = true
          programAllocationCreated = true
          const assignedSet = new Set(assigned)
          programSlots = programSlots.filter((slot) => !assignedSet.has(slot))
        })
      }

      if (programSlots.length === 0) {
        return
      }

      targetTeamsForProgram.forEach((targetTeam) => {
        // For Robotic/CRP, only create one allocation total (not per team)
        if (usesSharedAllocationIdentityForProgram(program) && !allowMultiSpecialProgramCoverage && programAllocationCreated) {
          return
        }

        const neededFTE = context.averagePCAPerTeam[targetTeam] - teamPCAAssigned[targetTeam]
        if (neededFTE <= 0 && !bypassesPrimaryTargetPendingGateForProgram(program)) return

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
              (usesSharedAllocationIdentityForProgram(program)
                ? !hasProgramAllocationForStaff(pca.id, program.id)
                : !hasProgramAllocationForStaff(pca.id, program.id, targetTeam))
            )

            if (floatingPca) {
              // For special programs (Robotic/CRP), find allocation by program, not by team
              // For other programs, find by team
              const existingAllocation = usesSharedAllocationIdentityForProgram(program)
                ? getAllocationsByStaffId(floatingPca.id).find((a) => a.special_program_ids?.includes(program.id))
                : getAllocationsByStaffId(floatingPca.id).find((a) => a.team === targetTeam)
              const remainingFTE = existingAllocation?.fte_remaining ?? floatingPca.fte_pca

              // Any allocation (including substitutions) for slot-usage checks
              const anyAllocationForPCA = getFirstAllocationByStaffId(floatingPca.id)
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
                const fteToAssign = usesSharedAllocationIdentityForProgram(program)
                  ? Math.min(remainingFTE, fteForSlots) // Use full slot FTE for special programs
                  : Math.min(neededFTE, remainingFTE, fteForSlots, program.pca_required || fteForSlots)

                // IMPORTANT: reuse the PCA's existing allocation (if any) to avoid duplicate allocations for the same staff_id
                const baseAllocationForPCA = getFirstAllocationByStaffId(floatingPca.id) ?? existingAllocation

                if (baseAllocationForPCA) {
                  // Track newly assigned slots to avoid double-counting
                  const newlyAssignedSlots: { slot: number, team: Team }[] = []
                  programSlots.forEach(slot => {
                    const slotTeam = getSlotTeamForSpecialProgram(program, slot, targetTeam)
                    if (slotTeam && assignSlotIfValid({ allocation: baseAllocationForPCA, slot, team: slotTeam, availableSlots: programSlots, minFteRemaining: 0.25 })) {
                      newlyAssignedSlots.push({ slot, team: slotTeam })
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
                  const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program, 1, targetTeam) : null
                  const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program, 2, targetTeam) : null
                  const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program, 3, targetTeam) : null
                  const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program, 4, targetTeam) : null

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
                if (usesSharedAllocationIdentityForProgram(program)) {
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
              (usesSharedAllocationIdentityForProgram(program)
                ? !hasProgramAllocationForStaff(pca.id, program.id)
                : !hasProgramAllocationForStaff(pca.id, program.id, targetTeam))
            )

            if (nonFloatingPca) {
              // For special programs (Robotic/CRP), find allocation by program, not by team
              const existingAllocation = usesSharedAllocationIdentityForProgram(program)
                ? getAllocationsByStaffId(nonFloatingPca.id).find((a) => a.special_program_ids?.includes(program.id))
                : getAllocationsByStaffId(nonFloatingPca.id).find((a) => a.team === targetTeam)
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
                    const slotTeam = getSlotTeamForSpecialProgram(program, slot, targetTeam)
                    if (slotTeam && assignSlotIfValid({ allocation: existingAllocation, slot, team: slotTeam, availableSlots: programSlots, minFteRemaining: 0.25 })) {
                      newlyAssignedSlots.push({ slot, team: slotTeam })
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
                  const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program, 1, targetTeam) : null
                  const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program, 2, targetTeam) : null
                  const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program, 3, targetTeam) : null
                  const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program, 4, targetTeam) : null
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
                if (usesSharedAllocationIdentityForProgram(program)) {
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
            (usesSharedAllocationIdentityForProgram(program)
              ? !hasProgramAllocationForStaff(pca.id, program.id)
              : !hasProgramAllocationForStaff(pca.id, program.id, targetTeam))
          )

          if (fallbackFloating) {
            const existingAllocation = getAllocationsByStaffId(fallbackFloating.id).find((a) => a.team === targetTeam)
            const remainingFTE = existingAllocation?.fte_remaining || 1

            if (remainingFTE > 0) {
              // Calculate FTE based on number of slots assigned
              const slotsToAssign = programSlots.length
              const ftePerSlot = 0.25
              const fteForSlots = slotsToAssign * ftePerSlot
              // For special programs, use all slots FTE, not just what's needed by the team
              const fteToAssign = usesSharedAllocationIdentityForProgram(program)
                ? Math.min(remainingFTE, fteForSlots) // Use full slot FTE for special programs
                : Math.min(neededFTE, remainingFTE, fteForSlots, program.pca_required || fteForSlots)

              if (existingAllocation) {
                // Track newly assigned slots to avoid double-counting
                const newlyAssignedSlots: { slot: number, team: Team }[] = []
                programSlots.forEach(slot => {
                  const slotTeam = getSlotTeamForSpecialProgram(program, slot, targetTeam)
                  if (slotTeam && assignSlotIfValid({ allocation: existingAllocation, slot, team: slotTeam, availableSlots: programSlots, minFteRemaining: 0.25 })) {
                    newlyAssignedSlots.push({ slot, team: slotTeam })
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
                const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program, 1, targetTeam) : null
                const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program, 2, targetTeam) : null
                const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program, 3, targetTeam) : null
                const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program, 4, targetTeam) : null
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
              (usesSharedAllocationIdentityForProgram(program)
                ? !hasProgramAllocationForStaff(pca.id, program.id)
                : !hasProgramAllocationForStaff(pca.id, program.id, targetTeam))
            )

            if (fallbackNonFloating) {
              const existingAllocation = getAllocationsByStaffId(fallbackNonFloating.id).find((a) => a.team === targetTeam)
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
                    const slotTeam = getSlotTeamForSpecialProgram(program, slot, targetTeam)
                    if (slotTeam && assignSlotIfValid({ allocation: existingAllocation, slot, team: slotTeam, availableSlots: programSlots, minFteRemaining: 0.25 })) {
                      newlyAssignedSlots.push({ slot, team: slotTeam })
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
                  const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program, 1, targetTeam) : null
                  const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program, 2, targetTeam) : null
                  const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program, 3, targetTeam) : null
                  const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program, 4, targetTeam) : null
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
  ): FloatingSubCandidate[] => {
    const teamPref = getTeamPreference(team)
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

    const getProgramSlotsForWeekday = (program: SpecialProgram): number[] =>
      getEffectiveSpecialProgramWeekdaySlots({
        program,
        day: currentWeekday,
        preferDirectWeekdaySlots: true,
      })

    const available: FloatingSubCandidate[] = []

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
      
      const existingAllocation = getFirstAllocationByStaffId(pca.id)
      const assignedSlots: number[] = []
      if (existingAllocation) {
        if (existingAllocation.slot1 !== null) assignedSlots.push(1)
        if (existingAllocation.slot2 !== null) assignedSlots.push(2)
        if (existingAllocation.slot3 !== null) assignedSlots.push(3)
        if (existingAllocation.slot4 !== null) assignedSlots.push(4)
      }

      // IMPORTANT: Step 2.1 edge case
      // If a floating PCA is already assigned to special program(s) (Step 2.0),
      // we still allow them as a substitute for non-floating, but only for their *free* slots.
      const freeSlots = pcaAvailableSlots.filter((s) => !assignedSlots.includes(s))
      const coverableMissingSlots = missingSlots.filter((s) => freeSlots.includes(s))
      if (coverableMissingSlots.length === 0) return

      let blockedSlotsInfo: BlockedSlotInfo[] | undefined
      if (existingAllocation?.special_program_ids && existingAllocation.special_program_ids.length > 0) {
        const reasonBySlot = new Map<number, Set<string>>()
        for (const pid of existingAllocation.special_program_ids) {
          const program = getSpecialProgramById(pid)
          if (!program) continue
          const programSlots = getProgramSlotsForWeekday(program)
          for (const slot of programSlots) {
            if (!assignedSlots.includes(slot)) continue // Only label slots that are actually occupied
            const set = reasonBySlot.get(slot) ?? new Set<string>()
            set.add((program as any).name ?? 'special program')
            reasonBySlot.set(slot, set)
          }
        }
        if (reasonBySlot.size > 0) {
          blockedSlotsInfo = Array.from(reasonBySlot.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([slot, reasons]) => ({ slot, reasons: Array.from(reasons).sort() }))
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
        // Expose only currently free slots so Step 2.1 can show correct remaining capacity (e.g. 3 slots).
        availableSlots: freeSlots,
        isPreferred: preferredPCAIds.includes(pca.id),
        isFloorPCA: isFloorPCA || false,
        blockedSlotsInfo,
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
    
    const allocation = getFirstAllocationByStaffId(pca.id)
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
  let userSubstitutionSelections: Record<string, Array<{ floatingPCAId: string; slots: number[] }>> = {}
  if (context.onNonFloatingSubstitution && substitutionNeeds.length > 0) {
    userSubstitutionSelections = await context.onNonFloatingSubstitution(substitutionNeeds)
  }

  // Apply user selections for whole-day substitutions first
  wholeDaySubstitutionNeeds.forEach((subNeed) => {
    const selectionKey = `${subNeed.team}-${subNeed.nonFloatingPCAId}`
    const userSelections = userSubstitutionSelections[selectionKey]

    if (Array.isArray(userSelections) && userSelections.length > 0) {
      for (const userSelection of userSelections) {
        const floatingPca = floatingPCA.find(p => p.id === userSelection.floatingPCAId)
        if (!floatingPca) continue

        const existingAllocation = getFirstAllocationByStaffId(floatingPca.id)
        let assignedCount = 0
        const slots = Array.isArray(userSelection.slots) ? userSelection.slots : []

        if (existingAllocation) {
          // Update existing allocation - assign only selected slots (leave special-program slots intact).
          slots.forEach((slot) => {
            const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : 'slot4'
            if (existingAllocation[slotField] === null) {
              existingAllocation[slotField] = subNeed.team
              assignedCount += 1
            }
          })
          const baseFTE = floatingPca.fte_pca
          updateAllocationFTE(existingAllocation, baseFTE)
        } else {
          // Create new allocation for selected slots (whole-day need may be partially covered if some slots are blocked).
          const slot1Team = slots.includes(1) ? subNeed.team : null
          const slot2Team = slots.includes(2) ? subNeed.team : null
          const slot3Team = slots.includes(3) ? subNeed.team : null
          const slot4Team = slots.includes(4) ? subNeed.team : null
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
          assignedCount = slots.length
        }

        teamPCAAssigned[subNeed.team] += assignedCount * 0.25
      }
    } else {
      // Use automatic algorithm (original logic) - only if callback not provided or user skipped
      // Get team's PCA preferences
      const teamPreference = getTeamPreference(subNeed.team)
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
        const existingAllocation = getFirstAllocationByStaffId(floatingPca.id)
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
    const userSelections = userSubstitutionSelections[selectionKey]

    if (Array.isArray(userSelections) && userSelections.length > 0) {
      for (const userSelection of userSelections) {
        const floatingPca = floatingPCA.find(p => p.id === userSelection.floatingPCAId)
        if (!floatingPca) continue

        const existingAllocation = getFirstAllocationByStaffId(floatingPca.id)
        const slots = Array.isArray(userSelection.slots) ? userSelection.slots : []
        let assignedCount = 0

        if (existingAllocation) {
          const remainingSlotCapacity = getRemainingAssignableSlotCount(floatingPca.fte_pca, existingAllocation)
          assignedCount = assignSlotsToExistingAllocation(existingAllocation, slots, subNeed.team, remainingSlotCapacity)
          const baseFTE = floatingPca.fte_pca
          updateAllocationFTE(existingAllocation, baseFTE)
        } else {
          // Create new allocation
          const slot1Team = slots.includes(1) ? subNeed.team : null
          const slot2Team = slots.includes(2) ? subNeed.team : null
          const slot3Team = slots.includes(3) ? subNeed.team : null
          const slot4Team = slots.includes(4) ? subNeed.team : null
          
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
          assignedCount = slots.length
        }

        // Update tracking
        teamPCAAssigned[subNeed.team] += assignedCount * 0.25
      }
    } else {
      // Use automatic algorithm (original logic)
      // Get team's PCA preferences
      const teamPreference = getTeamPreference(subNeed.team)
      const preferredPCAIds = teamPreference?.preferred_pca_ids || []
      
      // Track which slots couldn't be substituted
      const remainingMissingSlots: number[] = []
      
      // IMPROVED: Try to assign ALL missing slots to the same PCA first (preferred behavior)
      const missingSlots = subNeed.missingSlots
      let allSlotsAssigned = false
      let strategy1ChosenPcaId: string | null = null
      
      // Helper function to check if a PCA can cover specific slots
      const canPCACoverSlots = (pca: PCAData, slots: number[], existingAlloc: PCAAllocation | undefined): boolean => {
        if (!pca.is_available) return false

        if (getRemainingAssignableSlotCount(pca.fte_pca, existingAlloc) < slots.length) {
          return false
        }
        
        // Check if all slots are in PCA's availableSlots
        if (pca.availableSlots && pca.availableSlots.length > 0) {
          const canCover = slots.every(slot => pca.availableSlots!.includes(slot))
          if (!canCover) return false
        }
        
        // Check if slots are already assigned to special program
        if (existingAlloc) {
          for (const slot of slots) {
            const slotField = slot === 1 ? 'slot1' : slot === 2 ? 'slot2' : slot === 3 ? 'slot3' : 'slot4'
            if (existingAlloc[slotField] !== null && existingAlloc.special_program_ids && existingAlloc.special_program_ids.length > 0) {
              return false // Slot already assigned to special program
            }
          }
        }
        
        return true
      }
      
      // Strategy 1: Try to find a single preferred PCA that can cover ALL missing slots
      if (preferredPCAIds.length > 0 && missingSlots.length > 1) {
        for (const preferredPcaId of preferredPCAIds) {
          const floatingPca = floatingPCA.find(pca => pca.id === preferredPcaId)
          if (!floatingPca) continue
          
          const existingAllocation = getFirstAllocationByStaffId(floatingPca.id)
          if (!canPCACoverSlots(floatingPca, missingSlots, existingAllocation)) continue
          
          // Found PCA that can cover all slots - assign all at once
          if (existingAllocation) {
            assignSlotsToExistingAllocation(
              existingAllocation,
              missingSlots,
              subNeed.team,
              getRemainingAssignableSlotCount(floatingPca.fte_pca, existingAllocation)
            )
            const baseFTE = floatingPca.fte_pca
            updateAllocationFTE(existingAllocation, baseFTE)
          } else {
            // Create new allocation with all missing slots
            const slot1Team = missingSlots.includes(1) ? subNeed.team : null
            const slot2Team = missingSlots.includes(2) ? subNeed.team : null
            const slot3Team = missingSlots.includes(3) ? subNeed.team : null
            const slot4Team = missingSlots.includes(4) ? subNeed.team : null
            
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
          teamPCAAssigned[subNeed.team] += missingSlots.length * 0.25
          allSlotsAssigned = true
          strategy1ChosenPcaId = floatingPca.id
          break // Found substitute for all slots
        }
      }
      
      // Strategy 2: If couldn't assign all slots to one PCA, fall back to per-slot assignment
      if (!allSlotsAssigned) {
        // For each missing slot, find a floating PCA to substitute
        subNeed.missingSlots.forEach((missingSlot) => {
      let substituteFound = false
      let chosenPcaId: string | null = null
      let chosenPath: 'preferred' | 'nonPreferred' | 'fallback' | null = null
      
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
          
          // Any occupied slot is unavailable here, not just special-program work.
          const existingAllocation = getFirstAllocationByStaffId(floatingPca.id)
          if (existingAllocation) {
            const slotField = missingSlot === 1 ? 'slot1' : missingSlot === 2 ? 'slot2' : missingSlot === 3 ? 'slot3' : 'slot4'
            const canAssignAnotherSlot = getRemainingAssignableSlotCount(floatingPca.fte_pca, existingAllocation) > 0
            if (existingAllocation[slotField] !== null || !canAssignAnotherSlot) {
              continue
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
          chosenPcaId = floatingPca.id
          chosenPath = 'preferred'
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
          const existingAllocation = getFirstAllocationByStaffId(nonPreferredFloating.id)
          
          // Any occupied slot is unavailable here, not just special-program work.
          if (existingAllocation) {
            const slotField = missingSlot === 1 ? 'slot1' : missingSlot === 2 ? 'slot2' : missingSlot === 3 ? 'slot3' : 'slot4'
            const canAssignAnotherSlot = getRemainingAssignableSlotCount(nonPreferredFloating.fte_pca, existingAllocation) > 0
            if (existingAllocation[slotField] !== null || !canAssignAnotherSlot) {
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
              chosenPcaId = nonPreferredFloating.id
              chosenPath = 'nonPreferred'
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
            chosenPcaId = nonPreferredFloating.id
            chosenPath = 'nonPreferred'
          }
        }
        
        // Step 2: If no non-preferred PCA found, fallback to any available floating PCA (including preferred ones)
        if (!substituteFound) {
          const fallbackFloating = floatingPCA.find(
            pca => pca.is_available &&
            (!pca.availableSlots || pca.availableSlots.length === 0 || pca.availableSlots.includes(missingSlot))
          )
          
          if (fallbackFloating) {
            const existingAllocation = getFirstAllocationByStaffId(fallbackFloating.id)
            
            // Any occupied slot is unavailable here, not just special-program work.
            if (existingAllocation) {
              const slotField = missingSlot === 1 ? 'slot1' : missingSlot === 2 ? 'slot2' : missingSlot === 3 ? 'slot3' : 'slot4'
              const canAssignAnotherSlot = getRemainingAssignableSlotCount(fallbackFloating.fte_pca, existingAllocation) > 0
              if (existingAllocation[slotField] !== null || !canAssignAnotherSlot) {
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
                chosenPcaId = fallbackFloating.id
                chosenPath = 'fallback'
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
              chosenPcaId = fallbackFloating.id
              chosenPath = 'fallback'
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
          const existingAllocation = getFirstAllocationByStaffId(fallbackFloating.id)
          
          // Any occupied slot is unavailable here, not just special-program work.
          if (existingAllocation) {
            const slotField = missingSlot === 1 ? 'slot1' : missingSlot === 2 ? 'slot2' : missingSlot === 3 ? 'slot3' : 'slot4'
            const canAssignAnotherSlot = getRemainingAssignableSlotCount(fallbackFloating.fte_pca, existingAllocation) > 0
            if (existingAllocation[slotField] !== null || !canAssignAnotherSlot) {
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
              chosenPcaId = fallbackFloating.id
              chosenPath = 'fallback'
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
            chosenPcaId = fallbackFloating.id
            chosenPath = 'fallback'
          }
        }
      }

        // Track if slot couldn't be substituted
        if (!substituteFound) {
          remainingMissingSlots.push(missingSlot)
        }
        })
      } // End of Strategy 2: per-slot assignment fallback
      
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
  
  // Exclude special-program slot assignments from "assigned" when computing pending needs for Step 3.
  // Special program slots are designated work and should not satisfy per-team floating needs.
  if (shouldDoSpecialProgram) {
    TEAMS.forEach((t) => {
      teamPCASpecialProgramAssigned[t] = 0
    })

    const slotsByProgramId = new Map<string, Set<number>>()
    ;(context.specialPrograms || []).forEach((program) => {
      const programSlots = getEffectiveSpecialProgramWeekdaySlots({
        program,
        day: weekday,
        preferDirectWeekdaySlots: true,
      })
      slotsByProgramId.set(program.id, new Set(programSlots))
    })

    allocations.forEach((alloc) => {
      const ids = (alloc as any)?.special_program_ids
      if (!Array.isArray(ids) || ids.length === 0) return

      const specialSlotSet = new Set<number>()
      ids.forEach((id: any) => {
        const s = slotsByProgramId.get(String(id))
        if (!s) return
        s.forEach((slot) => specialSlotSet.add(slot))
      })
      if (specialSlotSet.size === 0) return

      const add = (slotNum: 1 | 2 | 3 | 4, slotTeam: Team | null) => {
        if (!slotTeam) return
        if (!specialSlotSet.has(slotNum)) return
        teamPCASpecialProgramAssigned[slotTeam] += 0.25
      }
      add(1, (alloc as any).slot1 ?? null)
      add(2, (alloc as any).slot2 ?? null)
      add(3, (alloc as any).slot3 ?? null)
      add(4, (alloc as any).slot4 ?? null)

      const inv = (alloc as any)?.invalid_slot as 1 | 2 | 3 | 4 | null | undefined
      if (inv === 1 || inv === 2 || inv === 3 || inv === 4) {
        if (specialSlotSet.has(inv)) {
          const invTeam = (inv === 1 ? (alloc as any).slot1 : inv === 2 ? (alloc as any).slot2 : inv === 3 ? (alloc as any).slot3 : (alloc as any).slot4) as Team | null
          if (invTeam) {
            teamPCASpecialProgramAssigned[invTeam] = Math.max(0, teamPCASpecialProgramAssigned[invTeam] - 0.25)
          }
        }
      }
    })
  }

  Object.entries(context.averagePCAPerTeam).forEach(([team, baseRequired]) => {
    const teamKey = team as Team
    const assigned = teamPCAAssigned[teamKey] - (teamPCASpecialProgramAssigned[teamKey] || 0)
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
    
    const programSlots = getEffectiveSpecialProgramWeekdaySlots({
      program,
      day: weekday,
      preferDirectWeekdaySlots: true,
    })
    
    if (programSlots.length === 0) return

    // Find teams that need this special program PCA
    // Use tolerance (0.01) to avoid floating point precision issues (e.g., 1.0 vs 1.0001)
    const TOLERANCE = 0.01
    const teamsNeedingProgram = Object.entries(context.averagePCAPerTeam)
      .filter(([team, required]) => {
        const teamKey = team as Team
          const preference = getTeamPreference(teamKey)
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

    // Use PCA preference order first, then fallback (floating first in all cases).
    const { pcaToAssign } = selectSpecialProgramCandidate({
      program,
      floatingPCA,
      nonFloatingPCA,
      allocations,
    })

    const targetTeamsForProgram = resolveTargetTeamsForSpecialProgram({
      context,
      program,
      teamsNeedingProgram,
      teamPCAAssigned,
    })
    
    if (targetTeamsForProgram.length === 0) return
    
    // Assign PCA to target teams (for Robotic/CRP, only one allocation; for others, one per team)
    // For Robotic/CRP, check if we've already created an allocation for this program
    let programAllocationCreated = false
    let programAssigned = false // Track if any PCA was assigned for this program
    
    targetTeamsForProgram.forEach((targetTeam) => {
      // For Robotic/CRP, only create one allocation total (not per team)
      if (usesSharedAllocationIdentityForProgram(program) && programAllocationCreated) {
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
            (usesSharedAllocationIdentityForProgram(program)
              ? !hasProgramAllocationForStaff(pca.id, program.id)
              : !hasProgramAllocationForStaff(pca.id, program.id, targetTeam))
          )
          
          if (floatingPca) {
            // For special programs (Robotic/CRP), find allocation by program, not by team
            // For other programs, find by team
              const existingAllocation = usesSharedAllocationIdentityForProgram(program)
                ? getAllocationsByStaffId(floatingPca.id).find((a) => a.special_program_ids?.includes(program.id))
                : getAllocationsByStaffId(floatingPca.id).find((a) => a.team === targetTeam)
            const remainingFTE = existingAllocation?.fte_remaining ?? floatingPca.fte_pca

            // Any allocation (including substitutions) for slot-usage checks
            const anyAllocationForPCA = getFirstAllocationByStaffId(floatingPca.id)
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
              const fteToAssign = usesSharedAllocationIdentityForProgram(program)
                ? Math.min(remainingFTE, fteForSlots) // Use full slot FTE for special programs
                : Math.min(neededFTE, remainingFTE, fteForSlots, program.pca_required || fteForSlots)
              
              // IMPORTANT: reuse the PCA's existing allocation (if any) to avoid duplicate allocations for the same staff_id
              const baseAllocationForPCA = getFirstAllocationByStaffId(floatingPca.id) ?? existingAllocation

              if (baseAllocationForPCA) {
                // Track newly assigned slots to avoid double-counting
                const newlyAssignedSlots: { slot: number, team: Team }[] = []
                programSlots.forEach(slot => {
                  const slotTeam = getSlotTeamForSpecialProgram(program, slot, targetTeam)
                  if (slotTeam && assignSlotIfValid({ allocation: baseAllocationForPCA, slot, team: slotTeam, availableSlots: programSlots, minFteRemaining: 0.25 })) {
                    newlyAssignedSlots.push({ slot, team: slotTeam })
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
                const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program, 1, targetTeam) : null
                const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program, 2, targetTeam) : null
                const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program, 3, targetTeam) : null
                const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program, 4, targetTeam) : null
                
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
              if (usesSharedAllocationIdentityForProgram(program)) {
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
            (usesSharedAllocationIdentityForProgram(program)
              ? !hasProgramAllocationForStaff(pca.id, program.id)
              : !hasProgramAllocationForStaff(pca.id, program.id, targetTeam))
          )
          
          if (nonFloatingPca) {
            // For special programs (Robotic/CRP), find allocation by program, not by team
            const existingAllocation = usesSharedAllocationIdentityForProgram(program)
              ? getAllocationsByStaffId(nonFloatingPca.id).find((a) => a.special_program_ids?.includes(program.id))
              : getAllocationsByStaffId(nonFloatingPca.id).find((a) => a.team === targetTeam)
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
                  const slotTeam = getSlotTeamForSpecialProgram(program, slot, targetTeam)
                  if (slotTeam && assignSlotIfValid({ allocation: existingAllocation, slot, team: slotTeam, availableSlots: programSlots, minFteRemaining: 0.25 })) {
                    newlyAssignedSlots.push({ slot, team: slotTeam })
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
                const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program, 1, targetTeam) : null
                const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program, 2, targetTeam) : null
                const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program, 3, targetTeam) : null
                const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program, 4, targetTeam) : null
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
              if (usesSharedAllocationIdentityForProgram(program)) {
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
          (usesSharedAllocationIdentityForProgram(program)
            ? !hasProgramAllocationForStaff(pca.id, program.id)
            : !hasProgramAllocationForStaff(pca.id, program.id, targetTeam))
        )
        
        if (fallbackFloating) {
          const existingAllocation = getAllocationsByStaffId(fallbackFloating.id).find((a) => a.team === targetTeam)
          const remainingFTE = existingAllocation?.fte_remaining || 1
          
          if (remainingFTE > 0) {
            // Calculate FTE based on number of slots assigned
            const slotsToAssign = programSlots.length
            const ftePerSlot = 0.25
            const fteForSlots = slotsToAssign * ftePerSlot
            // For special programs, use all slots FTE, not just what's needed by the team
            const fteToAssign = usesSharedAllocationIdentityForProgram(program)
              ? Math.min(remainingFTE, fteForSlots) // Use full slot FTE for special programs
              : Math.min(neededFTE, remainingFTE, fteForSlots, program.pca_required || fteForSlots)
            
            if (existingAllocation) {
              // Track newly assigned slots to avoid double-counting
              const newlyAssignedSlots: { slot: number, team: Team }[] = []
              programSlots.forEach(slot => {
                const slotTeam = getSlotTeamForSpecialProgram(program, slot, targetTeam)
                if (slotTeam && assignSlotIfValid({ allocation: existingAllocation, slot, team: slotTeam, availableSlots: programSlots, minFteRemaining: 0.25 })) {
                  newlyAssignedSlots.push({ slot, team: slotTeam })
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
              const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program, 1, targetTeam) : null
              const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program, 2, targetTeam) : null
              const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program, 3, targetTeam) : null
              const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program, 4, targetTeam) : null
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
            (usesSharedAllocationIdentityForProgram(program)
              ? !hasProgramAllocationForStaff(pca.id, program.id)
              : !hasProgramAllocationForStaff(pca.id, program.id, targetTeam))
          )
          
          if (fallbackNonFloating) {
            const existingAllocation = getAllocationsByStaffId(fallbackNonFloating.id).find((a) => a.team === targetTeam)
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
                  const slotTeam = getSlotTeamForSpecialProgram(program, slot, targetTeam)
                  if (slotTeam && assignSlotIfValid({ allocation: existingAllocation, slot, team: slotTeam, availableSlots: programSlots, minFteRemaining: 0.25 })) {
                    newlyAssignedSlots.push({ slot, team: slotTeam })
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
                const slot1Team = programSlots.includes(1) ? getSlotTeamForSpecialProgram(program, 1, targetTeam) : null
                const slot2Team = programSlots.includes(2) ? getSlotTeamForSpecialProgram(program, 2, targetTeam) : null
                const slot3Team = programSlots.includes(3) ? getSlotTeamForSpecialProgram(program, 3, targetTeam) : null
                const slot4Team = programSlots.includes(4) ? getSlotTeamForSpecialProgram(program, 4, targetTeam) : null
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

        const existingAllocation = getFirstAllocationByStaffId(pcaId)
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
              const altAllocation = getFirstAllocationByStaffId(alternativePCA.id)
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
        const existingAllocation = getFirstAllocationByStaffId(availablePCA.id)
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
      const allocation = getFirstAllocationByStaffId(pca.id)
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
    const targetPreference = getTeamPreference(targetTeam)
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
          
    const allocation = getFirstAllocationByStaffId(pca.id)
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
          const allocation = getFirstAllocationByStaffId(pca.id)
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
      
      const allocation = getFirstAllocationByStaffId(pcaToAssign!.id)
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
          const allocStaff = getPcaById(alloc.staff_id)
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
          const allocStaff = getPcaById(alloc.staff_id)
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
        }
        
        allocations.push(newAllocation)
        
        // Update tracking using true FTE (invalid slot not counted)
        teamPCAAssigned[targetTeam] += trueFTE
        pendingPCAFTEPerTeam[targetTeam] = Math.max(0, pendingPCAFTEPerTeam[targetTeam] - trueFTE)
      }
      
      // Remove PCA from available list if fully allocated
      const updatedAllocation = getFirstAllocationByStaffId(pcaToAssign.id)
      if (updatedAllocation && updatedAllocation.fte_remaining <= 0) {
        remainingFloatingPCA.splice(pcaIndex, 1)
      }
    }
  }

  // Post-processing: Handle invalid slots for floating PCA (bundle with neighboring slot)
  // This should only run in floating or all phase
  floatingPCA.forEach((pca) => {
    if (pca.invalidSlot === undefined || pca.invalidSlot === null) return
    
    const allocation = getFirstAllocationByStaffId(pca.id)
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
    
    // If neighboring slot found, assign invalid slot to same team (display-only, no FTE consumed)
    if (neighboringTeam) {
      assignSlotIfValid({
        allocation,
        slot: invalidSlot,
        team: neighboringTeam,
        skipFteCheck: true,
        allowOverwrite: true,
      })
      
      // Add invalid slot fields
      ;(allocation as any).invalid_slot = invalidSlot
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

// Step 3.4 floating allocation lives in pcaAllocationFloating.ts
export {
  allocateFloatingPCA_v2,
  type FloatingPCAAllocationMode,
  type FloatingPCAAllocationContextV2,
  type FloatingPCAAllocationResultV2,
} from './pcaAllocationFloating'

