'use client'

import { AlertCircle, CheckCircle2, Circle, XCircle } from 'lucide-react'
import type { Team } from '@/types/staff'
import type { Step32TeamReview } from '@/lib/features/schedule/step32V2/step32PreferredReviewModel'
import {
  getStep32LaneLabel,
  getStep32LegendItems,
  getStep32StatusHelpLabel,
} from '@/lib/features/schedule/step32V2/step32PreferredReviewCopy'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface Step32PreferredReviewLaneProps {
  gymRiskTeams?: Team[]
  teamOrder: Team[]
  teamReviews: Record<Team, Step32TeamReview>
  selectedTeam: Team | null
  onSelectTeam: (team: Team) => void
  /** Optional: register each lane chip button for layout measurement (e.g. Step 1 panel beak). */
  registerTeamButtonRef?: (team: Team, node: HTMLButtonElement | null) => void
}

function getOrderLabel(position: number): string {
  if (position === 1) return '1st'
  if (position === 2) return '2nd'
  if (position === 3) return '3rd'
  return `${position}th`
}

function getReviewTone(reviewState: Step32TeamReview['reviewState']): string {
  if (reviewState === 'matched') return 'border-emerald-300 bg-emerald-50/80 text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-50'
  if (reviewState === 'alternative') return 'border-amber-300 bg-amber-50/80 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-50'
  if (reviewState === 'unavailable') return 'border-rose-300 bg-rose-50/80 text-rose-950 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-50'
  return 'border-border bg-muted/20 text-muted-foreground'
}

function getStateIcon(reviewState: Step32TeamReview['reviewState']) {
  if (reviewState === 'matched') return CheckCircle2
  if (reviewState === 'alternative') return AlertCircle
  if (reviewState === 'unavailable') return XCircle
  return Circle
}

export function Step32PreferredReviewLane({
  gymRiskTeams,
  teamOrder,
  teamReviews,
  selectedTeam,
  onSelectTeam,
  registerTeamButtonRef,
}: Step32PreferredReviewLaneProps) {
  const matchedCount = teamOrder.filter((team) => teamReviews[team]?.reviewState === 'matched').length
  const unavailableCount = teamOrder.filter((team) => teamReviews[team]?.reviewState === 'unavailable').length
  const needsAttentionCount = teamOrder.filter((team) => {
    const review = teamReviews[team]
    if (!review?.reviewApplies) return false
    return review.reviewState === 'alternative' || review.reviewState === 'unavailable'
  }).length

  const legendItems = getStep32LegendItems()
  const statusHelpLabel = getStep32StatusHelpLabel()
  const showGymRisk = Array.isArray(gymRiskTeams) && gymRiskTeams.length > 0

  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Step 3.2 Preferred review</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Scan the lane, pick the highlighted team, then work downward through the numbered actions.
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 text-[11px] tabular-nums">
          {`Needs attention: ${needsAttentionCount}`}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[11px] tabular-nums">{`Matched ${matchedCount}`}</Badge>
        <Badge variant="outline" className="text-[11px] tabular-nums">{`Unavailable ${unavailableCount}`}</Badge>
        {showGymRisk ? (
          <Badge variant="outline" className="text-[11px]">
            {`Gym risk: ${gymRiskTeams?.join(' · ')}`}
          </Badge>
        ) : null}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'max-w-full text-left text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground'
              )}
            >
              {statusHelpLabel}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="z-[60] w-[min(360px,calc(100vw-2rem))] max-w-[360px] border-border bg-popover p-2 text-popover-foreground shadow-md"
            role="region"
            aria-label={statusHelpLabel}
          >
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-foreground">{statusHelpLabel}</div>
              <div className="space-y-1 text-[11px] text-muted-foreground">
                {legendItems.map((item) => {
                  const icon =
                    item.key === 'matched'
                      ? CheckCircle2
                      : item.key === 'alternative'
                        ? AlertCircle
                        : item.key === 'unavailable'
                          ? XCircle
                          : Circle
                  const Icon = icon
                  return (
                    <div key={item.key} className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>{item.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-4 flex justify-center border-t border-border/70 pt-3">
        <div className="max-w-full overflow-x-auto">
          <div className="inline-flex flex-nowrap items-center gap-2 py-1">
            {teamOrder.map((team, index) => {
              const reviewState = teamReviews[team]?.reviewState ?? 'not_applicable'
              const isSelected = selectedTeam === team
              const StatusIcon = getStateIcon(reviewState)

              return (
                <button
                  key={team}
                  type="button"
                  ref={(node) => {
                    registerTeamButtonRef?.(team, node)
                  }}
                  onClick={() => onSelectTeam(team)}
                  className={cn(
                    'min-w-[92px] rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                    getReviewTone(reviewState),
                    isSelected && 'ring-2 ring-sky-500 ring-offset-2 ring-offset-background'
                  )}
                  aria-pressed={isSelected}
                >
                  <div className="text-[11px] text-muted-foreground">{getOrderLabel(index + 1)}</div>
                  <div className="font-semibold">{team}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium leading-4">
                    <StatusIcon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                    <span>{getStep32LaneLabel(reviewState)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
