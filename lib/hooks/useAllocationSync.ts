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

  // When true, schedule page is hydrating/loading and we should NOT trigger sync/recalc
  // from staffOverrides/currentStep changes caused by the load itself.
  isHydrating?: boolean
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
    isHydrating = false,
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

    // CRITICAL: Preserve existing SPT allocations since includeSPTAllocation is false
    // SPT allocations are only created in Step 2 "Initialize Algo" and must persist
    // BUT: Check across ALL teams to avoid duplicates when SPT is moved to a different team
    const allExistingSPTAllocations: (TherapistAllocation & { staff: Staff })[] = []
    TEAMS.forEach(team => {
      const existingSPTAllocations = therapistAllocations[team].filter(
        alloc => alloc.staff?.rank === 'SPT'
      )
      allExistingSPTAllocations.push(...existingSPTAllocations)
    })
    
    // Check if each existing SPT is already in the new result (across all teams)
    // If not, preserve it but update team/FTE from staffOverrides
    allExistingSPTAllocations.forEach(sptAlloc => {
      // Check if SPT exists in ANY team in the new result
      const alreadyExists = TEAMS.some(team => 
        therapistByTeam[team].some(a => a.staff_id === sptAlloc.staff_id)
      )
      
      if (!alreadyExists) {
        // Update team and FTE from staffOverrides if available
        const override = staffOverrides[sptAlloc.staff_id]
        const targetTeam = override?.team ?? sptAlloc.team
        
        // Create updated allocation with new team
        const updatedAlloc = {
          ...sptAlloc,
          team: targetTeam,
          fte_therapist: override?.fteRemaining ?? sptAlloc.fte_therapist,
          leave_type: override?.leaveType ?? sptAlloc.leave_type,
        }
        
        therapistByTeam[targetTeam].push(updatedAlloc)
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
  }, [staff, staffOverrides, selectedDate, specialPrograms, sptAllocations, setTherapistAllocations, therapistAllocations])

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

    // If we are NOT in Step 1, and this is the first time we're seeing a non-empty staffOverrides payload,
    // treat it as "loaded from DB" initialization rather than a user edit. Do not sync/recalculate.
    // This avoids a late overwrite of saved therapist allocations (and schedule calculations) during load.
    const prevKeys = Object.keys(prevOverridesRef.current || {}).length
    const nextKeys = Object.keys(staffOverrides || {}).length
    if (prevKeys === 0 && nextKeys > 0 && currentStep !== 'leave-fte') {
      prevOverridesRef.current = { ...staffOverrides }
      return
    }

    // During initial schedule hydration, staffOverrides is set from DB.
    // Do not sync/recalculate in response to that load-driven state change.
    if (isHydrating) {
      prevOverridesRef.current = { ...staffOverrides }
      return
    }

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
   * 
   * IMPORTANT: Skip therapist regeneration when transitioning FROM Step 2 onwards
   * to preserve the allocations created by Step 2's "Initialize Algo"
   */
  useEffect(() => {
    // Skip if step hasn't changed
    if (currentStep === prevStepRef.current) return

    // Skip if no staff loaded yet
    if (staff.length === 0) return

    const prevStep = prevStepRef.current

    if (isHydrating) {
      prevStepRef.current = currentStep
      return
    }

    // When loading an existing schedule, currentStep may jump from 'leave-fte' to a later step
    // while staffOverrides is being initialized from DB. Do NOT sync/recalculate from this load-driven step transition.
    const prevOverrideKeys = Object.keys(prevOverridesRef.current || {}).length
    const nextOverrideKeys = Object.keys(staffOverrides || {}).length
    if (prevOverrideKeys === 0 && nextOverrideKeys > 0 && prevStep === 'leave-fte' && currentStep !== 'leave-fte') {
      prevStepRef.current = currentStep
      return
    }
    
    // Check if we're transitioning FROM Step 2 or later TO a subsequent step
    // In this case, we should NOT regenerate therapist allocations to preserve
    // the team assignments from Step 2's "Initialize Algo"
    const step2OrLater = ['therapist-pca', 'floating-pca', 'bed-relieving', 'review']
    const isFromStep2OrLater = step2OrLater.includes(prevStep)
    const isToStep3OrLater = ['floating-pca', 'bed-relieving', 'review'].includes(currentStep)
    
    // Check if therapist allocations already have data (from Step 2's algo)
    const hasExistingTherapistData = TEAMS.some(team => therapistAllocations[team]?.length > 0)
    
    // Skip full sync if moving from Step 2+ to Step 3+ with existing data
    // Only recalculate, don't regenerate therapist allocations
    if (isFromStep2OrLater && isToStep3OrLater && hasExistingTherapistData) {
      console.log(`[AllocationSync] Step transition ${prevStep} -> ${currentStep}: Skipping regeneration, only recalculating`)
      recalculateScheduleCalculations()
    } else {
      console.log(`[AllocationSync] Step transition: ${prevStep} -> ${currentStep}`)
      syncAllocations()
    }

    // Update ref
    prevStepRef.current = currentStep
  }, [currentStep, staff.length, syncAllocations, therapistAllocations, recalculateScheduleCalculations, isHydrating])

  return {
    syncAllocations,
    syncTherapistAllocations,
    detectChanges: (prev: StaffOverrides) => detectChanges(staffOverrides, prev),
  }
}


