import type { Team, Weekday } from '@/types/staff'
import type { BedAllocation } from '@/types/schedule'

export const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri']
export const WEEKDAY_NAMES: string[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

export const EMPTY_BED_ALLOCATIONS: BedAllocation[] = []

// Step definitions for step-wise allocation workflow
export type AllocationStepId = 'leave-fte' | 'therapist-pca' | 'floating-pca' | 'bed-relieving' | 'review'

export type AllocationStep = {
  id: AllocationStepId
  number: number
  title: string
  description: string
}

export const ALLOCATION_STEPS: AllocationStep[] = [
  { id: 'leave-fte', number: 1, title: 'Leave & FTE', description: 'Set staff leave types and FTE remaining' },
  { id: 'therapist-pca', number: 2, title: 'Therapist & PCA', description: 'Generate therapist and non-floating PCA allocations' },
  { id: 'floating-pca', number: 3, title: 'Floating PCA', description: 'Distribute floating PCAs to teams' },
  { id: 'bed-relieving', number: 4, title: 'Bed Relieving', description: 'Calculate bed distribution' },
  { id: 'review', number: 5, title: 'Review', description: 'Review and finalize schedule' },
]

// Default date: 1/12/2025 (Monday)
export const DEFAULT_DATE = new Date(2025, 11, 1) // Month is 0-indexed, so 11 = December

