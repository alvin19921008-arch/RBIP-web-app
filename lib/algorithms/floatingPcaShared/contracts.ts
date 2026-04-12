import type { Team } from '@/types/staff'
import type { AllocationTracker, PCAAllocation } from '@/types/schedule'
import type { PCAPreference, SpecialProgram } from '@/types/allocation'
import type { PCAData } from '@/lib/algorithms/pcaAllocationTypes'

export type FloatingPCAAllocationMode = 'standard' | 'balanced'

export interface FloatingPCAAllocationContextV2 {
  teamOrder: Team[]
  currentPendingFTE: Record<Team, number>
  existingAllocations: PCAAllocation[]
  pcaPool: PCAData[]
  pcaPreferences: PCAPreference[]
  specialPrograms: SpecialProgram[]
  mode?: FloatingPCAAllocationMode
  extraCoverageMode?: 'none' | 'round-robin-team-order'
  preferenceSelectionMode?: 'legacy' | 'selected_only'
  preferenceProtectionMode?: 'exclusive' | 'share'
  selectedPreferenceAssignments?: Array<{
    team: Team
    slot: number
    pcaId: string
    source?: 'step32' | 'step33'
  }>
  committedStep3Assignments?: Array<{
    team: Team
    slot: number
    pcaId: string
    source?: 'step32' | 'step33'
  }>
}

export interface FloatingPCAAllocationResultV2 {
  allocations: PCAAllocation[]
  pendingPCAFTEPerTeam: Record<Team, number>
  tracker: AllocationTracker
  extraCoverageByStaffId?: Record<string, Array<1 | 2 | 3 | 4>>
  errors?: {
    preferredSlotUnassigned?: string[]
  }
}
