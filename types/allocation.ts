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
  weekdays: Weekday[]
  slots: Record<Weekday, number[]>
  slot_modes?: Record<Weekday, { am: 'AND' | 'OR', pm: 'AND' | 'OR' }> // Separate modes for AM (slots 1-2) and PM (slots 3-4)
  fte_addon: number
  substitute_team_head: boolean
  is_rbip_supervisor?: boolean // If true, this SPT can substitute for team heads when needed
  active?: boolean // If false, this allocation is not included in work schedules
}

export interface PCAPreference {
  id: string
  team: Team
  preferred_pca_ids: string[]  // Max 2 enforced in UI
  preferred_slots: number[]    // Max 1 enforced in UI (radio behavior)
  preferred_not_pca_ids: string[]
  avoid_gym_schedule?: boolean
  gym_schedule?: number | null  // Gym slot (1-4) for this team
  floor_pca_selection?: 'upper' | 'lower' | null  // Team's floor preference for filtering compatible PCAs
}

export interface Ward {
  id: string
  name: string
  total_beds: number
  team_assignments: Record<Team, number>
}

export interface TeamHeadSubstitution {
  id: string
  spt_staff_id: string
  fte_when_substituting: number
  created_at: string
  updated_at: string
}

