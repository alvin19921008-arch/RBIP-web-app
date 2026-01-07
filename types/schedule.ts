import { Team, LeaveType, SpecialProgram } from './staff'

export interface DailySchedule {
  id: string
  date: string
  is_tentative: boolean
  created_at: string
  updated_at: string
}

export interface TherapistAllocation {
  id: string
  schedule_id: string
  staff_id: string
  team: Team
  fte_therapist: number
  fte_remaining: number
  slot_whole: number | null
  slot1: Team | null
  slot2: Team | null
  slot3: Team | null
  slot4: Team | null
  leave_type: LeaveType
  special_program_ids: string[] | null
  is_substitute_team_head: boolean
  spt_slot_display: 'AM' | 'PM' | null
  is_manual_override: boolean
  manual_override_note: string | null
}

export interface PCAAllocation {
  id: string
  schedule_id: string
  staff_id: string
  team: Team
  fte_pca: number
  fte_remaining: number
  slot_assigned: number // RENAMED from fte_assigned: tracks which slots are assigned (0.25 per slot), not FTE
  slot_whole: number | null
  slot1: Team | null
  slot2: Team | null
  slot3: Team | null
  slot4: Team | null
  leave_type: LeaveType
  special_program_ids: string[] | null
  invalid_slot?: number // Slot (1-4) that is leave/come back, assigned but not counted
  leave_comeback_time?: string // Time in HH:MM format
  leave_mode?: string // 'leave' or 'come_back'
  fte_subtraction?: number // FTE subtraction from leave (excluding special program subtraction). Used to calculate base_FTE_remaining = 1.0 - fte_subtraction. NOT stored in database - calculated from staffOverrides when needed
}

export interface BedAllocation {
  id: string
  schedule_id: string
  from_team: Team
  to_team: Team
  ward: string
  num_beds: number
  slot: number | null
}

export interface ScheduleCalculations {
  id: string
  schedule_id: string
  team: Team
  designated_wards: string[]
  total_beds_designated: number
  total_beds: number
  total_pt_on_duty: number
  beds_per_pt: number
  pt_per_team: number
  beds_for_relieving: number
  pca_on_duty: number
  total_pt_per_pca: number
  total_pt_per_team: number
  average_pca_per_team: number
  base_average_pca_per_team?: number // Base avg PCA/team for DRO (without DRM +0.4 add-on)
  expected_beds_per_team?: number // (3) Expected beds for team = (total beds / total PT) * (PT per team)
  required_pca_per_team?: number // (4) Required PCA per team = (3) / (total beds / total PCA)
}

// ============================================================================
// Allocation Tracking System (Step 3.4)
// ============================================================================

/**
 * Tracks how a specific slot was assigned to a team.
 * Used for tooltip display and debugging.
 */
export interface SlotAssignmentLog {
  slot: number                    // 1, 2, 3, or 4
  pcaId: string                   // Which PCA was assigned
  pcaName: string                 // PCA name for display
  assignedIn: 'step30' | 'step32' | 'step33' | 'step34'  // Which step made this assignment
  
  // Step 3.4 specific tracking
  cycle?: 1 | 2 | 3              // Which cycle (only for step34)
  condition?: 'A' | 'B' | 'C' | 'D'  // Which condition (only for step34 cycle 1)
  allocationOrder?: number        // Order in which this team was allocated (1st, 2nd, etc.)
  assignmentTag?: 'remaining'     // Short tag for display (e.g. 'remaining' slots from same PCA)
  
  // Decision factors
  wasPreferredSlot?: boolean      // Was this the team's preferred slot?
  wasPreferredPCA?: boolean       // Was this the team's preferred PCA?
  wasFloorPCA?: boolean           // Was this a floor-matched PCA?
  wasExcludedInCycle1?: boolean   // Did this PCA become available only in Cycle 2?
  isBufferAssignment?: boolean    // Was this assigned from buffer floating PCA (step 3.0)?
  
  // Constraint handling
  amPmBalanceAchieved?: boolean   // Was AM/PM balance achieved?
  gymSlotAvoided?: boolean        // Was gym slot avoided (if applicable)?
  overlapSlot?: boolean           // Was this slot already assigned to another PCA?
}

/**
 * Aggregated tracking info per team for tooltip display.
 */
export interface TeamAllocationLog {
  team: Team
  assignments: SlotAssignmentLog[]
  summary: {
    totalSlotsAssigned: number
    fromStep30: number              // Buffer floating PCA manual assignments
    fromStep32: number
    fromStep33: number
    fromStep34Cycle1: number
    fromStep34Cycle2: number
    fromStep34Cycle3: number
    preferredSlotFilled: boolean
    preferredPCAsUsed: number
    floorPCAsUsed: number
    nonFloorPCAsUsed: number
    amPmBalanced: boolean
    gymSlotUsed: boolean  // true if gym slot was assigned despite avoidance
    fulfilledByBuffer?: boolean     // true if team's pending was wholly fulfilled by buffer assignments
  }
}

/**
 * Allocation tracker for all teams
 */
export type AllocationTracker = Record<Team, TeamAllocationLog>

// ============================================================================
// Per-schedule snapshot & workflow state
// ============================================================================

export type ScheduleStepId =
  | 'leave-fte'
  | 'therapist-pca'
  | 'floating-pca'
  | 'bed-relieving'
  | 'review'

export interface WorkflowState {
  currentStep?: ScheduleStepId
  completedSteps?: ScheduleStepId[]
}

/**
 * Baseline snapshot of dashboard-derived data for a given schedule date.
 * Stored in daily_schedules.baseline_snapshot as JSONB.
 */
export interface BaselineSnapshot {
  staff: import('./staff').Staff[]
  specialPrograms: import('./allocation').SpecialProgram[]
  sptAllocations: import('./allocation').SPTAllocation[]
  wards: import('./allocation').Ward[]
  pcaPreferences: import('./allocation').PCAPreference[]
  // Optional map of custom team display names (from team_settings)
  teamDisplayNames?: Partial<Record<Team, string>>
}

export type BaselineSnapshotSource = 'save' | 'copy' | 'migration'

/**
 * Versioned envelope for baseline snapshots stored in daily_schedules.baseline_snapshot.
 * We keep BaselineSnapshot as the *data payload* shape for easy consumption by UI/algorithms.
 */
export interface BaselineSnapshotEnvelopeV1 {
  schemaVersion: 1
  createdAt: string // ISO timestamp
  source: BaselineSnapshotSource
  data: BaselineSnapshot
}

export type BaselineSnapshotEnvelope = BaselineSnapshotEnvelopeV1

/**
 * Backward-compatible type for what may come back from DB:
 * - New: BaselineSnapshotEnvelope (v1)
 * - Legacy: raw BaselineSnapshot object
 */
export type BaselineSnapshotStored = BaselineSnapshotEnvelope | BaselineSnapshot

export type SnapshotHealthStatus = 'ok' | 'repaired' | 'fallback'

export interface SnapshotHealthReport {
  status: SnapshotHealthStatus
  issues: string[]
  referencedStaffCount: number
  snapshotStaffCount: number
  missingReferencedStaffCount: number
  schemaVersion?: number
  source?: BaselineSnapshotSource
  createdAt?: string
}