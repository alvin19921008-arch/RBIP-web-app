import type { Team } from '@/types/staff'
import { TEAMS } from '@/lib/utils/types'

export type MergedPcaPreferencesOverride = {
  preferred_pca_ids?: string[]
  preferred_slots?: number[]
  avoid_gym_schedule?: boolean
  gym_schedule?: number | null
  floor_pca_selection?: 'upper' | 'lower' | null
  source?: 'main' | 'mergedAway' | 'custom'
  updatedAt?: string
}

export type TeamMergeSnapshot = {
  mergedInto: Partial<Record<Team, Team>>
  mergeLabelOverrideByTeam?: Partial<Record<Team, string>>
  mergedPcaPreferencesOverrideByTeam?: Partial<Record<Team, MergedPcaPreferencesOverride>>
}

export type TeamSettingsMergeRow = {
  team: Team
  display_name: string
  merged_into?: Team | null
  merge_label_override?: string | null
  merged_pca_preferences_override?: MergedPcaPreferencesOverride | null
}

export type TeamMergeResolvedConfig = {
  mergedInto: Partial<Record<Team, Team>>
  displayNames: Partial<Record<Team, string>>
  mergeLabelOverrideByTeam: Partial<Record<Team, string>>
  mergedPcaPreferencesOverrideByTeam: Partial<Record<Team, MergedPcaPreferencesOverride>>
}

function isTeam(value: unknown): value is Team {
  return typeof value === 'string' && (TEAMS as readonly string[]).includes(value)
}

function sanitizeMergedInto(input: Partial<Record<Team, Team>> | null | undefined): Partial<Record<Team, Team>> {
  const out: Partial<Record<Team, Team>> = {}
  for (const team of TEAMS) {
    const main = input?.[team]
    if (!main) continue
    if (!isTeam(main)) continue
    if (main === team) continue
    out[team] = main
  }
  return out
}

export function sanitizeTeamMergeSnapshot(
  snapshot: TeamMergeSnapshot | null | undefined
): TeamMergeSnapshot | null {
  if (!snapshot) return null
  return {
    mergedInto: sanitizeMergedInto(snapshot.mergedInto),
    mergeLabelOverrideByTeam: snapshot.mergeLabelOverrideByTeam ?? {},
    mergedPcaPreferencesOverrideByTeam: snapshot.mergedPcaPreferencesOverrideByTeam ?? {},
  }
}

export function buildTeamMergeSnapshotFromTeamSettings(
  rows: TeamSettingsMergeRow[] | null | undefined
): TeamMergeSnapshot {
  const mergedInto: Partial<Record<Team, Team>> = {}
  const mergeLabelOverrideByTeam: Partial<Record<Team, string>> = {}
  const mergedPcaPreferencesOverrideByTeam: Partial<Record<Team, MergedPcaPreferencesOverride>> = {}

  for (const row of rows || []) {
    if (!row || !isTeam(row.team)) continue
    const team = row.team
    if (row.merged_into && isTeam(row.merged_into) && row.merged_into !== team) {
      mergedInto[team] = row.merged_into
    }

    const labelOverride = (row.merge_label_override || '').trim()
    if (labelOverride) {
      mergeLabelOverrideByTeam[team] = labelOverride
    }

    if (row.merged_pca_preferences_override && typeof row.merged_pca_preferences_override === 'object') {
      mergedPcaPreferencesOverrideByTeam[team] = row.merged_pca_preferences_override
    }
  }

  return {
    mergedInto: sanitizeMergedInto(mergedInto),
    mergeLabelOverrideByTeam,
    mergedPcaPreferencesOverrideByTeam,
  }
}

export function resolveTeamMergeConfig(params: {
  teamSettingsRows?: TeamSettingsMergeRow[] | null
  snapshotMerge?: TeamMergeSnapshot | null
}): TeamMergeResolvedConfig {
  const liveSnapshot = buildTeamMergeSnapshotFromTeamSettings(params.teamSettingsRows || [])
  const frozen = sanitizeTeamMergeSnapshot(params.snapshotMerge)
  const effective = frozen || liveSnapshot

  const displayNames: Partial<Record<Team, string>> = {}
  for (const row of params.teamSettingsRows || []) {
    if (!row || !isTeam(row.team)) continue
    const name = (row.display_name || '').trim()
    displayNames[row.team] = name || row.team
  }
  for (const team of TEAMS) {
    if (!displayNames[team]) displayNames[team] = team
  }

  return {
    mergedInto: effective?.mergedInto || {},
    displayNames,
    mergeLabelOverrideByTeam: effective?.mergeLabelOverrideByTeam || {},
    mergedPcaPreferencesOverrideByTeam: effective?.mergedPcaPreferencesOverrideByTeam || {},
  }
}

export function getMainTeam(team: Team, mergedInto: Partial<Record<Team, Team>>): Team {
  const main = mergedInto[team]
  if (!main || main === team) return team
  return main
}

export function getVisibleTeams(mergedInto: Partial<Record<Team, Team>>): Team[] {
  return TEAMS.filter((team) => !mergedInto[team])
}

export function getContributingTeams(mainTeam: Team, mergedInto: Partial<Record<Team, Team>>): Team[] {
  return TEAMS.filter((team) => getMainTeam(team, mergedInto) === mainTeam)
}

export function getMainTeamDisplayName(params: {
  mainTeam: Team
  mergedInto: Partial<Record<Team, Team>>
  displayNames: Partial<Record<Team, string>>
  mergeLabelOverrideByTeam?: Partial<Record<Team, string>>
}): string {
  const override = params.mergeLabelOverrideByTeam?.[params.mainTeam]?.trim()
  if (override) return override

  const contributors = getContributingTeams(params.mainTeam, params.mergedInto)
  if (contributors.length <= 1) return params.displayNames[params.mainTeam] || params.mainTeam

  return contributors
    .map((team) => params.displayNames[team] || team)
    .join('+')
}

export function canonicalizeTeamValue(team: Team | null | undefined, mergedInto: Partial<Record<Team, Team>>) {
  if (!team) return team
  return getMainTeam(team, mergedInto)
}

export function aggregateRecordByVisibleTeams<T>(params: {
  source: Record<Team, T>
  mergedInto: Partial<Record<Team, Team>>
  combine: (items: T[], mainTeam: Team) => T
}): Partial<Record<Team, T>> {
  const visible = getVisibleTeams(params.mergedInto)
  const out: Partial<Record<Team, T>> = {}
  for (const mainTeam of visible) {
    const items = getContributingTeams(mainTeam, params.mergedInto)
      .map((team) => params.source[team])
      .filter((item) => item != null)
    out[mainTeam] = params.combine(items, mainTeam)
  }
  return out
}

export function canonicalizeTeamMapKeys<T>(
  source: Partial<Record<Team, T>>,
  mergedInto: Partial<Record<Team, Team>>,
  merge: (prev: T, next: T) => T
): Partial<Record<Team, T>> {
  const out: Partial<Record<Team, T>> = {}
  for (const team of TEAMS) {
    const value = source[team]
    if (value == null) continue
    const mainTeam = getMainTeam(team, mergedInto)
    const existing = out[mainTeam]
    out[mainTeam] = existing == null ? value : merge(existing, value)
  }
  return out
}
