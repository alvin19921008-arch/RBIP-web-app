import type { LeaveType, StaffRank } from '@/types/staff'
import type { Team } from '@/types/staff'

export type DevLeaveSimSpecialProgramTargeting =
  | 'only_special_program'
  | 'exclude_special_program'
  | 'weighted_random'
  | 'pure_random'

export type DevLeaveSimRankWeightMode = 'pool_proportional' | 'custom'

export type DevLeaveSimPcaHalfDaySlotMode = 'am' | 'pm' | 'random'

export type DevLeaveSimPcaNonFloatingTargeting = 'random' | 'prefer_non_floating' | 'only_non_floating'

export type DevLeaveSimLeaveBucket = 'planned' | 'sick' | 'urgent'

export type DevLeaveSimRank = Exclude<StaffRank, 'workman'>

export type DevLeaveSimRankWeights = Record<DevLeaveSimRank, number>

export type DevLeaveSimInvalidSlotRange = { start: string; end: string } // HHMM

export type DevLeaveSimStaffPatch = {
  staffId: string
  rank: DevLeaveSimRank
  bucket: DevLeaveSimLeaveBucket

  leaveType: LeaveType | null
  /**
   * IMPORTANT:
   * - May be non-multiple of 0.25 (esp. therapist leave and PCA medical follow-up).
   * - For PCA slot assignment capacity, algorithms still operate on quarter-slot availability via `availableSlots`.
   */
  fteRemaining: number
  fteSubtraction?: number

  /**
   * PCA/workman only. For PCA, Step 2+ treats `availableSlots` as the definitive assignable capacity.
   */
  availableSlots?: number[]

  /**
   * New UI system: invalid slot(s) with time ranges (HHMM). v1: at most one invalid slot per PCA.
   * This is persisted in schedule.staff_overrides and used by UI for display/editing.
   */
  invalidSlots?: Array<{ slot: 1 | 2 | 3 | 4; timeRange: DevLeaveSimInvalidSlotRange }>

  /**
   * Legacy single-slot marker used by the PCA algorithm.
   * The harness prefers `invalidSlots` for UI, and the controller derives this field for algo input when needed.
   */
  invalidSlot?: 1 | 2 | 3 | 4
}

export type DevLeaveSimConfig = {
  seed: string

  // Planned leave knobs (developer-specified)
  plannedTherapistCount: number // therapists excluding SPT
  plannedTherapistMax: number // quota cap (default 3)
  plannedPcaFteBudget: number // 0..1.5, in chunks of 0.5/1.0
  plannedPcaFteBudgetMax: number // quota cap (default 1.5)

  // Unplanned leave knobs
  sickCount: number // 0..N
  urgentCount: number // 0..Y

  // Selection policy
  rankWeightMode: DevLeaveSimRankWeightMode
  rankWeights: DevLeaveSimRankWeights
  specialProgramTargeting: DevLeaveSimSpecialProgramTargeting

  // Leave type distributions (weights; values are LeaveType strings)
  plannedLeaveTypeWeights: Array<{ leaveType: LeaveType; weight: number }>
  urgentLeaveTypeWeights: Array<{ leaveType: LeaveType; weight: number }>

  // PCA half-day behavior
  pcaHalfDaySlotMode: DevLeaveSimPcaHalfDaySlotMode

  // PCA targeting (affects Step 2 substitution realism)
  pcaNonFloatingTargeting: DevLeaveSimPcaNonFloatingTargeting

  // PCA medical follow-up / urgent partial-slot behavior
  pcaUrgentUsesInvalidSlot: boolean
  pcaUrgentInvalidSlotProbability: number // 0..1
}

export type DevLeaveSimDraft = {
  schemaVersion: 1
  generatedAt: string
  seedUsed: string
  config: DevLeaveSimConfig
  patches: DevLeaveSimStaffPatch[]
  meta: {
    excludedSptNotScheduledIds: string[]
    warnings: string[]
  }
}

export type DevLeaveSimDebugBundle = {
  schemaVersion: 1
  dateKey: string
  exportedAt: string
  draft: DevLeaveSimDraft
  /**
   * Optional: original overrides captured at apply time (for reset-generated-only).
   * Stored as a plain object so it can round-trip in JSON.
   */
  appliedOriginalsByStaffId?: Record<
    string,
    {
      leaveType?: LeaveType | null
      fteRemaining?: number
      fteSubtraction?: number
      availableSlots?: number[]
      invalidSlots?: Array<{ slot: 1 | 2 | 3 | 4; timeRange: DevLeaveSimInvalidSlotRange }>
    } | null
  >
}

export function defaultDevLeaveSimRankWeights(): DevLeaveSimRankWeights {
  return { SPT: 1, APPT: 1, RPT: 1, PCA: 1 }
}

export function defaultDevLeaveSimConfig(): DevLeaveSimConfig {
  return {
    seed: String(Date.now()),
    plannedTherapistCount: 0,
    plannedTherapistMax: 3,
    plannedPcaFteBudget: 0,
    plannedPcaFteBudgetMax: 1.5,
    sickCount: 0,
    urgentCount: 0,
    rankWeightMode: 'pool_proportional',
    rankWeights: defaultDevLeaveSimRankWeights(),
    specialProgramTargeting: 'pure_random',
    plannedLeaveTypeWeights: [
      { leaveType: 'VL', weight: 1 },
      { leaveType: 'SDO', weight: 1 },
      { leaveType: 'TIL', weight: 1 },
    ],
    urgentLeaveTypeWeights: [
      { leaveType: 'medical follow-up', weight: 1 },
      { leaveType: 'others', weight: 0.15 },
    ],
    pcaHalfDaySlotMode: 'random',
    pcaNonFloatingTargeting: 'random',
    pcaUrgentUsesInvalidSlot: true,
    pcaUrgentInvalidSlotProbability: 0.8,
  }
}

export function clampNumber(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

export function isValidSlot(slot: unknown): slot is 1 | 2 | 3 | 4 {
  return slot === 1 || slot === 2 || slot === 3 || slot === 4
}

export const ALL_SLOTS: ReadonlyArray<1 | 2 | 3 | 4> = [1, 2, 3, 4]

export function isTherapistRank(rank: StaffRank | null | undefined): rank is 'SPT' | 'APPT' | 'RPT' {
  return rank === 'SPT' || rank === 'APPT' || rank === 'RPT'
}

export function isPcaRank(rank: StaffRank | null | undefined): rank is 'PCA' {
  return rank === 'PCA'
}

export function isValidTeam(value: unknown): value is Team | null {
  if (value === null) return true
  return (
    value === 'FO' ||
    value === 'SMM' ||
    value === 'SFM' ||
    value === 'CPPC' ||
    value === 'MC' ||
    value === 'GMC' ||
    value === 'NSM' ||
    value === 'DRO'
  )
}

