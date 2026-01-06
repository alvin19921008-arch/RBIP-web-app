export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      staff: {
        Row: {
          id: string
          name: string
          rank: 'SPT' | 'APPT' | 'RPT' | 'PCA' | 'workman'
          special_program: string[] | null
          team: 'FO' | 'SMM' | 'SFM' | 'CPPC' | 'MC' | 'GMC' | 'NSM' | 'DRO' | null
          floating: boolean
          floor_pca: string[] | null
          status: 'active' | 'inactive' | 'buffer'
          buffer_fte: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          rank: 'SPT' | 'APPT' | 'RPT' | 'PCA' | 'workman'
          special_program?: string[] | null
          team?: 'FO' | 'SMM' | 'SFM' | 'CPPC' | 'MC' | 'GMC' | 'NSM' | 'DRO' | null
          floating?: boolean
          floor_pca?: string[] | null
          status?: 'active' | 'inactive' | 'buffer'
          buffer_fte?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          rank?: 'SPT' | 'APPT' | 'RPT' | 'PCA' | 'workman'
          special_program?: string[] | null
          team?: 'FO' | 'SMM' | 'SFM' | 'CPPC' | 'MC' | 'GMC' | 'NSM' | 'DRO' | null
          floating?: boolean
          floor_pca?: string[] | null
          status?: 'active' | 'inactive' | 'buffer'
          buffer_fte?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      daily_schedules: {
        Row: {
          id: string
          date: string
          is_tentative: boolean
          tie_break_decisions: Json | null
          baseline_snapshot: Json | null
          staff_overrides: Json | null
          workflow_state: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          is_tentative?: boolean
          tie_break_decisions?: Json | null
          baseline_snapshot?: Json | null
          staff_overrides?: Json | null
          workflow_state?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          is_tentative?: boolean
          tie_break_decisions?: Json | null
          baseline_snapshot?: Json | null
          staff_overrides?: Json | null
          workflow_state?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      // Add other table types as needed
    }
  }
}

