'use client'

import { useMemo, useState, type RefObject } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type {
  Step32PathOption,
  Step32TeamReview,
} from '@/lib/features/schedule/step32V2/step32PreferredReviewModel'
import {
  getStep32SaveDecisionTitle,
  getStep32SaveSelectedOutcomeLabel,
  getTradeoffMessage,
} from '@/lib/features/schedule/step32V2/step32PreferredReviewCopy'
import type { SlotAssignment } from '@/lib/utils/reservationLogic'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface Step32PreferredReviewDetailPanelProps {
  /** Step 1 panel root — used to position the lane→detail beak in viewport space. */
  detailPanelRef?: RefObject<HTMLDivElement | null>
  beakCenterX?: number | null
  review: Step32TeamReview
  queuePosition: number
  selectedOutcomeKey: string | null
  onSelectOutcome: (outcomeKey: string) => void
  selectedPcaId: string | null
  onSelectPca: (pcaId: string) => void
  committedAssignment: SlotAssignment | null
  onCommit: () => void
  onLeaveOpen: () => void
  onClearCommit: () => void
}

function getOrderLabel(position: number): string {
  if (position === 1) return '1st'
  if (position === 2) return '2nd'
  if (position === 3) return '3rd'
  return `${position}th`
}

function getSlotTime(slot: number): string {
  if (slot === 1) return '0900-1030'
  if (slot === 2) return '1030-1200'
  if (slot === 3) return '1330-1500'
  return '1500-1630'
}

function getOutcomeRowSlotKindLabel(review: Step32TeamReview, slot: 1 | 2 | 3 | 4): string {
  const ranked = review.rankedChoices.find((choice) => choice.slot === slot)
  if (ranked) return `#${ranked.rank}`
  if (review.gymChoice?.slot === slot) return 'Gym'
  if (review.unrankedChoices.some((choice) => choice.slot === slot)) return 'Unranked'
  return '—'
}

function getPathCandidateGroups(path: Step32PathOption | null) {
  return [
    { key: 'preferred', label: 'Preferred', candidates: path?.preferredCandidates ?? [] },
    { key: 'floor', label: 'Floor', candidates: path?.floorCandidates ?? [] },
    { key: 'non_floor', label: 'Non-floor', candidates: path?.nonFloorCandidates ?? [] },
  ] as const
}

export function Step32PreferredReviewDetailPanel({
  detailPanelRef,
  beakCenterX,
  review,
  queuePosition,
  selectedOutcomeKey,
  onSelectOutcome,
  selectedPcaId,
  onSelectPca,
  committedAssignment,
  onCommit,
  onLeaveOpen,
  onClearCommit,
}: Step32PreferredReviewDetailPanelProps) {
  const [showAllCandidates, setShowAllCandidates] = useState(false)
  const selectedOutcome =
    review.outcomeOptions.find((option) => option.outcomeKey === selectedOutcomeKey) ??
    review.outcomeOptions[0] ??
    null

  const selectedPath = useMemo(() => {
    if (!selectedOutcome) return review.pathOptions[0] ?? null
    return (
      review.pathOptions.find((path) => path.pathKey === selectedOutcome.primaryPathKey) ??
      review.pathOptions[0] ??
      null
    )
  }, [review.pathOptions, selectedOutcome])

  const resolvedSelectedPcaId =
    selectedPcaId ??
    selectedPath?.systemSuggestedPcaId ??
    selectedPath?.preferredCandidates[0]?.id ??
    selectedPath?.floorCandidates[0]?.id ??
    selectedPath?.nonFloorCandidates[0]?.id ??
    null

  const selectedPcaName = useMemo(() => {
    if (!resolvedSelectedPcaId || !selectedPath) return null
    const candidate = [
      ...selectedPath.preferredCandidates,
      ...selectedPath.floorCandidates,
      ...selectedPath.nonFloorCandidates,
    ].find((entry) => entry.id === resolvedSelectedPcaId)
    return candidate?.name ?? selectedPath.systemSuggestedPcaName ?? review.recommendedPcaName ?? null
  }, [resolvedSelectedPcaId, review.recommendedPcaName, selectedPath])

  const canCommit = Boolean(selectedOutcome && selectedPath && resolvedSelectedPcaId && selectedPcaName)
  const candidateGroups = getPathCandidateGroups(selectedPath)
  const rankedChoicesSummary = useMemo(() => {
    if (!review.rankedChoices || review.rankedChoices.length === 0) return null
    const sorted = [...review.rankedChoices].sort((a, b) => a.rank - b.rank)
    return sorted
      .map((choice) => `#${choice.rank} ${getSlotTime(choice.slot)} (slot ${choice.slot})`)
      .join(' · ')
  }, [review.rankedChoices])

  const currentSelectionIsCommitted = Boolean(
    committedAssignment &&
      selectedPath &&
      resolvedSelectedPcaId &&
      committedAssignment.slot === selectedPath.slot &&
      committedAssignment.pcaId === resolvedSelectedPcaId
  )
  const commitButtonLabel = currentSelectionIsCommitted
    ? 'Saved'
    : getStep32SaveSelectedOutcomeLabel()

  const outcomeScrollPeek = review.outcomeOptions.length >= 2

  return (
    <div
      ref={detailPanelRef}
      className="relative space-y-4 rounded-2xl border border-sky-200 bg-sky-50/40 p-4 shadow-sm dark:border-sky-900/50 dark:bg-sky-950/10"
    >
      <div
        className="pointer-events-none absolute -top-1 z-10 h-4 w-4 -translate-x-1/2 rotate-45 border-l border-t border-sky-200 bg-sky-50/80 dark:border-sky-800 dark:bg-sky-950/40"
        style={{ left: beakCenterX ?? 32 }}
        aria-hidden
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-sky-950 dark:text-sky-50">
            {`${review.team} · ${getOrderLabel(queuePosition)} in order`}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Pending {review.pending.toFixed(2)} · Assigned {review.assignedSoFar.toFixed(2)}
          </div>
        </div>
        <div className="rounded-full border border-sky-300 bg-white px-3 py-1 text-xs font-medium text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-50">
          {review.reviewState === 'matched'
            ? 'Matched'
            : review.reviewState === 'alternative'
              ? 'Alt path'
              : review.reviewState === 'unavailable'
                ? 'Unavailable'
                : 'No review'}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <div className="min-w-0 rounded-xl border border-sky-200/80 bg-white/90 p-3 shadow-sm dark:border-sky-900/40 dark:bg-sky-950/25">
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-900/80 dark:text-sky-100/80">
            1. Choose an outcome
          </div>
          <div className="space-y-1 border-t border-sky-200/70 pt-3 text-sm text-muted-foreground dark:border-sky-900/50">
            <div>
              {`Preferred PCA list: ${
                review.preferredPcaIds.length > 0
                  ? review.preferredPcaIds.map((pcaId) => review.preferredPcaNames[pcaId] ?? pcaId).join(' · ')
                  : 'None'
              }`}
            </div>
            {rankedChoicesSummary ? <div>{`Ranked slots: ${rankedChoicesSummary}`}</div> : null}
          </div>
          {review.outcomeOptions.length > 0 ? (
            <div className="mt-3 w-full min-w-0 overflow-x-auto overflow-y-visible">
              <div className="flex flex-nowrap gap-3">
                {review.outcomeOptions.map((outcome) => {
                  const isSelected = selectedOutcome?.outcomeKey === outcome.outcomeKey
                  const sortedRows = [...outcome.rows].sort((a, b) => a.slot - b.slot)
                  return (
                    <button
                      key={outcome.outcomeKey}
                      type="button"
                      onClick={() => onSelectOutcome(outcome.outcomeKey)}
                      className={cn(
                        'rounded-xl border bg-white p-3 text-left shadow-sm transition-colors dark:bg-slate-950/40',
                        outcomeScrollPeek ? 'min-w-[calc(100%-3rem)] shrink-0' : 'w-full shrink-0',
                        isSelected
                          ? 'border-sky-500 ring-2 ring-sky-500/30'
                          : 'border-border hover:border-sky-300'
                      )}
                    >
                      <div className="text-sm font-semibold text-foreground">{outcome.title}</div>
                      <div className="mt-2 inline-grid w-max max-w-[min(28rem,100%)] grid-cols-[minmax(0,4.5rem)_auto_auto] gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {sortedRows.flatMap((row) => {
                          const rk = `${outcome.outcomeKey}-${row.slot}`
                          return [
                            <span key={`${rk}-rank`} className="min-w-0 truncate font-medium text-foreground/85">
                              {getOutcomeRowSlotKindLabel(review, row.slot)}
                            </span>,
                            <span key={`${rk}-time`} className="shrink-0 whitespace-nowrap tabular-nums">
                              {row.timeRange.trim().length > 0 ? row.timeRange : getSlotTime(row.slot)}
                            </span>,
                            <span key={`${rk}-pca`} className="min-w-0 max-w-[11rem] truncate text-foreground/90">
                              {row.pcaLabel}
                            </span>,
                          ]
                        })}
                      </div>
                      <div className="mt-3 space-y-0.5 text-[11px] leading-4 text-foreground/80">
                        {outcome.summaryLines.map((line) => (
                          <div key={`${outcome.outcomeKey}-${line}`}>{line}</div>
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-muted-foreground">No outcome choices for this team.</div>
          )}
          {selectedOutcome?.commitState === 'committable_with_tradeoff' ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
              {getTradeoffMessage(selectedOutcome.tradeoffKind ?? 'other')}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 rounded-xl border border-border/70 bg-muted/15 p-3 dark:border-border/50 dark:bg-muted/10">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            2. Change PCA only if needed
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 rounded-lg border border-dashed border-muted-foreground/25 px-3 py-2">
              <div className="text-sm text-foreground">
                {`Suggested PCA: ${selectedPcaName ?? 'None'}`}
              </div>
              <div className="text-xs text-muted-foreground">Other candidates stay hidden until requested.</div>
            </div>
          </div>
          <div className="mt-3 space-y-4 text-sm">
            {candidateGroups.some((group) => group.candidates.length > 0) ? (
              <>
                {selectedPath?.systemSuggestedPcaId ? (
                  <button
                    type="button"
                    onClick={() => onSelectPca(selectedPath.systemSuggestedPcaId as string)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      resolvedSelectedPcaId === selectedPath.systemSuggestedPcaId
                        ? 'border-sky-500/80 bg-sky-50/80 text-sky-950 dark:bg-sky-950/30 dark:text-sky-50'
                        : 'border-border/80 bg-background/80 hover:border-sky-300/60'
                    )}
                  >
                    <span className="font-medium">
                      {selectedPath.systemSuggestedPcaName ?? selectedPath.systemSuggestedPcaId}
                    </span>
                    <span className="text-xs text-muted-foreground">Allocator pick</span>
                  </button>
                ) : null}

                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllCandidates((prev) => !prev)}
                    className="h-8 px-2 text-[11px] text-muted-foreground"
                  >
                    {showAllCandidates ? 'Hide other candidates' : 'Show other candidates'}
                  </Button>
                </div>

                {showAllCandidates ? (
                  <div className="space-y-4">
                    {candidateGroups.map((group) => {
                      const candidates = group.candidates.filter(
                        (candidate) => candidate.id !== selectedPath?.systemSuggestedPcaId
                      )
                      if (candidates.length === 0) return null
                      return (
                        <div key={group.key} className="space-y-2">
                          <div className="text-[11px] font-medium text-muted-foreground">{group.label}</div>
                          <div className="space-y-2">
                            {candidates.map((candidate) => {
                              const isSelected = resolvedSelectedPcaId === candidate.id
                              return (
                                <button
                                  key={candidate.id}
                                  type="button"
                                  onClick={() => onSelectPca(candidate.id)}
                                  className={cn(
                                    'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                                    isSelected
                                      ? 'border-sky-500/80 bg-sky-50/80 text-sky-950 dark:bg-sky-950/30 dark:text-sky-50'
                                      : 'border-border/80 bg-background/80 hover:border-sky-300/60'
                                  )}
                                >
                                  <span className="font-medium">{candidate.name}</span>
                                  <span className="text-xs text-muted-foreground">{group.label.toLowerCase()}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No candidates available.</div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-sky-200/80 bg-white/80 p-3 dark:border-sky-900/40 dark:bg-sky-950/20">
        <div className="text-xs font-semibold uppercase tracking-wide text-sky-900/80 dark:text-sky-100/80">
          3. {getStep32SaveDecisionTitle()}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={onCommit}
            disabled={!canCommit || currentSelectionIsCommitted}
            variant={currentSelectionIsCommitted ? 'secondary' : 'default'}
          >
            {currentSelectionIsCommitted ? (
              <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
            ) : null}
            {commitButtonLabel}
          </Button>
          <Button type="button" variant="outline" onClick={onLeaveOpen} disabled={!committedAssignment}>
            {committedAssignment ? 'Leave open for Step 3.4' : 'Already open for Step 3.4'}
          </Button>
          {committedAssignment ? (
            <Button type="button" variant="ghost" onClick={onClearCommit}>
              Clear saved decision
            </Button>
          ) : null}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          {committedAssignment
            ? `Saved ${committedAssignment.pcaName} to slot ${committedAssignment.slot} for ${committedAssignment.team}.`
            : 'Open for Step 3.4 (nothing saved yet).'}
        </div>
      </div>
    </div>
  )
}
