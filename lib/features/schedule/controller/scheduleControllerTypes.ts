import type { Team, LeaveType, SharedTherapistAllocationMode } from '@/types/staff'

export type ScheduleWardRow = {
  name: string
  total_beds: number
  team_assignments: Record<Team, number>
  team_assignment_portions?: Record<Team, string>
}

export type SpecialProgramOverrideEntry = {
  programId: string
  enabled?: boolean
  therapistId?: string
  pcaId?: string
  slots?: number[]
  requiredSlots?: number[]
  therapistFTESubtraction?: number
  pcaFTESubtraction?: number
  drmAddOn?: number
}

export type SptOnDayOverrideState = {
  enabled: boolean
  contributesFte: boolean
  slots: number[]
  slotModes: { am: 'AND' | 'OR'; pm: 'AND' | 'OR' }
  displayText?: string | null
  /** Optional per-day team override for SPT. */
  assignedTeam?: Team | null
}

export type StaffOverrideState = {
  leaveType: LeaveType | null
  fteRemaining: number
  team?: Team
  sharedTherapistModeOverride?: SharedTherapistAllocationMode
  fteSubtraction?: number
  availableSlots?: number[]
  // Legacy single-slot marker used by PCA allocation algorithm (derived from `invalidSlots` when present).
  invalidSlot?: number
  // Invalid slots with time ranges
  invalidSlots?: Array<{
    slot: number
    timeRange: { start: string; end: string }
  }>
  // Therapist AM/PM selection
  amPmSelection?: 'AM' | 'PM'
  // Therapist special program availability
  specialProgramAvailable?: boolean
  // Step 2.0: special program overrides
  specialProgramOverrides?: SpecialProgramOverrideEntry[]
  // Step 2.2: per-day SPT config override (derived from dashboard config, editable on-the-day).
  sptOnDayOverride?: SptOnDayOverrideState
  slotOverrides?: { slot1?: Team | null; slot2?: Team | null; slot3?: Team | null; slot4?: Team | null }
  // Step 3: Manual buffer floating PCA assignments (persist across Step 3 resets)
  bufferManualSlotOverrides?: { slot1?: Team | null; slot2?: Team | null; slot3?: Team | null; slot4?: Team | null }
  /**
   * Step 3.4 (optional): marks which assigned slots are "extra coverage"
   * (assigned after all pending requirements are fulfilled).
   *
   * Stored in staffOverrides so the UI can persistently style these slots.
   */
  extraCoverageBySlot?: Partial<Record<1 | 2 | 3 | 4, true>>
  substitutionFor?: { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team; slots: number[] }
  substitutionForBySlot?: Partial<Record<1 | 2 | 3 | 4, { nonFloatingPCAId: string; nonFloatingPCAName: string; team: Team }>>
  // Therapist per-team split/merge overrides (ad hoc fallback)
  therapistTeamFTEByTeam?: Partial<Record<Team, number>>
  /**
   * Optional half-day tagging for therapist split portions (UI display + validation).
   * - `therapistTeamHalfDayByTeam`: resolved internal assignment ('AM'|'PM')
   * - `therapistTeamHalfDayUiByTeam`: UI choice ('AUTO'|'AM'|'PM'|'UNSPECIFIED')
   *
   * NOTE: "UNSPECIFIED" means hide label in UI, but still resolves internally (auto).
   */
  therapistTeamHalfDayByTeam?: Partial<Record<Team, 'AM' | 'PM'>>
  therapistTeamHalfDayUiByTeam?: Partial<Record<Team, 'AUTO' | 'AM' | 'PM' | 'UNSPECIFIED'>>
  sharedTherapistSlotTeams?: Partial<Record<1 | 2 | 3 | 4, Team>>
  therapistNoAllocation?: boolean
  // Staff card fill color (schedule grid only)
  cardColorByTeam?: Partial<Record<Team, string>>
}

export type BedCountsOverridesByTeam = Partial<
  Record<Team, import('@/components/allocation/BedCountsEditDialog').BedCountsOverrideState>
>
export type BedRelievingNotesByToTeam = import('@/types/schedule').BedRelievingNotesByToTeam

export type PCAAllocationErrors = {
  missingSlotSubstitution?: string
  specialProgramAllocation?: string
  preferredSlotUnassigned?: string
}
