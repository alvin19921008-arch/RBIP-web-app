/**
 * Database Type Safety Layer
 * 
 * This module provides strict types matching the database schema exactly,
 * along with conversion utilities to safely transform between TypeScript
 * application types and database types.
 * 
 * Key issues this addresses:
 * - special_program_ids: DB expects UUID[], but code sometimes passes program NAMES
 * - leave_type: DB enum is narrower than TypeScript union type
 * - Floating point precision issues with DECIMAL columns
 */

import { Team, LeaveType } from '@/types/staff'

// ============================================================================
// Database Enum Types (must match supabase/schema.sql exactly)
// ============================================================================

export type DbTeam = 'FO' | 'SMM' | 'SFM' | 'CPPC' | 'MC' | 'GMC' | 'NSM' | 'DRO'

export type DbLeaveType = 'VL' | 'SL' | 'TIL' | 'study leave' | 'conference'

export type DbStaffRank = 'SPT' | 'APPT' | 'RPT' | 'PCA' | 'workman'

export type DbWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri'

// ============================================================================
// Database Table Interfaces (strict types matching schema.sql)
// ============================================================================

export interface DbTherapistAllocation {
  id: string  // UUID
  schedule_id: string  // UUID
  staff_id: string  // UUID
  team: DbTeam
  fte_therapist: number  // DECIMAL
  fte_remaining: number  // DECIMAL
  slot_whole: number | null  // INTEGER
  slot1: DbTeam | null
  slot2: DbTeam | null
  slot3: DbTeam | null
  slot4: DbTeam | null
  leave_type: DbLeaveType | null  // DB enum only - narrower than TS type
  special_program_ids: string[] | null  // UUID[] - MUST be UUIDs, NOT names
  is_substitute_team_head: boolean
  spt_slot_display: string | null  // TEXT
  is_manual_override: boolean
  manual_override_note: string | null  // TEXT - store custom leave types here
}

export interface DbPCAAllocation {
  id: string  // UUID
  schedule_id: string  // UUID
  staff_id: string  // UUID
  team: DbTeam
  fte_pca: number  // DECIMAL
  fte_remaining: number  // DECIMAL
  slot_assigned: number  // DECIMAL (RENAMED from fte_assigned)
  slot_whole: number | null  // INTEGER
  slot1: DbTeam | null
  slot2: DbTeam | null
  slot3: DbTeam | null
  slot4: DbTeam | null
  leave_type: DbLeaveType | null  // DB enum only
  special_program_ids: string[] | null  // UUID[]
  invalid_slot: number | null  // INTEGER
  leave_comeback_time: string | null  // TEXT
  leave_mode: string | null  // TEXT - 'leave' or 'come_back'
}

export interface DbDailySchedule {
  id: string  // UUID
  date: string  // DATE as YYYY-MM-DD string
  is_tentative: boolean
  tie_break_decisions: Record<string, string> | null  // JSONB
  created_at: string
  updated_at: string
}

export interface DbScheduleCalculations {
  id: string  // UUID
  schedule_id: string  // UUID
  team: DbTeam
  designated_wards: string[]  // TEXT[]
  total_beds_designated: number  // INTEGER
  total_beds: number  // INTEGER
  total_pt_on_duty: number  // DECIMAL
  beds_per_pt: number  // DECIMAL
  pt_per_team: number  // DECIMAL
  beds_for_relieving: number  // DECIMAL
  pca_on_duty: number  // DECIMAL
  total_pt_per_pca: number  // DECIMAL
  total_pt_per_team: number  // DECIMAL
  average_pca_per_team: number  // DECIMAL
}

// ============================================================================
// Type Conversion Utilities
// ============================================================================

/**
 * Maps TypeScript leave types to database enum values.
 * Returns null for custom leave types (which should be stored in manual_override_note).
 * 
 * DB enum: 'VL', 'SL', 'TIL', 'study leave', 'conference'
 * TS types: 'VL', 'half day VL', 'TIL', 'SDO', 'sick leave', 'study leave', 'medical follow-up', 'others'
 */
export function toDbLeaveType(tsLeaveType: LeaveType): DbLeaveType | null {
  if (tsLeaveType === null) return null
  
  const mapping: Record<string, DbLeaveType | null> = {
    'VL': 'VL',
    'half day VL': 'VL',  // Map to VL - the half-day info is in fte_remaining (0.5)
    'SDO': 'VL',  // Schedule day off maps to VL
    'sick leave': 'SL',
    'TIL': 'TIL',
    'study leave': 'study leave',
    'conference': 'conference',
    // Custom leave types - return null, store in manual_override_note
    'medical follow-up': null,
    'others': null,
  }
  
  return mapping[tsLeaveType] ?? null  // Unknown types return null
}

/**
 * Maps database leave types back to TypeScript types.
 * Uses FTE and manual_override_note to reconstruct the full leave type.
 */
export function fromDbLeaveType(
  dbLeaveType: DbLeaveType | null, 
  fte: number, 
  manualNote: string | null
): LeaveType {
  // If there's a manual note, it contains a custom leave type
  if (manualNote) {
    return manualNote as LeaveType
  }
  
  if (dbLeaveType === null) return null
  
  // Special case: VL with fte=0.5 means "half day VL"
  if (dbLeaveType === 'VL' && fte === 0.5) {
    return 'half day VL'
  }
  
  // Map DB types back to TS types
  const mapping: Record<DbLeaveType, LeaveType> = {
    'VL': 'VL',
    'SL': 'sick leave',
    'TIL': 'TIL',
    'study leave': 'study leave',
    'conference': 'others',  // Map conference to others
  }
  
  return mapping[dbLeaveType]
}

/**
 * Checks if a leave type is a custom type that needs to be stored in manual_override_note
 */
export function isCustomLeaveType(leaveType: LeaveType): boolean {
  if (leaveType === null) return false
  
  const standardTypes = ['VL', 'half day VL', 'TIL', 'SDO', 'sick leave', 'study leave', 'conference']
  return !standardTypes.includes(leaveType)
}

// ============================================================================
// UUID Validation Utilities
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validates that all strings in an array are valid UUIDs
 */
export function validateUUIDs(ids: string[]): boolean {
  return ids.every(id => UUID_REGEX.test(id))
}

/**
 * Validates that all strings are valid UUIDs, throws an error if not.
 * Use this before saving special_program_ids to database.
 */
export function assertValidSpecialProgramIds(ids: string[] | null | undefined, context: string): void {
  if (!ids || ids.length === 0) return
  
  const invalidIds = ids.filter(id => !UUID_REGEX.test(id))
  if (invalidIds.length > 0) {
    throw new Error(
      `Invalid special_program_ids in ${context}: expected UUIDs but got: "${invalidIds.join(', ')}". ` +
      `This usually means program NAMES were passed instead of UUIDs. ` +
      `Use specialPrograms.find(p => p.name === name)?.id to convert.`
    )
  }
}

/**
 * Checks if a string looks like a program name rather than a UUID.
 * Program names are typically capitalized words like "Robotic", "DRM", etc.
 */
export function looksLikeProgramName(value: string): boolean {
  // UUIDs have dashes and are hex characters
  if (UUID_REGEX.test(value)) return false
  
  // Program names are typically short and alphabetic
  return /^[A-Za-z]+$/.test(value) && value.length <= 20
}

// ============================================================================
// Decimal Precision Utilities
// ============================================================================

/**
 * Rounds a number to 2 decimal places to avoid floating point issues.
 * Use this for all DECIMAL columns before saving to database.
 */
export function roundDecimal(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

/**
 * Ensures FTE values are rounded to proper precision (2 decimal places)
 */
export function normalizeFTE(fte: number): number {
  return roundDecimal(fte, 2)
}

// ============================================================================
// Special Program ID Conversion
// ============================================================================

export interface SpecialProgramRef {
  id: string
  name: string
}

/**
 * Converts program names to UUIDs using a lookup table.
 * Returns only valid UUIDs, filtering out any names that couldn't be resolved.
 */
export function programNamesToIds(
  names: string[] | null | undefined, 
  specialPrograms: SpecialProgramRef[]
): string[] | null {
  if (!names || names.length === 0) return null
  
  const ids = names
    .map(name => {
      // Check if it's already a UUID
      if (UUID_REGEX.test(name)) return name
      
      // Look up the UUID by name
      const program = specialPrograms.find(p => p.name === name)
      if (!program) {
        console.warn(`Could not find special program with name: ${name}`)
        return null
      }
      return program.id
    })
    .filter((id): id is string => id !== null)
  
  return ids.length > 0 ? ids : null
}

/**
 * Converts program UUIDs to names for display purposes.
 */
export function programIdsToNames(
  ids: string[] | null | undefined,
  specialPrograms: SpecialProgramRef[]
): string[] {
  if (!ids || ids.length === 0) return []
  
  return ids
    .map(id => {
      const program = specialPrograms.find(p => p.id === id)
      return program?.name ?? id  // Return ID if name not found
    })
}

// ============================================================================
// Data Conversion for Save Operations
// ============================================================================

export interface PrepareTherapistAllocationOptions {
  allocation: {
    id?: string
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
    spt_slot_display: string | null
    is_manual_override: boolean
    manual_override_note: string | null
  }
  specialPrograms: SpecialProgramRef[]
}

/**
 * Prepares a therapist allocation for database insertion/update.
 * Converts types and validates data.
 */
export function prepareTherapistAllocationForDb(
  options: PrepareTherapistAllocationOptions
): Omit<DbTherapistAllocation, 'id'> & { id?: string } {
  const { allocation, specialPrograms } = options
  
  // Convert special program names to UUIDs if needed
  let programIds = allocation.special_program_ids
  if (programIds && programIds.length > 0) {
    // Check if any look like names instead of UUIDs
    const hasNames = programIds.some(id => looksLikeProgramName(id))
    if (hasNames) {
      programIds = programNamesToIds(programIds, specialPrograms)
    }
  }
  
  // Validate UUIDs
  assertValidSpecialProgramIds(programIds, 'therapist allocation')
  
  // Determine if we need to store a custom leave type in notes
  const customLeaveType = isCustomLeaveType(allocation.leave_type) ? allocation.leave_type : null
  const manualNote = customLeaveType || allocation.manual_override_note
  
  return {
    ...(allocation.id && { id: allocation.id }),
    schedule_id: allocation.schedule_id,
    staff_id: allocation.staff_id,
    team: allocation.team as DbTeam,
    fte_therapist: normalizeFTE(allocation.fte_therapist),
    fte_remaining: normalizeFTE(allocation.fte_remaining),
    slot_whole: allocation.slot_whole,
    slot1: allocation.slot1 as DbTeam | null,
    slot2: allocation.slot2 as DbTeam | null,
    slot3: allocation.slot3 as DbTeam | null,
    slot4: allocation.slot4 as DbTeam | null,
    leave_type: toDbLeaveType(allocation.leave_type),
    special_program_ids: programIds,
    is_substitute_team_head: allocation.is_substitute_team_head,
    spt_slot_display: allocation.spt_slot_display,
    is_manual_override: allocation.is_manual_override || !!customLeaveType,
    manual_override_note: manualNote,
  }
}

export interface PreparePCAAllocationOptions {
  allocation: {
    id?: string
    schedule_id: string
    staff_id: string
    team: Team
    fte_pca: number
    fte_remaining: number
    slot_assigned: number
    slot_whole: number | null
    slot1: Team | null
    slot2: Team | null
    slot3: Team | null
    slot4: Team | null
    leave_type: LeaveType
    special_program_ids: string[] | null
    invalid_slot?: number | null
    leave_comeback_time?: string | null
    leave_mode?: string | null
  }
  specialPrograms: SpecialProgramRef[]
}

/**
 * Prepares a PCA allocation for database insertion/update.
 * Converts types and validates data.
 */
export function preparePCAAllocationForDb(
  options: PreparePCAAllocationOptions
): Omit<DbPCAAllocation, 'id'> & { id?: string } {
  const { allocation, specialPrograms } = options
  
  // Convert special program names to UUIDs if needed
  let programIds = allocation.special_program_ids
  if (programIds && programIds.length > 0) {
    const hasNames = programIds.some(id => looksLikeProgramName(id))
    if (hasNames) {
      programIds = programNamesToIds(programIds, specialPrograms)
    }
  }
  
  // Validate UUIDs
  assertValidSpecialProgramIds(programIds, 'PCA allocation')
  
  return {
    ...(allocation.id && { id: allocation.id }),
    schedule_id: allocation.schedule_id,
    staff_id: allocation.staff_id,
    team: allocation.team as DbTeam,
    fte_pca: normalizeFTE(allocation.fte_pca),
    fte_remaining: normalizeFTE(allocation.fte_remaining),
    slot_assigned: normalizeFTE(allocation.slot_assigned),
    slot_whole: allocation.slot_whole,
    slot1: allocation.slot1 as DbTeam | null,
    slot2: allocation.slot2 as DbTeam | null,
    slot3: allocation.slot3 as DbTeam | null,
    slot4: allocation.slot4 as DbTeam | null,
    leave_type: toDbLeaveType(allocation.leave_type),
    special_program_ids: programIds,
    invalid_slot: allocation.invalid_slot ?? null,
    leave_comeback_time: allocation.leave_comeback_time ?? null,
    leave_mode: allocation.leave_mode ?? null,
  }
}


