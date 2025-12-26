/**
 * useStepwiseAllocation - Step Navigation and Auto-Save Hook
 * 
 * This hook manages the step-wise workflow for schedule allocation:
 * - Step 1: Leave/FTE Input
 * - Step 2: SPT + Special Programs + Non-floating PCA
 * - Step 3: Floating PCA Distribution
 * - Step 4: Bed Relieving (with always-editable ward bed counts)
 * - Step 5: Review and Finalize
 * 
 * Key features:
 * - Auto-save when navigating between steps
 * - Ward bed edits are always accessible (not step-locked)
 * - Validation before step progression
 */

import { useCallback, useMemo } from 'react'
import { AllocationStep, UseScheduleStateReturn, StepStatus } from './useScheduleState'

// ============================================================================
// Types
// ============================================================================

export interface StepInfo {
  id: AllocationStep
  number: number
  title: string
  description: string
  canEdit: (currentStep: AllocationStep) => boolean
  requiredForNext: boolean
}

export interface UseStepwiseAllocationOptions {
  scheduleState: UseScheduleStateReturn
  onStepChange?: (from: AllocationStep, to: AllocationStep) => void
  onAutoSave?: (step: AllocationStep, success: boolean) => void
  onValidationError?: (step: AllocationStep, message: string) => void
}

export interface UseStepwiseAllocationReturn {
  // Current state
  currentStep: AllocationStep
  currentStepNumber: number
  currentStepInfo: StepInfo
  
  // Step information
  steps: StepInfo[]
  stepStatus: Record<AllocationStep, StepStatus>
  
  // Navigation
  canGoToStep: (step: AllocationStep) => boolean
  canGoNext: boolean
  canGoPrevious: boolean
  goToStep: (step: AllocationStep) => Promise<boolean>
  goNext: () => Promise<boolean>
  goPrevious: () => Promise<boolean>
  
  // Validation
  validateCurrentStep: () => { valid: boolean; errors: string[] }
  isStepComplete: (step: AllocationStep) => boolean
  
  // Progress
  completedStepsCount: number
  totalStepsCount: number
  progressPercentage: number
}

// ============================================================================
// Step Definitions
// ============================================================================

const STEP_ORDER: AllocationStep[] = [
  'leave-fte',
  'therapist-pca',
  'floating-pca',
  'bed-relieving',
  'review',
]

const STEP_DEFINITIONS: StepInfo[] = [
  {
    id: 'leave-fte',
    number: 1,
    title: 'Leave & FTE Input',
    description: 'Set staff leave types and FTE remaining for the day',
    canEdit: () => true, // Always editable
    requiredForNext: true,
  },
  {
    id: 'therapist-pca',
    number: 2,
    title: 'Therapist & Non-floating PCA',
    description: 'Generate SPT, APPT, RPT allocations and non-floating PCA assignments',
    canEdit: (current) => getStepNumber(current) >= 2,
    requiredForNext: true,
  },
  {
    id: 'floating-pca',
    number: 3,
    title: 'Floating PCA Distribution',
    description: 'Distribute floating PCAs to teams based on FTE needs',
    canEdit: (current) => getStepNumber(current) >= 3,
    requiredForNext: true,
  },
  {
    id: 'bed-relieving',
    number: 4,
    title: 'Bed Relieving',
    description: 'Calculate bed distribution for relieving (ward beds always editable)',
    canEdit: (current) => getStepNumber(current) >= 4,
    requiredForNext: false, // Derived calculation
  },
  {
    id: 'review',
    number: 5,
    title: 'Review & Finalize',
    description: 'Review all allocations and finalize the schedule',
    canEdit: (current) => getStepNumber(current) >= 5,
    requiredForNext: false,
  },
]

// ============================================================================
// Helper Functions
// ============================================================================

function getStepNumber(step: AllocationStep): number {
  return STEP_ORDER.indexOf(step) + 1
}

function getStepById(id: AllocationStep): StepInfo | undefined {
  return STEP_DEFINITIONS.find(s => s.id === id)
}

function getNextStep(current: AllocationStep): AllocationStep | null {
  const currentIndex = STEP_ORDER.indexOf(current)
  if (currentIndex < STEP_ORDER.length - 1) {
    return STEP_ORDER[currentIndex + 1]
  }
  return null
}

function getPreviousStep(current: AllocationStep): AllocationStep | null {
  const currentIndex = STEP_ORDER.indexOf(current)
  if (currentIndex > 0) {
    return STEP_ORDER[currentIndex - 1]
  }
  return null
}

// ============================================================================
// Main Hook
// ============================================================================

export function useStepwiseAllocation(options: UseStepwiseAllocationOptions): UseStepwiseAllocationReturn {
  const { scheduleState, onStepChange, onAutoSave, onValidationError } = options
  
  // ============================================================================
  // Current Step Info
  // ============================================================================
  
  const currentStep = scheduleState.overrides.currentStep
  const currentStepNumber = getStepNumber(currentStep)
  const currentStepInfo = useMemo(() => getStepById(currentStep)!, [currentStep])
  
  // ============================================================================
  // Step Status
  // ============================================================================
  
  const stepStatus = scheduleState.overrides.stepCompletionStatus
  
  const isStepComplete = useCallback((step: AllocationStep): boolean => {
    return stepStatus[step] === 'completed'
  }, [stepStatus])
  
  // ============================================================================
  // Validation
  // ============================================================================
  
  const validateCurrentStep = useCallback((): { valid: boolean; errors: string[] } => {
    const errors: string[] = []
    
    switch (currentStep) {
      case 'leave-fte':
        // Validate that all staff edits have valid FTE values
        Object.entries(scheduleState.overrides.staffEdits).forEach(([staffId, edit]) => {
          if (edit.fteRemaining < 0 || edit.fteRemaining > 1) {
            errors.push(`Staff ${staffId} has invalid FTE: ${edit.fteRemaining}`)
          }
        })
        break
        
      case 'therapist-pca':
        // Validate that therapist allocations are generated
        const hasTherapists = Object.values(scheduleState.algorithmState.therapistAllocations)
          .some(team => team.length > 0)
        if (!hasTherapists) {
          errors.push('Therapist allocations have not been generated')
        }
        break
        
      case 'floating-pca':
        // Validate that PCA allocations are generated
        const hasPCAs = Object.values(scheduleState.algorithmState.pcaAllocations)
          .some(team => team.length > 0)
        if (!hasPCAs) {
          errors.push('PCA allocations have not been generated')
        }
        break
        
      case 'bed-relieving':
        // Bed relieving is derived, no specific validation
        break
        
      case 'review':
        // Final validation before finalization
        const hasData = Object.values(scheduleState.algorithmState.therapistAllocations)
          .some(team => team.length > 0)
        if (!hasData) {
          errors.push('Schedule has no allocations to finalize')
        }
        break
    }
    
    return {
      valid: errors.length === 0,
      errors,
    }
  }, [currentStep, scheduleState.overrides.staffEdits, scheduleState.algorithmState])
  
  // ============================================================================
  // Navigation Checks
  // ============================================================================
  
  const canGoToStep = useCallback((step: AllocationStep): boolean => {
    const targetNumber = getStepNumber(step)
    const currentNumber = getStepNumber(currentStep)
    
    // Can always go to previous steps
    if (targetNumber < currentNumber) return true
    
    // Can go to next step if current step is complete or doesn't require completion
    if (targetNumber === currentNumber + 1) {
      const currentInfo = getStepById(currentStep)
      if (!currentInfo?.requiredForNext) return true
      return isStepComplete(currentStep) || stepStatus[currentStep] === 'modified'
    }
    
    // Can skip ahead only if all intermediate steps are complete
    if (targetNumber > currentNumber + 1) {
      for (let i = currentNumber; i < targetNumber; i++) {
        const stepId = STEP_ORDER[i - 1]
        const stepInfo = getStepById(stepId)
        if (stepInfo?.requiredForNext && !isStepComplete(stepId)) {
          return false
        }
      }
      return true
    }
    
    return true
  }, [currentStep, stepStatus, isStepComplete])
  
  const canGoNext = useMemo(() => {
    const nextStep = getNextStep(currentStep)
    return nextStep !== null && canGoToStep(nextStep)
  }, [currentStep, canGoToStep])
  
  const canGoPrevious = useMemo(() => {
    const prevStep = getPreviousStep(currentStep)
    return prevStep !== null
  }, [currentStep])
  
  // ============================================================================
  // Navigation Actions
  // ============================================================================
  
  const goToStep = useCallback(async (step: AllocationStep): Promise<boolean> => {
    if (!canGoToStep(step)) {
      onValidationError?.(currentStep, `Cannot navigate to step ${getStepNumber(step)} from current step`)
      return false
    }
    
    // Validate current step before leaving
    const validation = validateCurrentStep()
    if (!validation.valid && getStepNumber(step) > currentStepNumber) {
      onValidationError?.(currentStep, validation.errors.join(', '))
      return false
    }
    
    // Auto-save current step before navigating (includes ward bed edits)
    if (scheduleState.hasUnsavedChanges) {
      const saveSuccess = await scheduleState.saveStepToDatabase(currentStep)
      onAutoSave?.(currentStep, saveSuccess)
      
      if (!saveSuccess) {
        return false
      }
    }
    
    // Navigate to new step
    onStepChange?.(currentStep, step)
    scheduleState.setCurrentStep(step)
    
    return true
  }, [
    canGoToStep, 
    validateCurrentStep, 
    currentStep, 
    currentStepNumber, 
    scheduleState, 
    onStepChange, 
    onAutoSave, 
    onValidationError
  ])
  
  const goNext = useCallback(async (): Promise<boolean> => {
    const nextStep = getNextStep(currentStep)
    if (!nextStep) return false
    return goToStep(nextStep)
  }, [currentStep, goToStep])
  
  const goPrevious = useCallback(async (): Promise<boolean> => {
    const prevStep = getPreviousStep(currentStep)
    if (!prevStep) return false
    return goToStep(prevStep)
  }, [currentStep, goToStep])
  
  // ============================================================================
  // Progress Tracking
  // ============================================================================
  
  const completedStepsCount = useMemo(() => {
    return STEP_ORDER.filter(step => isStepComplete(step)).length
  }, [isStepComplete])
  
  const totalStepsCount = STEP_ORDER.length
  
  const progressPercentage = useMemo(() => {
    return Math.round((completedStepsCount / totalStepsCount) * 100)
  }, [completedStepsCount, totalStepsCount])
  
  // ============================================================================
  // Return
  // ============================================================================
  
  return {
    // Current state
    currentStep,
    currentStepNumber,
    currentStepInfo,
    
    // Step information
    steps: STEP_DEFINITIONS,
    stepStatus,
    
    // Navigation
    canGoToStep,
    canGoNext,
    canGoPrevious,
    goToStep,
    goNext,
    goPrevious,
    
    // Validation
    validateCurrentStep,
    isStepComplete,
    
    // Progress
    completedStepsCount,
    totalStepsCount,
    progressPercentage,
  }
}

// ============================================================================
// Export step utilities for external use
// ============================================================================

export { STEP_ORDER, STEP_DEFINITIONS, getStepNumber, getStepById }


