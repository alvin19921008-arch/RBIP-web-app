'use client'

import { Fragment, useMemo, type RefObject } from 'react'
import type {
  Step32PathOption,
  Step32TeamReview,
} from '@/lib/features/schedule/step32V2/step32PreferredReviewModel'
import {
  getStep32LeaveOpenFor34ChoiceLabel,
  getStep32PcaChangeStepHelper,
  getStep32PcaSelectAllocatorGroupLabel,
  getStep32PcaSelectAriaLabel,
  getStep32PcaSelectLabel,
  getStep32PcaSelectPlaceholder,
  getStep32PreferredAvailabilityLabel,
  getStep32SaveDecisionHelperLeaveOpenNoSave,
  getStep32SaveDecisionHelperSavedReservation,
  getStep32SaveDecisionHelperStaleCommit,
  getStep32SaveDecisionTitle,
  getStep32SaveSelectedOutcomeLabel,
  getStep32SaveSlotOnlyNearActionLabel,
  getTradeoffMessage,
} from '@/lib/features/schedule/step32V2/step32PreferredReviewCopy'
import type { SlotAssignment } from '@/lib/utils/reservationLogic'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Step32PreferredReviewDetailPanelProps {
  /** Step 1 panel root — used to position the lane→detail beak in viewport space. */
  detailPanelRef?: RefObject<HTMLDivElement | null>
  beakCenterX?: number | null
  review: Step32TeamReview
  /** Floating PCA FTE committed in Steps 3.2–3.4 for this team (same basis as Step 3.3/3.4 badges). */
  assignedFloatingFte: number
  queuePosition: number
  selectedOutcomeKey: string | null
  onSelectOutcome: (outcomeKey: string) => void
  selectedPcaId: string | null
  onSelectPca: (pcaId: string) => void
  committedAssignment: SlotAssignment | null
  onCommit: () => void
  onLeaveOpen: () => void
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
  assignedFloatingFte,
  queuePosition,
  selectedOutcomeKey,
  onSelectOutcome,
  selectedPcaId,
  onSelectPca,
  committedAssignment,
  onCommit,
  onLeaveOpen,
}: Step32PreferredReviewDetailPanelProps) {
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

  const otherCandidateGroups = useMemo(() => {
    const suggestedId = selectedPath?.systemSuggestedPcaId ?? null
    return getPathCandidateGroups(selectedPath)
      .map((group) => ({
        key: group.key,
        label: group.label,
        candidates: group.candidates.filter((candidate) => candidate.id !== suggestedId),
      }))
      .filter((group) => group.candidates.length > 0)
  }, [selectedPath])

  const selectablePcaIdSet = useMemo(() => {
    const next = new Set<string>()
    const suggestedId = selectedPath?.systemSuggestedPcaId
    if (suggestedId) next.add(suggestedId)
    for (const group of otherCandidateGroups) {
      for (const candidate of group.candidates) {
        next.add(candidate.id)
      }
    }
    return next
  }, [otherCandidateGroups, selectedPath?.systemSuggestedPcaId])

  const pcaSelectValue =
    resolvedSelectedPcaId != null && selectablePcaIdSet.has(resolvedSelectedPcaId)
      ? resolvedSelectedPcaId
      : undefined

  const hasSelectablePca = selectablePcaIdSet.size > 0
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
  const staleCommit =
    Boolean(committedAssignment) && !currentSelectionIsCommitted
  const leaveOpenChoiceSelected = !committedAssignment
  const saveChoiceSelected = currentSelectionIsCommitted

  const step32ChoiceButtonClass = cn(
    'inline-flex min-h-10 items-center justify-center rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50'
  )

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
            Pending floating {review.pending.toFixed(2)} · Assigned floating {assignedFloatingFte.toFixed(2)}
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
            <div className="space-y-1">
              <div className="text-xs font-medium text-foreground">Preferred PCA</div>
              {review.preferredPcaStatuses?.length ? (
                review.preferredPcaStatuses.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
                  >
                    <span className="font-medium text-foreground">{entry.name}</span>
                    <span className="rounded-full border border-sky-200/80 bg-white/90 px-2 py-0.5 text-[11px] text-foreground dark:border-sky-800/60 dark:bg-sky-950/40">
                      {getStep32PreferredAvailabilityLabel(entry.availability)}
                    </span>
                    <span className="text-[11px]">{entry.detail}</span>
                  </div>
                ))
              ) : review.preferredPcaIds.length > 0 ? (
                <div className="text-sm text-muted-foreground">
                  {review.preferredPcaIds
                    .map((pcaId) => review.preferredPcaNames[pcaId] ?? pcaId)
                    .join(' · ')}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">None</div>
              )}
            </div>
            {rankedChoicesSummary ? <div>{`Ranked slots: ${rankedChoicesSummary}`}</div> : null}
          </div>
          {review.primaryScenario ? (
            <div className="mt-3 rounded-lg border border-sky-200/70 bg-sky-50/60 px-3 py-3 text-sm dark:border-sky-800/50 dark:bg-sky-950/30">
              <div className="font-medium text-foreground">{review.primaryScenario.rankProtectionLabel}</div>
              <div className="mt-1 text-muted-foreground">{review.primaryScenario.recommendedLabel}</div>
              {review.primaryScenario.preferredOutcomeLabel ? (
                <div className="mt-1 text-muted-foreground">{review.primaryScenario.preferredOutcomeLabel}</div>
              ) : null}
              <div className="mt-2 text-[11px] text-muted-foreground">{review.primaryScenario.saveEffect}</div>
            </div>
          ) : null}
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
          <div className="mt-3 space-y-4 text-sm">
            {candidateGroups.some((group) => group.candidates.length > 0) ? (
              hasSelectablePca ? (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    {getStep32PcaSelectLabel()}
                  </div>
                  <Select value={pcaSelectValue} onValueChange={onSelectPca}>
                    <SelectTrigger
                      className="h-10 w-full"
                      aria-label={getStep32PcaSelectAriaLabel()}
                    >
                      <SelectValue placeholder={getStep32PcaSelectPlaceholder()} />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={4} className="max-h-[min(280px,50vh)]">
                      {selectedPath?.systemSuggestedPcaId ? (
                        <>
                          <SelectGroup>
                            <SelectLabel>{getStep32PcaSelectAllocatorGroupLabel()}</SelectLabel>
                            <SelectItem value={selectedPath.systemSuggestedPcaId}>
                              {selectedPath.systemSuggestedPcaName ?? selectedPath.systemSuggestedPcaId}
                            </SelectItem>
                          </SelectGroup>
                          {otherCandidateGroups.length > 0 ? <SelectSeparator /> : null}
                        </>
                      ) : null}
                      {otherCandidateGroups.map((group, index) => (
                        <Fragment key={group.key}>
                          {index > 0 ? <SelectSeparator /> : null}
                          <SelectGroup>
                            <SelectLabel>{group.label}</SelectLabel>
                            {group.candidates.map((candidate) => (
                              <SelectItem key={candidate.id} value={candidate.id}>
                                {candidate.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </Fragment>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="rounded-lg border border-dashed border-muted-foreground/25 px-3 py-2 text-xs text-muted-foreground">
                    {getStep32PcaChangeStepHelper()}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No candidates available.</div>
              )
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
        <div
          className="mt-3 flex flex-wrap gap-2"
          role="group"
          aria-label={`${getStep32SaveDecisionTitle()} choices`}
        >
          <button
            type="button"
            className={cn(
              step32ChoiceButtonClass,
              leaveOpenChoiceSelected
                ? 'border-sky-500 bg-sky-50/90 text-sky-950 shadow-sm ring-1 ring-sky-500/25 dark:bg-sky-950/40 dark:text-sky-50 dark:ring-sky-400/20'
                : 'border-border bg-background text-foreground hover:border-sky-300/70 hover:bg-muted/40'
            )}
            aria-pressed={leaveOpenChoiceSelected}
            onClick={onLeaveOpen}
          >
            {getStep32LeaveOpenFor34ChoiceLabel()}
          </button>
          <button
            type="button"
            className={cn(
              step32ChoiceButtonClass,
              saveChoiceSelected
                ? 'border-sky-500 bg-sky-50/90 text-sky-950 shadow-sm ring-1 ring-sky-500/25 dark:bg-sky-950/40 dark:text-sky-50 dark:ring-sky-400/20'
                : 'border-border bg-background text-foreground hover:border-sky-300/70 hover:bg-muted/40'
            )}
            aria-pressed={saveChoiceSelected}
            disabled={!canCommit}
            onClick={onCommit}
          >
            {getStep32SaveSelectedOutcomeLabel()}
          </button>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">{getStep32SaveSlotOnlyNearActionLabel()}</div>
        <div
          className={cn(
            'mt-3 text-xs',
            staleCommit ? 'text-amber-900 dark:text-amber-100' : 'text-muted-foreground'
          )}
        >
          {staleCommit
            ? getStep32SaveDecisionHelperStaleCommit()
            : committedAssignment
              ? getStep32SaveDecisionHelperSavedReservation({
                  pcaName: committedAssignment.pcaName,
                  slot: committedAssignment.slot,
                  team: committedAssignment.team,
                })
              : getStep32SaveDecisionHelperLeaveOpenNoSave()}
        </div>
      </div>
    </div>
  )
}
