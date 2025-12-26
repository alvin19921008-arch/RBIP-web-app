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
          created_at?: string
          updated_at?: string
        }
      }
      // Add other table types as needed
    }
  }
}

