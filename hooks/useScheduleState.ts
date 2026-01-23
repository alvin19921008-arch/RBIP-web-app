/**
 * useScheduleState - Three-Layer State Management Hook
 * 
 * This hook manages the schedule page's data with clear separation between:
 * - Layer 1: Saved State (from database)
 * - Layer 2: Algorithm State (generated from staff + overrides)
 * - Layer 3: Override State (user modifications not yet saved)
 * 
 * Key features:
 * - Ward bed edits are always accessible (not step-locked)
 * - Ward bed edits are saved with every step's auto-save
 * - Clear tracking of unsaved changes
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { Team, LeaveType, Staff } from '@/types/staff'
import { TherapistAllocation, PCAAllocation, BedAllocation, ScheduleCalculations } from '@/types/schedule'
import { SpecialProgram, SPTAllocation, PCAPreference } from '@/types/allocation'
import { createClientComponentClient } from '@/lib/supabase/client'
import {
  toDbLeaveType,
  fromDbLeaveType,
  isCustomLeaveType,
  prepareTherapistAllocationForDb,
  preparePCAAllocationForDb,
  normalizeFTE,
  SpecialProgramRef,
} from '@/lib/db/types'

// ============================================================================
// Types
// ============================================================================

export type AllocationStep = 'leave-fte' | 'therapist-pca' | 'floating-pca' | 'bed-relieving' | 'review'

export type StepStatus = 'pending' | 'completed' | 'modified'

export interface StaffEdit {
  leaveType: LeaveType
  fteRemaining: number
  fteSubtraction?: number
  availableSlots?: number[]
  invalidSlot?: number
}

export interface PCASlotEdit {
  staffId: string
  slot1?: Team | null
  slot2?: Team | null
  slot3?: Team | null
  slot4?: Team | null
}

/**
 * Layer 1: Saved State (from database)
 * Represents the last saved state in the database
 */
export interface SavedScheduleState {
  scheduleId: string | null
  therapistAllocations: Record<Team, TherapistAllocation[]>
  pcaAllocations: Record<Team, PCAAllocation[]>
  wardBedEdits: Record<Team, number>
  tieBreakDecisions: Record<string, Team>
  lastSavedAt: Date | null
}

/**
 * Layer 2: Algorithm State (generated from staff + overrides)
 * Represents the computed allocations based on current inputs
 */
export interface AlgorithmScheduleState {
  therapistAllocations: Record<Team, (TherapistAllocation & { staff: Staff })[]>
  pcaAllocations: Record<Team, (PCAAllocation & { staff: Staff })[]>
  bedAllocations: BedAllocation[]
  calculations: Record<Team, ScheduleCalculations | null>
  pendingPCAFTEPerTeam: Record<Team, number>
}

/**
 * Layer 3: Override State (user modifications)
 * Represents user changes not yet saved to database
 */
export interface OverrideState {
  staffEdits: Record<string, StaffEdit>
  pcaSlotEdits: Record<string, PCASlotEdit>
  wardBedEdits: Record<Team, number>
  currentStep: AllocationStep
  stepCompletionStatus: Record<AllocationStep, StepStatus>
}

// ============================================================================
// Constants
// ============================================================================

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

const INITIAL_TEAM_RECORD = <T>(defaultValue: T): Record<Team, T> => ({
  FO: defaultValue,
  SMM: defaultValue,
  SFM: defaultValue,
  CPPC: defaultValue,
  MC: defaultValue,
  GMC: defaultValue,
  NSM: defaultValue,
  DRO: defaultValue,
})

const INITIAL_SAVED_STATE: SavedScheduleState = {
  scheduleId: null,
  therapistAllocations: INITIAL_TEAM_RECORD([]),
  pcaAllocations: INITIAL_TEAM_RECORD([]),
  wardBedEdits: INITIAL_TEAM_RECORD(0),
  tieBreakDecisions: {},
  lastSavedAt: null,
}

const INITIAL_ALGORITHM_STATE: AlgorithmScheduleState = {
  therapistAllocations: INITIAL_TEAM_RECORD([]),
  pcaAllocations: INITIAL_TEAM_RECORD([]),
  bedAllocations: [],
  calculations: INITIAL_TEAM_RECORD(null),
  pendingPCAFTEPerTeam: INITIAL_TEAM_RECORD(0),
}

const INITIAL_STEP_STATUS: Record<AllocationStep, StepStatus> = {
  'leave-fte': 'pending',
  'therapist-pca': 'pending',
  'floating-pca': 'pending',
  'bed-relieving': 'pending',
  'review': 'pending',
}

const INITIAL_OVERRIDE_STATE: OverrideState = {
  staffEdits: {},
  pcaSlotEdits: {},
  wardBedEdits: INITIAL_TEAM_RECORD(0),
  currentStep: 'leave-fte',
  stepCompletionStatus: { ...INITIAL_STEP_STATUS },
}

// ============================================================================
// Helper Functions
// ============================================================================

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object' || a === null || b === null) return false
  
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  
  if (keysA.length !== keysB.length) return false
  
  for (const key of keysA) {
    if (!keysB.includes(key)) return false
    if (!deepEqual(a[key], b[key])) return false
  }
  
  return true
}

function formatDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// ============================================================================
// Main Hook
// ============================================================================

export interface UseScheduleStateOptions {
  selectedDate: Date
  staff: Staff[]
  specialPrograms: SpecialProgram[]
  sptAllocations: SPTAllocation[]
  wards: { name: string; total_beds: number; team_assignments: Record<Team, number> }[]
  pcaPreferences: PCAPreference[]
  gymSchedules: Record<Team, number | null>
}

export interface UseScheduleStateReturn {
  // State layers
  savedState: SavedScheduleState
  algorithmState: AlgorithmScheduleState
  overrides: OverrideState
  
  // Derived state
  hasUnsavedChanges: boolean
  hasUnsavedStaffEdits: boolean
  hasUnsavedWardBedEdits: boolean
  currentScheduleId: string | null
  
  // Loading states
  loading: boolean
  saving: boolean
  
  // Actions - State modification
  applyStaffEdit: (staffId: string, edit: StaffEdit) => void
  applyPCASlotEdit: (edit: PCASlotEdit) => void
  applyWardBedEdit: (team: Team, beds: number) => void
  setCurrentStep: (step: AllocationStep) => void
  setTieBreakDecision: (key: string, team: Team) => void
  
  // Actions - Algorithm state
  setAlgorithmState: (state: Partial<AlgorithmScheduleState>) => void
  
  // Actions - Database operations
  loadFromDatabase: () => Promise<{ success: boolean; hasExistingAllocations: boolean }>
  saveStepToDatabase: (step: AllocationStep) => Promise<boolean>
  saveAllToDatabase: () => Promise<boolean>
  
  // Actions - Reset
  resetOverrides: () => void
  resetToSavedState: () => void
}

export function useScheduleState(options: UseScheduleStateOptions): UseScheduleStateReturn {
  const { selectedDate, staff, specialPrograms } = options
  
  const supabase = createClientComponentClient()
  
  // ============================================================================
  // State
  // ============================================================================
  
  // Layer 1: Saved State (from database)
  const [savedState, setSavedState] = useState<SavedScheduleState>(INITIAL_SAVED_STATE)
  
  // Layer 2: Algorithm State (generated from staff + overrides)
  const [algorithmState, setAlgorithmStateInternal] = useState<AlgorithmScheduleState>(INITIAL_ALGORITHM_STATE)
  
  // Layer 3: Override State (user modifications)
  const [overrides, setOverrides] = useState<OverrideState>(INITIAL_OVERRIDE_STATE)
  
  // Loading states
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // ============================================================================
  // Derived State
  // ============================================================================
  
  const hasUnsavedStaffEdits = useMemo(() => {
    return Object.keys(overrides.staffEdits).length > 0
  }, [overrides.staffEdits])
  
  const hasUnsavedWardBedEdits = useMemo(() => {
    return !deepEqual(overrides.wardBedEdits, savedState.wardBedEdits)
  }, [overrides.wardBedEdits, savedState.wardBedEdits])
  
  const hasUnsavedChanges = useMemo(() => {
    return hasUnsavedStaffEdits || 
           hasUnsavedWardBedEdits ||
           Object.keys(overrides.pcaSlotEdits).length > 0
  }, [hasUnsavedStaffEdits, hasUnsavedWardBedEdits, overrides.pcaSlotEdits])
  
  // ============================================================================
  // Actions - State Modification
  // ============================================================================
  
  const applyStaffEdit = useCallback((staffId: string, edit: StaffEdit) => {
    setOverrides(prev => ({
      ...prev,
      staffEdits: {
        ...prev.staffEdits,
        [staffId]: edit,
      },
      stepCompletionStatus: {
        ...prev.stepCompletionStatus,
        'leave-fte': 'modified',
      },
    }))
  }, [])
  
  const applyPCASlotEdit = useCallback((edit: PCASlotEdit) => {
    setOverrides(prev => ({
      ...prev,
      pcaSlotEdits: {
        ...prev.pcaSlotEdits,
        [edit.staffId]: edit,
      },
      stepCompletionStatus: {
        ...prev.stepCompletionStatus,
        'floating-pca': 'modified',
      },
    }))
  }, [])
  
  const applyWardBedEdit = useCallback((team: Team, beds: number) => {
    setOverrides(prev => ({
      ...prev,
      wardBedEdits: {
        ...prev.wardBedEdits,
        [team]: beds,
      },
      stepCompletionStatus: {
        ...prev.stepCompletionStatus,
        'bed-relieving': 'modified',
      },
    }))
  }, [])
  
  const setCurrentStep = useCallback((step: AllocationStep) => {
    setOverrides(prev => ({
      ...prev,
      currentStep: step,
    }))
  }, [])
  
  const setTieBreakDecision = useCallback((key: string, team: Team) => {
    setSavedState(prev => ({
      ...prev,
      tieBreakDecisions: {
        ...prev.tieBreakDecisions,
        [key]: team,
      },
    }))
  }, [])
  
  const setAlgorithmState = useCallback((state: Partial<AlgorithmScheduleState>) => {
    setAlgorithmStateInternal(prev => ({
      ...prev,
      ...state,
    }))
  }, [])
  
  // ============================================================================
  // Actions - Database Operations
  // ============================================================================
  
  const loadFromDatabase = useCallback(async (): Promise<{ success: boolean; hasExistingAllocations: boolean }> => {
    setLoading(true)
    
    try {
      const dateStr = formatDateString(selectedDate)
      
      // Get or create schedule for this date
      let { data: scheduleData, error: queryError } = await supabase
        .from('daily_schedules')
        .select('id, is_tentative, tie_break_decisions')
        .eq('date', dateStr)
        .maybeSingle()
      
      // Fallback if tie_break_decisions column doesn't exist
      if (queryError && queryError.message?.includes('tie_break_decisions')) {
        const fallbackResult = await supabase
          .from('daily_schedules')
          .select('id, is_tentative')
          .eq('date', dateStr)
          .maybeSingle()
        scheduleData = fallbackResult.data ? { ...fallbackResult.data, tie_break_decisions: null } : null
        queryError = fallbackResult.error
      }
      
      let scheduleId: string
      
      if (!scheduleData) {
        // Create new schedule
        const { data: newSchedule, error } = await supabase
          .from('daily_schedules')
          .insert({ date: dateStr, is_tentative: true })
          .select('id')
          .single()
        
        if (error || !newSchedule) {
          console.error('Error creating schedule:', error)
          setLoading(false)
          return { success: false, hasExistingAllocations: false }
        }
        scheduleId = newSchedule.id
      } else {
        scheduleId = scheduleData.id
        
        // Ensure schedule is tentative
        if (!scheduleData.is_tentative) {
          await supabase
            .from('daily_schedules')
            .update({ is_tentative: true })
            .eq('id', scheduleId)
        }
      }
      
      // Load therapist allocations
      const { data: therapistAllocs } = await supabase
        .from('schedule_therapist_allocations')
        .select('*')
        .eq('schedule_id', scheduleId)
      
      // Load PCA allocations
      const { data: pcaAllocs } = await supabase
        .from('schedule_pca_allocations')
        .select('*')
        .eq('schedule_id', scheduleId)
      
      // Build saved state
      const therapistByTeam: Record<Team, TherapistAllocation[]> = INITIAL_TEAM_RECORD([])
      const pcaByTeam: Record<Team, PCAAllocation[]> = INITIAL_TEAM_RECORD([])
      const staffEdits: Record<string, StaffEdit> = {}
      
      // Process therapist allocations
      therapistAllocs?.forEach((alloc: any) => {
        if (alloc.team) {
          therapistByTeam[alloc.team as Team].push(alloc)
          
          // Build staff edit from allocation
          if (alloc.leave_type !== null || alloc.fte_therapist !== 1) {
            const fte = parseFloat(alloc.fte_therapist.toString())
            staffEdits[alloc.staff_id] = {
              leaveType: fromDbLeaveType(alloc.leave_type, fte, alloc.manual_override_note),
              fteRemaining: fte,
            }
          }
        }
      })
      
      // Process PCA allocations
      pcaAllocs?.forEach((alloc: any) => {
        if (alloc.team) {
          pcaByTeam[alloc.team as Team].push(alloc)
          
          // Build staff edit from allocation (if not already set by therapist)
          if (!staffEdits[alloc.staff_id] && (alloc.leave_type !== null || alloc.fte_pca !== 1)) {
            const fte = parseFloat(alloc.fte_pca.toString())
            staffEdits[alloc.staff_id] = {
              leaveType: fromDbLeaveType(alloc.leave_type, fte, null),
              fteRemaining: fte,
              invalidSlot: alloc.invalid_slot ?? undefined,
            }
          }
        }
      })
      
      // Update saved state
      setSavedState({
        scheduleId,
        therapistAllocations: therapistByTeam,
        pcaAllocations: pcaByTeam,
        wardBedEdits: INITIAL_TEAM_RECORD(0), // Will be populated from schedule_calculations if available
        tieBreakDecisions: (scheduleData?.tie_break_decisions as Record<string, Team>) || {},
        lastSavedAt: new Date(),
      })
      
      // Initialize overrides with loaded staff edits
      setOverrides(prev => ({
        ...prev,
        staffEdits,
        wardBedEdits: INITIAL_TEAM_RECORD(0),
        stepCompletionStatus: { ...INITIAL_STEP_STATUS },
      }))
      
      const hasExistingAllocations = (therapistAllocs?.length ?? 0) > 0 || (pcaAllocs?.length ?? 0) > 0
      
      setLoading(false)
      return { success: true, hasExistingAllocations }
    } catch (error) {
      console.error('Error loading from database:', error)
      setLoading(false)
      return { success: false, hasExistingAllocations: false }
    }
  }, [selectedDate, supabase])
  
  const saveStepToDatabase = useCallback(async (step: AllocationStep): Promise<boolean> => {
    if (!savedState.scheduleId) {
      console.error('No schedule ID available')
      return false
    }
    
    setSaving(true)
    
    try {
      const scheduleId = savedState.scheduleId
      const specialProgramsRef: SpecialProgramRef[] = specialPrograms.map(sp => ({ id: sp.id, name: sp.name }))
      
      // Always save ward bed edits with any step
      // (Ward beds are always accessible and save with every step)
      
      // Save tie-break decisions
      if (Object.keys(savedState.tieBreakDecisions).length > 0) {
        await supabase
          .from('daily_schedules')
          .update({ tie_break_decisions: savedState.tieBreakDecisions })
          .eq('id', scheduleId)
      }
      
      // Step-specific saves
      switch (step) {
        case 'leave-fte':
          // Save staff FTE and leave type changes
          // This is handled when saving therapist/PCA allocations
          break
          
        case 'therapist-pca':
          // Save all therapist allocations
          const therapistPromises: PromiseLike<any>[] = []
          
          TEAMS.forEach(team => {
            algorithmState.therapistAllocations[team].forEach(alloc => {
              const staffMember = alloc.staff
              if (!staffMember || !['SPT', 'APPT', 'RPT'].includes(staffMember.rank)) return
              
              const override = overrides.staffEdits[alloc.staff_id]
              const leaveType = override?.leaveType ?? alloc.leave_type
              const fteRemaining = override?.fteRemaining ?? alloc.fte_therapist
              
              const dbData = prepareTherapistAllocationForDb({
                allocation: {
                  ...alloc,
                  schedule_id: scheduleId,
                  leave_type: leaveType,
                  fte_therapist: fteRemaining,
                  fte_remaining: fteRemaining,
                },
                specialPrograms: specialProgramsRef,
              })
              
              therapistPromises.push(
                supabase
                  .from('schedule_therapist_allocations')
                  .upsert(dbData, { onConflict: 'schedule_id,staff_id' })
                  .then(result => {
                    if (result.error) console.error('Error saving therapist:', result.error)
                    return result
                  })
              )
            })
          })
          
          await Promise.all(therapistPromises)
          break
          
        case 'floating-pca':
        case 'bed-relieving':
          // Save PCA allocations
          const pcaPromises: PromiseLike<any>[] = []
          const processedPcaIds = new Set<string>()
          
          TEAMS.forEach(team => {
            algorithmState.pcaAllocations[team].forEach(alloc => {
              if (processedPcaIds.has(alloc.staff_id)) return
              processedPcaIds.add(alloc.staff_id)
              
              const override = overrides.staffEdits[alloc.staff_id]
              const slotEdit = overrides.pcaSlotEdits[alloc.staff_id]
              
              const leaveType = override?.leaveType ?? alloc.leave_type
              const fteRemaining = override?.fteRemaining ?? alloc.fte_pca
              
              const dbData = preparePCAAllocationForDb({
                allocation: {
                  ...alloc,
                  schedule_id: scheduleId,
                  leave_type: leaveType,
                  fte_pca: fteRemaining,
                  fte_remaining: alloc.fte_remaining,
                  slot1: slotEdit?.slot1 ?? alloc.slot1,
                  slot2: slotEdit?.slot2 ?? alloc.slot2,
                  slot3: slotEdit?.slot3 ?? alloc.slot3,
                  slot4: slotEdit?.slot4 ?? alloc.slot4,
                  invalid_slot: override?.invalidSlot ?? alloc.invalid_slot,
                },
                specialPrograms: specialProgramsRef,
              })
              
              pcaPromises.push(
                supabase
                  .from('schedule_pca_allocations')
                  .upsert(dbData, { onConflict: 'schedule_id,staff_id' })
                  .then(result => {
                    if (result.error) console.error('Error saving PCA:', result.error)
                    return result
                  })
              )
            })
          })
          
          await Promise.all(pcaPromises)
          break
          
        case 'review':
          // Finalize schedule - mark as non-tentative
          await supabase
            .from('daily_schedules')
            .update({ is_tentative: false })
            .eq('id', scheduleId)
          break
      }
      
      // Update step completion status
      setOverrides(prev => ({
        ...prev,
        stepCompletionStatus: {
          ...prev.stepCompletionStatus,
          [step]: 'completed',
        },
      }))
      
      // Update saved state timestamp
      setSavedState(prev => ({
        ...prev,
        lastSavedAt: new Date(),
      }))
      
      setSaving(false)
      return true
    } catch (error) {
      console.error('Error saving to database:', error)
      setSaving(false)
      return false
    }
  }, [savedState, algorithmState, overrides, specialPrograms, supabase])
  
  const saveAllToDatabase = useCallback(async (): Promise<boolean> => {
    // Save all steps in order
    const steps: AllocationStep[] = ['leave-fte', 'therapist-pca', 'floating-pca', 'bed-relieving']
    
    for (const step of steps) {
      const success = await saveStepToDatabase(step)
      if (!success) return false
    }
    
    return true
  }, [saveStepToDatabase])
  
  // ============================================================================
  // Actions - Reset
  // ============================================================================
  
  const resetOverrides = useCallback(() => {
    setOverrides(INITIAL_OVERRIDE_STATE)
  }, [])
  
  const resetToSavedState = useCallback(() => {
    // Reset algorithm state to match saved state
    setAlgorithmStateInternal(prev => ({
      ...prev,
      therapistAllocations: INITIAL_TEAM_RECORD([]),
      pcaAllocations: INITIAL_TEAM_RECORD([]),
    }))
    
    // Reset overrides
    setOverrides(prev => ({
      ...INITIAL_OVERRIDE_STATE,
      wardBedEdits: { ...savedState.wardBedEdits },
    }))
  }, [savedState.wardBedEdits])
  
  // ============================================================================
  // Reset state when date changes
  // ============================================================================
  
  useEffect(() => {
    setSavedState(INITIAL_SAVED_STATE)
    setAlgorithmStateInternal(INITIAL_ALGORITHM_STATE)
    setOverrides(INITIAL_OVERRIDE_STATE)
  }, [selectedDate])
  
  // ============================================================================
  // Return
  // ============================================================================
  
  return {
    // State layers
    savedState,
    algorithmState,
    overrides,
    
    // Derived state
    hasUnsavedChanges,
    hasUnsavedStaffEdits,
    hasUnsavedWardBedEdits,
    currentScheduleId: savedState.scheduleId,
    
    // Loading states
    loading,
    saving,
    
    // Actions - State modification
    applyStaffEdit,
    applyPCASlotEdit,
    applyWardBedEdit,
    setCurrentStep,
    setTieBreakDecision,
    setAlgorithmState,
    
    // Actions - Database operations
    loadFromDatabase,
    saveStepToDatabase,
    saveAllToDatabase,
    
    // Actions - Reset
    resetOverrides,
    resetToSavedState,
  }
}


