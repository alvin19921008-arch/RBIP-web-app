import { Team } from '@/types/staff'
import { Users, GitMerge } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { TEAMS } from '@/lib/utils/types'
import { cn } from '@/lib/utils'

export type TeamMergeStatus = {
  type: 'standalone' | 'main' | 'merged-away'
  mainTeam?: Team
  contributingTeams?: Team[]
}

export function computeMergedIntoMap(
  teamSettings: Array<{ team: Team; merged_into?: Team | null }>
): Partial<Record<Team, Team>> {
  const out: Partial<Record<Team, Team>> = {}
  teamSettings.forEach((row) => {
    if (row.merged_into && row.merged_into !== row.team) {
      out[row.team] = row.merged_into
    }
  })
  return out
}

export function getContributingTeams(
  mainTeam: Team,
  mergedIntoMap: Partial<Record<Team, Team>>
): Team[] {
  return TEAMS.filter((t) => mergedIntoMap[t] === mainTeam)
}

export function getTeamMergeStatus(
  team: Team,
  mergedIntoMap: Partial<Record<Team, Team>>
): TeamMergeStatus {
  const mergedInto = mergedIntoMap[team]
  if (mergedInto) {
    return { type: 'merged-away', mainTeam: mergedInto }
  }
  const contributing = getContributingTeams(team, mergedIntoMap)
  if (contributing.length > 0) {
    return { type: 'main', contributingTeams: contributing }
  }
  return { type: 'standalone' }
}

export function computeDisplayNames(
  teamSettings: Array<{ team: Team; display_name?: string | null }>
): Partial<Record<Team, string>> {
  const out: Partial<Record<Team, string>> = {}
  teamSettings.forEach((row) => {
    out[row.team] = row.display_name || row.team
  })
  TEAMS.forEach((team) => {
    if (!out[team]) out[team] = team
  })
  return out
}

interface TeamMergeBadgeProps {
  mergeStatus: TeamMergeStatus
  displayNames: Partial<Record<Team, string>>
  variant?: 'default' | 'compact'
}

export function TeamMergeBadge({ 
  mergeStatus, 
  displayNames,
  variant = 'default'
}: TeamMergeBadgeProps) {
  if (mergeStatus.type === 'merged-away' && mergeStatus.mainTeam) {
    const mainTeamDisplayName = displayNames[mergeStatus.mainTeam] || mergeStatus.mainTeam

    return (
      <Badge 
        variant="outline" 
        className={cn(
          "text-[10px] px-1.5 py-0 font-normal text-muted-foreground flex items-center gap-1",
          variant === 'compact' && "bg-muted/40"
        )}
        title={`Merged into: ${mainTeamDisplayName}`}
      >
        <GitMerge className="w-3 h-3" />
        {variant === 'compact' ? `→ ${mainTeamDisplayName}` : `Merged into ${mainTeamDisplayName}`}
      </Badge>
    )
  }

  if (mergeStatus.type === 'main' && mergeStatus.contributingTeams && mergeStatus.contributingTeams.length > 0) {
    const contributingLabel = mergeStatus.contributingTeams.map(t => displayNames[t] || t).join(', ')

    return (
      <Badge 
        variant="outline" 
        className={cn(
          "text-[10px] px-1.5 py-0 font-normal text-muted-foreground flex items-center gap-1",
          variant === 'compact' && "bg-muted/40"
        )}
        title={`Merged with: ${contributingLabel}`}
      >
        <Users className="w-3 h-3" />
        +{contributingLabel}
      </Badge>
    )
  }

  return null
}
