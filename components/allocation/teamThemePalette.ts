'use client'

import type { Team } from '@/types/staff'

/**
 * Shared light team theme palette.
 *
 * Origin: Step 2.1 substitution wizard.
 * We keep these light (50 backgrounds, 200 borders, 700 text) for readability.
 */
export const TEAM_THEME_PALETTE = [
  { badge: 'border-sky-200 bg-sky-50 text-sky-700', panel: 'border-sky-200 bg-sky-50/40 text-sky-950' },
  { badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', panel: 'border-emerald-200 bg-emerald-50/40 text-emerald-950' },
  { badge: 'border-violet-200 bg-violet-50 text-violet-700', panel: 'border-violet-200 bg-violet-50/40 text-violet-950' },
  { badge: 'border-teal-200 bg-teal-50 text-teal-700', panel: 'border-teal-200 bg-teal-50/40 text-teal-950' },
  { badge: 'border-rose-200 bg-rose-50 text-rose-700', panel: 'border-rose-200 bg-rose-50/40 text-rose-950' },
  { badge: 'border-amber-200 bg-amber-50 text-amber-700', panel: 'border-amber-200 bg-amber-50/40 text-amber-950' },
  { badge: 'border-indigo-200 bg-indigo-50 text-indigo-700', panel: 'border-indigo-200 bg-indigo-50/40 text-indigo-950' },
  { badge: 'border-lime-200 bg-lime-50 text-lime-700', panel: 'border-lime-200 bg-lime-50/40 text-lime-950' },
  { badge: 'border-cyan-200 bg-cyan-50 text-cyan-700', panel: 'border-cyan-200 bg-cyan-50/40 text-cyan-950' },
] as const

export type TeamTheme = (typeof TEAM_THEME_PALETTE)[number]

/**
 * Stable team-specific themes.
 *
 * NOTE: This mapping is intentionally explicit to keep team colors consistent
 * across steps and dialogs (e.g. SMM stays the same color everywhere).
 */
export const TEAM_THEME_BY_TEAM: Record<Team, TeamTheme> = {
  // Keep SMM as light blue per product preference.
  SMM: TEAM_THEME_PALETTE[0],
  FO: TEAM_THEME_PALETTE[1],
  SFM: TEAM_THEME_PALETTE[2],
  CPPC: TEAM_THEME_PALETTE[3],
  MC: TEAM_THEME_PALETTE[4],
  GMC: TEAM_THEME_PALETTE[5],
  NSM: TEAM_THEME_PALETTE[6],
  DRO: TEAM_THEME_PALETTE[7],
}

export function getTeamTheme(team: Team | null | undefined): TeamTheme {
  if (!team) return TEAM_THEME_PALETTE[8]
  return TEAM_THEME_BY_TEAM[team]
}

export function getTeamBadgeClass(team: Team | null | undefined): string {
  return getTeamTheme(team).badge
}


