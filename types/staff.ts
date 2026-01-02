export type StaffRank = 'SPT' | 'APPT' | 'RPT' | 'PCA' | 'workman'
export type Team = 'FO' | 'SMM' | 'SFM' | 'CPPC' | 'MC' | 'GMC' | 'NSM' | 'DRO'
export type SpecialProgram = 'CRP' | 'DRM' | 'Robotic' | 'Ortho' | 'Neuro' | 'Cardiac' | 'DRO'
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri'
export type LeaveType = 'VL' | 'half day VL' | 'TIL' | 'SDO' | 'sick leave' | 'study leave' | 'medical follow-up' | 'others' | string | null
export type StaffStatus = 'active' | 'inactive' | 'buffer'

// Mapping of leave types to default FTE remaining
export const LEAVE_TYPE_FTE_MAP: Record<Exclude<LeaveType, null | 'others' | 'medical follow-up'>, number> = {
  'VL': 0,
  'half day VL': 0.5,
  'TIL': 0,
  'SDO': 0,
  'sick leave': 0,
  'study leave': 0,
  'medical follow-up': 0, // Default to 0, but user can set custom FTE
}

export interface Staff {
  id: string
  name: string
  rank: StaffRank
  special_program: SpecialProgram[] | null
  team: Team | null
  floating: boolean
  floor_pca: ('upper' | 'lower')[] | null  // Floor PCA property: upper, lower, or both
  status?: StaffStatus  // Staff status: active, inactive, or buffer
  active?: boolean // Legacy/DB column support (some panels still reference s.active)
  buffer_fte?: number  // FTE value for buffer staff (determined by slots for PCA)
  created_at: string
  updated_at: string
}

export interface StaffPreferences {
  id: string
  staff_id: string
  preference_teams: Team[]
  preference_not_teams: Team[]
  preference_days: Weekday[]
  preference_slots: Record<Weekday, number[]>
  gym_schedule: { team: Team; slot: number } | null
}

