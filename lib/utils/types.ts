/**
 * Type Utility Functions
 * 
 * Provides helper functions for type-safe initialization of common data structures.
 * These utilities prevent TypeScript strict mode errors during build.
 */

import { Team } from '@/types/staff'

/**
 * All valid team values in the system.
 * Use this for iteration instead of hardcoding team lists.
 */
export const TEAMS: readonly Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO'] as const

/**
 * Creates an empty Record<Team, T> with all teams initialized to the same default value.
 * 
 * Use this for primitive or immutable default values.
 * For mutable defaults (like arrays), use createEmptyTeamRecordFactory instead.
 * 
 * @example
 * // For primitive values
 * const counts = createEmptyTeamRecord<number>(0)
 * // Result: { FO: 0, SMM: 0, SFM: 0, CPPC: 0, MC: 0, GMC: 0, NSM: 0, DRO: 0 }
 * 
 * @example
 * // For useState initialization
 * const [pendingFTE, setPendingFTE] = useState(createEmptyTeamRecord<number>(0))
 */
export function createEmptyTeamRecord<T>(defaultValue: T): Record<Team, T> {
  return Object.fromEntries(TEAMS.map(t => [t, defaultValue])) as Record<Team, T>
}

/**
 * Creates an empty Record<Team, T> with all teams initialized using a factory function.
 * 
 * Use this when each team needs its own instance (e.g., arrays or objects).
 * The factory is called once per team, creating unique instances.
 * 
 * @example
 * // For arrays (each team gets its own array instance)
 * const teamLists = createEmptyTeamRecordFactory<string[]>(() => [])
 * // Result: { FO: [], SMM: [], ... } - each array is a unique instance
 * 
 * @example
 * // For objects
 * const teamConfigs = createEmptyTeamRecordFactory<{ count: number }>(() => ({ count: 0 }))
 */
export function createEmptyTeamRecordFactory<T>(factory: () => T): Record<Team, T> {
  return Object.fromEntries(TEAMS.map(t => [t, factory()])) as Record<Team, T>
}

/**
 * Type guard to check if a value is a valid Team.
 * 
 * @example
 * const teamStr = 'FO'
 * if (isTeam(teamStr)) {
 *   // teamStr is now typed as Team
 *   doSomethingWithTeam(teamStr)
 * }
 */
export function isTeam(value: string): value is Team {
  return TEAMS.includes(value as Team)
}

/**
 * Safely gets a value from a Record<Team, T> with a fallback for missing keys.
 * 
 * @example
 * const counts = createEmptyTeamRecord<number>(0)
 * const foCount = getTeamValue(counts, 'FO', 0) // 0
 * const unknownCount = getTeamValue(counts, 'UNKNOWN' as Team, -1) // -1
 */
export function getTeamValue<T>(record: Record<Team, T>, team: Team, fallback: T): T {
  return record[team] ?? fallback
}

/**
 * Creates a shallow copy of a Record<Team, T>.
 * Useful for immutable state updates.
 * 
 * @example
 * const updated = cloneTeamRecord(original)
 * updated.FO = newValue
 * setState(updated)
 */
export function cloneTeamRecord<T>(record: Record<Team, T>): Record<Team, T> {
  return { ...record }
}

