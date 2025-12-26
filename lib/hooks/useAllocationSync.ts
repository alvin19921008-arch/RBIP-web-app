/**
 * useAllocationSync - Centralized allocation sync for step-wise workflow
 * 
 * This hook manages the synchronization of allocations with staffOverrides.
 * It ensures that UI allocations always reflect the latest user edits.
 * 
 * Two sync triggers:
 * 1. On staffOverrides change (within a step): Real-time UI sync
 * 2. On step transition (currentStep changes): Full sync to populate "before algo" state
 * 
 * @see .cursor/rules/stepwise-workflow-data.mdc for architecture documentation
 */

import { useCallback, useEffect, useRef } from 'react'
import { Team, Staff, LeaveType } from '@/types/staff'
import { TherapistAllocation, PCAAllocation, ScheduleCalculations } from '@/types/schedule'
import { SpecialProgram, SPTAllocation } from '@/types/allocation'
import { allocateTherapists, StaffData, AllocationContext } from '@/lib/algorithms/therapistAllocation'

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

// Type for staff overrides
export interface StaffOverride {
  leaveType: LeaveType | null
  fteRemaining: number
  team?: Team
  fteSubtraction?: number
  availableSlots?: number[]
  invalidSlot?: number
  leaveComebackTime?: string
  isLeave?: boolean
}

export type StaffOverrides = Record<string, StaffOverride>

// Change detection result
export interface ChangeDetection {
  hasTeamChange: boolean
  hasFTEChange: boolean
  hasLeaveChange: boolean
  hasSlotChange: boolean
  hasAnyChange: boolean
  changedStaffIds: string[]
}

// Dependencies required by the hook
export interface AllocationSyncDeps {
  // State
  staffOverrides: StaffOverrides
  currentStep: string
  staff: Staff[]
  therapistAllocations: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  pcaAllocations: Record<Team, (PCAAllocation & { staff: Staff })[]>
  specialPrograms: SpecialProgram[]
  sptAllocations: SPTAllocation[]
  selectedDate: Date
  
  // State setters
  setTherapistAllocations: React.Dispatch<React.SetStateAction<Record<Team, (TherapistAllocation & { staff: Staff })[]>>>
  
  // Callbacks
  recalculateScheduleCalculations: () => void
}

/**
 * Detects what has changed between two staffOverrides objects
 */
export function detectChanges(
  current: StaffOverrides,
  previous: StaffOverrides
): ChangeDetection {
  const result: ChangeDetection = {
    hasTeamChange: false,
    hasFTEChange: false,
    hasLeaveChange: false,
    hasSlotChange: false,
    hasAnyChange: false,
    changedStaffIds: [],
  }

  // Get all unique staff IDs
  const allStaffIds = new Set([...Object.keys(current), ...Object.keys(previous)])

  for (const staffId of allStaffIds) {
    const curr = current[staffId]
    const prev = previous[staffId]

    // Check if this staff has any changes
    if (!curr && !prev) continue

    let hasChange = false

    // Team change
    if (curr?.team !== prev?.team) {
      result.hasTeamChange = true
      hasChange = true
    }

    // FTE change
    if (curr?.fteRemaining !== prev?.fteRemaining) {
      result.hasFTEChange = true
      hasChange = true
    }

    // Leave type change
    if (curr?.leaveType !== prev?.leaveType) {
      result.hasLeaveChange = true
      hasChange = true
    }

    // Slot change
    if (JSON.stringify(curr?.availableSlots) !== JSON.stringify(prev?.availableSlots)) {
      result.hasSlotChange = true
      hasChange = true
    }

    if (hasChange) {
      result.changedStaffIds.push(staffId)
    }
  }

  result.hasAnyChange = result.changedStaffIds.length > 0
  return result
}

/**
 * Custom hook for centralized allocation sync
 */
export function useAllocationSync(deps: AllocationSyncDeps) {
  const {
    staffOverrides,
    currentStep,
    staff,
    therapistAllocations,
    specialPrograms,
    sptAllocations,
    selectedDate,
    setTherapistAllocations,
    recalculateScheduleCalculations,
  } = deps

  // Track previous values for change detection
  const prevStepRef = useRef(currentStep)
  const prevOverridesRef = useRef<StaffOverrides>({})

  /**
   * Syncs therapist allocations from staffOverrides.
   * This rebuilds therapist allocations to reflect team/FTE changes.
   * PCA allocations are NOT affected by this function.
   */
  const syncTherapistAllocations = useCallback(() => {
    if (staff.length === 0) return

    // Transform staff data for therapist allocation algorithm
    const staffData: StaffData[] = staff.map(s => {
      const override = staffOverrides[s.id]
      return {
        id: s.id,
        name: s.name,
        rank: s.rank,
        team: override?.team ?? s.team,
        special_program: s.special_program,
        fte_therapist: override ? override.fteRemaining : 1,
        leave_type: override ? override.leaveType : null,
        is_available: override ? (override.fteRemaining > 0) : true,
        availableSlots: override?.availableSlots,
      }
    })

    // Generate therapist allocations
    // Skip SPT allocation in sync - SPT allocation only runs in Step 2 when user clicks "Initialize Algo"
    const therapistContext: AllocationContext = {
      date: selectedDate,
      previousSchedule: null,
      staff: staffData,
      specialPrograms,
      sptAllocations,
      manualOverrides: {},
      includeSPTAllocation: false, // Skip SPT in sync - only run via "Initialize Algo" in Step 2
    }

    const therapistResult = allocateTherapists(therapistContext)

    // Group therapist allocations by team and add staff info
    const therapistByTeam: Record<Team, (TherapistAllocation & { staff: Staff })[]> = {
      FO: [], SMM: [], SFM: [], CPPC: [], MC: [], GMC: [], NSM: [], DRO: []
    }

    therapistResult.allocations.forEach(alloc => {
      const staffMember = staff.find(s => s.id === alloc.staff_id)
      if (staffMember) {
        const override = staffOverrides[alloc.staff_id]
        if (override) {
          alloc.fte_therapist = override.fteRemaining
          alloc.leave_type = override.leaveType
          if (override.team) {
            alloc.team = override.team
          }
        }
        therapistByTeam[alloc.team].push({ ...alloc, staff: staffMember })
      }
    })

    // Sort therapist allocations: APPT first, then others
    TEAMS.forEach(team => {
      therapistByTeam[team].sort((a, b) => {
        const aIsAPPT = a.staff?.rank === 'APPT'
        const bIsAPPT = b.staff?.rank === 'APPT'
        if (aIsAPPT && !bIsAPPT) return -1
        if (!aIsAPPT && bIsAPPT) return 1
        return 0
      })
    })

    setTherapistAllocations(therapistByTeam)
  }, [staff, staffOverrides, selectedDate, specialPrograms, sptAllocations, setTherapistAllocations])

  /**
   * Step-aware sync dispatcher.
   * Determines what to sync based on the current step.
   */
  const syncAllocations = useCallback(() => {
    switch (currentStep) {
      case 'leave-fte':
        // Step 1: Only therapist + calculations
        syncTherapistAllocations()
        break
      case 'therapist-pca':
        // Step 2: Therapist allocations synced; PCA algo runs on button click
        syncTherapistAllocations()
        break
      case 'floating-pca':
        // Step 3: Therapist synced; Step 2 PCA allocations preserved
        syncTherapistAllocations()
        break
      case 'bed-relieving':
        // Step 4: Therapist synced; bed allocation uses PT/team from calculations
        syncTherapistAllocations()
        break
      case 'review':
        // Step 5: Final review, sync therapist for any last-minute changes
        syncTherapistAllocations()
        break
    }
    recalculateScheduleCalculations()
  }, [currentStep, syncTherapistAllocations, recalculateScheduleCalculations])

  /**
   * TRIGGER 1: Sync on staffOverrides change (real-time within step)
   * Only syncs if there are relevant changes (team, FTE, leave)
   */
  useEffect(() => {
    // Skip if no staff loaded yet
    if (staff.length === 0) return

    // Detect changes
    const changes = detectChanges(staffOverrides, prevOverridesRef.current)

    // Only sync if there are team or FTE changes that affect allocations
    if (changes.hasTeamChange || changes.hasFTEChange || changes.hasLeaveChange) {
      syncAllocations()
    }

    // Update ref for next comparison
    prevOverridesRef.current = { ...staffOverrides }
  }, [staffOverrides, staff.length, syncAllocations])

  /**
   * TRIGGER 2: Sync on step transition (populate "before algo" state)
   * Ensures the new step starts with allocations reflecting latest staffOverrides
   */
  useEffect(() => {
    // Skip if step hasn't changed
    if (currentStep === prevStepRef.current) return

    // Skip if no staff loaded yet
    if (staff.length === 0) return

    // Step changed - sync allocations from latest staffOverrides
    console.log(`[AllocationSync] Step transition: ${prevStepRef.current} -> ${currentStep}`)
    syncAllocations()

    // Update ref
    prevStepRef.current = currentStep
  }, [currentStep, staff.length, syncAllocations])

  return {
    syncAllocations,
    syncTherapistAllocations,
    detectChanges: (prev: StaffOverrides) => detectChanges(staffOverrides, prev),
  }
}


