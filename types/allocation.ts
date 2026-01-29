import { Team, Weekday } from './staff'

export interface SpecialProgram {
  id: string
  name: string
  staff_ids: string[]
  weekdays: Weekday[]
  slots: Record<Weekday, number[]>
  fte_subtraction: Record<string, Record<Weekday, number>>
  pca_required: number | null
  therapist_preference_order?: Record<Team, string[]>
  pca_preference_order?: string[]
}

export interface SPTAllocation {
  id: string
  staff_id: string
  specialty: string | null
  teams: Team[]
  /**
   * Legacy shape (kept for backward compatibility with older snapshots / DB rows).
   * New code should prefer `config_by_weekday`.
   */
  weekdays?: Weekday[]
  slots?: Record<Weekday, number[]>
  slot_modes?: Record<Weekday, { am: 'AND' | 'OR'; pm: 'AND' | 'OR' }>
  fte_addon?: number
  /**
   * New shape (single-row-per-SPT): weekday configuration stored as JSONB.
   * `fte_addon` becomes derived from slots/modes when `contributes_fte=true`.
   */
  config_by_weekday?: Partial<
    Record<
      Weekday,
      {
        enabled?: boolean
        contributes_fte?: boolean
        slots?: number[]
        slot_modes?: { am?: 'AND' | 'OR'; pm?: 'AND' | 'OR' }
        display_text?: string | null
      }
    >
  >
  substitute_team_head: boolean
  is_rbip_supervisor?: boolean // If true, this SPT can substitute for team heads when needed
  active?: boolean // If false, this allocation is not included in work schedules
  created_at?: string
  updated_at?: string
}

export interface PCAPreference {
  id: string
  team: Team
  preferred_pca_ids: string[]  // Max 2 enforced in UI
  preferred_slots: number[]    // Max 1 enforced in UI (radio behavior)
  avoid_gym_schedule?: boolean
  gym_schedule?: number | null  // Gym slot (1-4) for this team
  floor_pca_selection?: 'upper' | 'lower' | null  // Team's floor preference for filtering compatible PCAs
}

export interface Ward {
  id: string
  name: string
  total_beds: number
  team_assignments: Record<Team, number>
  team_assignment_portions?: Record<Team, string>  // Optional fraction labels (e.g., "1/3", "2/3")
}

export interface TeamHeadSubstitution {
  id: string
  spt_staff_id: string
  fte_when_substituting: number
  created_at: string
  updated_at: string
}

