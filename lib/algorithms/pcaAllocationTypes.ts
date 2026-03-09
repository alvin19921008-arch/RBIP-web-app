/**
 * Shared types for the PCA allocation pipeline.
 * Extracted to avoid circular imports between pcaAllocation and pcaAllocationFloating.
 */

import type { Team } from '@/types/staff'

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
}
