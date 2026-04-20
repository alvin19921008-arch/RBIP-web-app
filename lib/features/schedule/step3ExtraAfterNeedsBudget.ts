import { seededShuffle } from '@/lib/utils/seededRandom'
import { createEmptyTeamRecord } from '@/lib/utils/types'
import type { Team } from '@/types/staff'

const Q = 0.25

export type TeamBalanceSummary = {
  overAssignedSum: number
  underAssignedSum: number
  net: number
  perTeamText: string
  balanceByTeam: Record<Team, number>
}

export type Step31ExtraAfterNeedsBudget = {
  neededSlots: number
  poolSpareSlots: number
  qualifyingExtraSlotsFromAggregate: number
  extraBudgetSlots: number
  balanceAfterRoundedNeedsByTeam: Record<Team, number>
  balanceSummary: TeamBalanceSummary
  recipientsPreview: Array<{ team: Team; before: number; after: number }>
}

export function buildTeamBalanceSummary(args: {
  teams: Team[]
  balanceByTeam: Record<Team, number>
}): TeamBalanceSummary {
  let overAssignedSum = 0
  let underAssignedSum = 0
  for (const team of args.teams) {
    const bal = args.balanceByTeam[team] ?? 0
    if (bal > 0) overAssignedSum += bal
    if (bal < 0) underAssignedSum += Math.abs(bal)
  }
  const perTeamText = args.teams
    .map((team) => {
      const v = args.balanceByTeam[team] ?? 0
      return `${team} ${v >= 0 ? '+' : ''}${v.toFixed(2)}`
    })
    .join(' | ')

  return {
    overAssignedSum,
    underAssignedSum,
    net: overAssignedSum - underAssignedSum,
    perTeamText,
    balanceByTeam: { ...args.balanceByTeam },
  }
}

function buildRecipientsPreview(args: {
  teams: Team[]
  balanceByTeam: Record<Team, number>
  extraBudgetSlots: number
  tieBreakSeed: string
  previewLimit: number
}): Array<{ team: Team; before: number; after: number }> {
  const preview: Array<{ team: Team; before: number; after: number }> = []
  const remainingUnder = createEmptyTeamRecord<number>(0)
  for (const team of args.teams) {
    const bal = args.balanceByTeam[team] ?? 0
    remainingUnder[team] = Math.max(0, -bal)
  }

  let tieCursor = 0
  for (let i = 0; i < Math.min(args.extraBudgetSlots, args.previewLimit); i += 1) {
    let maxUnder = 0
    for (const team of args.teams) {
      maxUnder = Math.max(maxUnder, remainingUnder[team] ?? 0)
    }
    if (maxUnder <= 1e-12) break

    const tied = args.teams.filter((t) => Math.abs((remainingUnder[t] ?? 0) - maxUnder) < 1e-9)
    const tieOrder = seededShuffle(tied, `${args.tieBreakSeed}|tie:${i}`)
    const winner = tieOrder[tieCursor % tieOrder.length]!
    tieCursor += 1

    const before = args.balanceByTeam[winner] ?? 0
    const after = before + Q
    preview.push({ team: winner, before, after })
    remainingUnder[winner] = Math.max(0, (remainingUnder[winner] ?? 0) - Q)
  }
  return preview
}

export function computeStep31ExtraAfterNeedsBudget(args: {
  teams: Team[]
  avgByTeam: Record<Team, number>
  existingAssignedFteByTeam: Record<Team, number>
  pendingFloatingFteByTeam: Record<Team, number>
  availableFloatingSlots: number
  tieBreakSeed: string
  previewLimit?: number
}): Step31ExtraAfterNeedsBudget {
  const balanceByTeam = createEmptyTeamRecord<number>(0)
  let neededSlots = 0

  for (const team of args.teams) {
    const avg = args.avgByTeam[team] ?? 0
    const existing = args.existingAssignedFteByTeam[team] ?? 0
    const pending = args.pendingFloatingFteByTeam[team] ?? 0
    neededSlots += Math.round((pending + 1e-9) / Q)
    const assignedAfterRoundedNeeds = existing + pending
    balanceByTeam[team] = assignedAfterRoundedNeeds - avg
  }

  const poolSpareSlots = Math.max(0, args.availableFloatingSlots - neededSlots)
  const balanceSummary = buildTeamBalanceSummary({ teams: args.teams, balanceByTeam })
  const qualifyingExtraSlotsFromAggregate = Math.floor(balanceSummary.underAssignedSum / Q + 1e-9)
  const extraBudgetSlots = Math.min(poolSpareSlots, qualifyingExtraSlotsFromAggregate)

  const recipientsPreview = buildRecipientsPreview({
    teams: args.teams,
    balanceByTeam,
    extraBudgetSlots,
    tieBreakSeed: args.tieBreakSeed,
    previewLimit: args.previewLimit ?? 3,
  })

  return {
    neededSlots,
    poolSpareSlots,
    qualifyingExtraSlotsFromAggregate,
    extraBudgetSlots,
    balanceAfterRoundedNeedsByTeam: balanceByTeam,
    balanceSummary,
    recipientsPreview,
  }
}
