'use client'

import { AlertCircle, CheckCircle2, Circle, XCircle } from 'lucide-react'
import type { Team } from '@/types/staff'
import type { Step32TeamReview } from '@/lib/features/schedule/step32V2/step32PreferredReviewModel'
import { getStep32LaneLabel } from '@/lib/features/schedule/step32V2/step32PreferredReviewCopy'
import { rbipStep32 } from '@/lib/design/rbipDesignTokens'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface Step32PreferredReviewLaneProps {
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

function getReviewTone(reviewState: Step32TeamReview['reviewState']): string | null {
  if (reviewState === 'matched') return null
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

/** Semantic stroke colors (Lucide `currentColor`) — not tied to Step 3.2 amber shell tokens. */
function getLaneStatusIconClass(reviewState: Step32TeamReview['reviewState']): string {
  if (reviewState === 'matched') return 'text-emerald-600 dark:text-emerald-400'
  if (reviewState === 'alternative') return 'text-amber-600 dark:text-amber-400'
  if (reviewState === 'unavailable') return 'text-rose-600 dark:text-rose-400'
  return 'text-muted-foreground'
}

export function Step32PreferredReviewLane({
  teamOrder,
  teamReviews,
  selectedTeam,
  onSelectTeam,
  registerTeamButtonRef,
}: Step32PreferredReviewLaneProps) {
  const needsAttentionCount = teamOrder.filter((team) => {
    const review = teamReviews[team]
    if (!review?.reviewApplies) return false
    return review.reviewState === 'alternative' || review.reviewState === 'unavailable'
  }).length

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
                    reviewState === 'matched' ? rbipStep32.laneChipMatched : getReviewTone(reviewState),
                    isSelected && rbipStep32.laneChipSelected
                  )}
                  aria-pressed={isSelected}
                >
                  <div className="text-[11px] text-muted-foreground">{getOrderLabel(index + 1)}</div>
                  <div className="font-semibold text-foreground">{team}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium leading-4">
                    <StatusIcon
                      className={cn('h-3.5 w-3.5 flex-shrink-0', getLaneStatusIconClass(reviewState))}
                      aria-hidden
                    />
                    <span className="text-foreground">{getStep32LaneLabel(reviewState)}</span>
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
