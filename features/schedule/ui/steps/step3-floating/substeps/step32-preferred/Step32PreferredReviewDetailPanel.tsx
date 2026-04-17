'use client'

import { Fragment, useId, useMemo, type RefObject } from 'react'
import { AlertTriangle, CircleCheck } from 'lucide-react'
import type {
  Step32OutcomeOption,
  Step32PathOption,
  Step32PreferredAvailability,
  Step32TeamReview,
} from '@/lib/features/schedule/step32V2/step32PreferredReviewModel'
import {
  type Step32SaveDecisionUi,
  getStep32CombinedReservationGroupHeading,
  getStep32LeaveOpenFor34ChoiceLabel,
  getStep32OutcomeSectionHeading,
  getStep32PcaChangeStepHelper,
  getStep32PcaFillSectionHeading,
  getStep32PcaSelectAllocatorGroupLabel,
  getStep32PcaSelectAriaLabel,
  getStep32PcaSelectPlaceholder,
  getStep32PreferredAvailabilityLabel,
  getStep32PreferredPcaContextLabel,
  getStep32RankedSlotsContextLabel,
  getStep32ReservedFor34RowPrefix,
  getStep32ReservedOtherSlotsDisclaimer,
  getStep32SaveDecisionHelperStaleCommit,
  getStep32SaveDecisionHelperUnsetNoCommit,
  getStep32SaveDecisionSectionHeading,
  getStep32SaveHintPlaceholder,
  getStep32SaveIfYouPressSaveReservationHintFor34,
  getStep32SaveLeaveOpenStep34Explainer,
  getStep32SaveReservesOnlyHintFor34,
  getStep32SaveSelectedOutcomeLabel,
  getStep32SuggestedOutcomeBadgeLabel,
  getStep32ContinuityTradeoffBannerMessage,
  getTradeoffMessage,
} from '@/lib/features/schedule/step32V2/step32PreferredReviewCopy'
import { formatStep32RankedSlotsSummaryLineFromChoices } from '@/lib/features/schedule/step32V2/step32RankedSummaryFormat'
import { rbipStep32 } from '@/lib/design/rbipDesignTokens'
import { Step3V2LaneDetailShell } from '../../components/step3-v2-lane-detail-shell/Step3V2LaneDetailShell'
import type { SlotAssignment } from '@/lib/utils/reservationLogic'
import { cn } from '@/lib/utils'
import { getSlotTime } from '@/lib/utils/slotHelpers'
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
  /** Whether §3 shows neither / Leave open / Save as visually selected (see Step 3.2 tri-state save intent). */
  saveDecisionUi: Step32SaveDecisionUi
}

function getOrderLabel(position: number): string {
  if (position === 1) return '1st'
  if (position === 2) return '2nd'
  if (position === 3) return '3rd'
  return `${position}th`
}

function resolveDefaultPcaLabelForOutcome(review: Step32TeamReview, outcome: Step32OutcomeOption): string | null {
  const path = review.pathOptions.find((p) => p.pathKey === outcome.primaryPathKey) ?? null
  if (!path) return null
  const id =
    path.systemSuggestedPcaId ??
    path.preferredCandidates[0]?.id ??
    path.floorCandidates[0]?.id ??
    path.nonFloorCandidates[0]?.id ??
    null
  if (!id) return null
  const entry = [...path.preferredCandidates, ...path.floorCandidates, ...path.nonFloorCandidates].find(
    (candidate) => candidate.id === id
  )
  return entry?.name ?? path.systemSuggestedPcaName ?? review.recommendedPcaName ?? id
}

function getPreferredAvailabilityIconClass(availability: Step32PreferredAvailability): string {
  if (availability === 'rank-1') return 'text-emerald-600 dark:text-emerald-400'
  if (availability === 'unavailable') return 'text-rose-600 dark:text-rose-400'
  return 'text-amber-600 dark:text-amber-400'
}

function getPathCandidateGroups(path: Step32PathOption | null) {
  return [
    { key: 'preferred', label: 'Preferred', candidates: path?.preferredCandidates ?? [] },
    { key: 'floor', label: 'Floor', candidates: path?.floorCandidates ?? [] },
    { key: 'non_floor', label: 'Non-floor', candidates: path?.nonFloorCandidates ?? [] },
  ] as const
}

function OutcomeTitleParts(props: {
  highlight: 'preferred_pca' | 'floor_pca'
  locationPhrase: string
}) {
  const highlightClass =
    props.highlight === 'preferred_pca'
      ? rbipStep32.titleHighlightPreferred
      : rbipStep32.titleHighlightFloor
  const label = props.highlight === 'preferred_pca' ? 'Preferred PCA' : 'Floor PCA'
  return (
    <div className="pr-16 text-sm font-semibold leading-snug text-foreground">
      <span className={cn(rbipStep32.titleHighlight, highlightClass)}>{label}</span>
      <span>{` on ${props.locationPhrase}`}</span>
    </div>
  )
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
  saveDecisionUi,
}: Step32PreferredReviewDetailPanelProps) {
  const reservationGroupTitleId = useId()
  const saveHintId = useId()
  const pcaSectionLabelId = useId()

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
  const rankedSummaryLine = useMemo(
    () => formatStep32RankedSlotsSummaryLineFromChoices(review.rankedChoices),
    [review.rankedChoices]
  )

  const currentSelectionIsCommitted = Boolean(
    committedAssignment &&
      selectedPath &&
      resolvedSelectedPcaId &&
      committedAssignment.slot === selectedPath.slot &&
      committedAssignment.pcaId === resolvedSelectedPcaId
  )
  const staleCommit = Boolean(committedAssignment) && !currentSelectionIsCommitted
  const leaveOpenChoiceSelected = saveDecisionUi === 'leave_open'
  const saveChoiceSelected = saveDecisionUi === 'committed'

  const step32ChoiceButtonBase = cn(
    rbipStep32.focusable,
    'inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-left text-sm font-medium text-foreground transition-colors',
    rbipStep32.choiceIdleHover,
    'hover:bg-muted/40 focus-visible:outline-none',
    'disabled:pointer-events-none disabled:opacity-50'
  )

  const showSuggestedBadge = review.outcomeOptions.length === 2

  const reservedInterval =
    selectedOutcome?.reservedPreview.intervalDisplay ??
    selectedPath?.timeRange?.replace(/:/g, '').replace(/\s/g, '') ??
    ''

  return (
    <Step3V2LaneDetailShell
      theme="preferred"
      detailPanelRef={detailPanelRef}
      beakCenterX={beakCenterX}
      className="space-y-4 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className={rbipStep32.detailHeading}>
            {`${review.team} · ${getOrderLabel(queuePosition)} in order`}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Pending floating {review.pending.toFixed(2)} · Assigned floating {assignedFloatingFte.toFixed(2)}
          </div>
        </div>
        <div className={rbipStep32.statusPill}>
          {review.reviewState === 'matched'
            ? 'Matched'
            : review.reviewState === 'alternative'
              ? 'Alt path'
              : review.reviewState === 'unavailable'
                ? 'Unavailable'
                : 'No review'}
        </div>
      </div>

      <div className="space-y-3 text-sm">
        {rankedSummaryLine ? (
          <div>
            <div className={rbipStep32.contextLabel}>{getStep32RankedSlotsContextLabel()}</div>
            <div className="mt-1 text-muted-foreground">{rankedSummaryLine}</div>
          </div>
        ) : null}

        <div>
          <div className={rbipStep32.contextLabel}>{getStep32PreferredPcaContextLabel()}</div>
          <div className="mt-2 space-y-2">
            {review.preferredPcaStatuses?.length ? (
              review.preferredPcaStatuses.map((entry) => {
                const ok = entry.availability === 'rank-1'
                const Icon = ok ? CircleCheck : AlertTriangle
                const iconClass = getPreferredAvailabilityIconClass(entry.availability)
                return (
                  <div key={entry.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{entry.name}</span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Icon className={cn('h-4 w-4 shrink-0', iconClass)} aria-hidden />
                      {entry.availability === 'unavailable'
                        ? entry.detail
                        : getStep32PreferredAvailabilityLabel(entry.availability)}
                    </span>
                  </div>
                )
              })
            ) : review.preferredPcaIds.length > 0 ? (
              <div className="text-muted-foreground">
                {review.preferredPcaIds
                  .map((pcaId) => review.preferredPcaNames[pcaId] ?? pcaId)
                  .join(' · ')}
              </div>
            ) : (
              <div className="text-muted-foreground">None</div>
            )}
          </div>
        </div>
      </div>

      <div role="group" aria-labelledby={reservationGroupTitleId} className={rbipStep32.combinedSurface}>
        <div id={reservationGroupTitleId} className="sr-only">
          {getStep32CombinedReservationGroupHeading()}
        </div>
        <div
          className={cn(
            rbipStep32.combinedGrid,
            saveDecisionUi === 'leave_open' && 'opacity-[0.55] saturate-[0.65] transition-opacity'
          )}
        >
          <div className="min-w-0 space-y-3 p-3 md:p-4">
            <div className={rbipStep32.sectionHeading}>{getStep32OutcomeSectionHeading()}</div>
            {review.outcomeOptions.length > 0 ? (
              <div className="flex flex-col gap-3" role="radiogroup" aria-label={getStep32OutcomeSectionHeading()}>
                {review.outcomeOptions.map((outcome) => {
                  const isSelected = selectedOutcome?.outcomeKey === outcome.outcomeKey
                  const defaultPcaLabel = resolveDefaultPcaLabelForOutcome(review, outcome)
                  const reservedPcaPreview = isSelected
                    ? selectedPcaName ?? defaultPcaLabel
                    : defaultPcaLabel
                  return (
                    <button
                      key={outcome.outcomeKey}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      data-selected={isSelected ? 'true' : 'false'}
                      onClick={() => onSelectOutcome(outcome.outcomeKey)}
                      className={rbipStep32.outcomeCard}
                    >
                      {showSuggestedBadge && outcome.isSystemRecommended ? (
                        <span className={rbipStep32.suggestedBadge}>{getStep32SuggestedOutcomeBadgeLabel()}</span>
                      ) : null}
                      <OutcomeTitleParts
                        highlight={outcome.titleHighlight}
                        locationPhrase={outcome.titleLocationPhrase}
                      />
                      <div className="mt-2 overflow-hidden rounded-md border border-border">
                        <div className={rbipStep32.reservedRow}>
                          <span className="font-medium text-muted-foreground">{`${getStep32ReservedFor34RowPrefix()} · `}</span>
                          <span className="tabular-nums text-muted-foreground">{outcome.reservedPreview.intervalDisplay}</span>
                          <span className="text-muted-foreground"> · </span>
                          <span className="font-semibold">{reservedPcaPreview ?? '—'}</span>
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                        {getStep32ReservedOtherSlotsDisclaimer()}
                      </p>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No outcome choices for this team.</div>
            )}
            {selectedOutcome?.commitState === 'committable_with_tradeoff' ? (
              <div className="rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
                {selectedOutcome.tradeoffKind === 'continuity' || selectedOutcome.tradeoffKind === undefined
                  ? getStep32ContinuityTradeoffBannerMessage({
                      firstRankedIntervalDisplay:
                        review.rankedChoices[0]?.slot != null
                          ? getSlotTime(review.rankedChoices[0].slot)
                          : '—',
                      preferredPcaName:
                        selectedOutcome.rows[1]?.pcaLabel ??
                        (review.preferredPcaIds[0]
                          ? (review.preferredPcaNames[review.preferredPcaIds[0]] ?? review.preferredPcaIds[0])
                          : 'this PCA'),
                    })
                  : getTradeoffMessage(selectedOutcome.tradeoffKind ?? 'other')}
              </div>
            ) : null}
          </div>

          <div className="min-w-0 space-y-3 p-3 md:p-4">
            <div id={pcaSectionLabelId} className={rbipStep32.sectionHeading}>
              {getStep32PcaFillSectionHeading()}
            </div>
            <div className="space-y-3 text-sm">
              {candidateGroups.some((group) => group.candidates.length > 0) ? (
                hasSelectablePca ? (
                  <div className="space-y-2">
                    <Select value={pcaSelectValue} onValueChange={onSelectPca}>
                      <SelectTrigger
                        className="h-10 w-full"
                        aria-label={getStep32PcaSelectAriaLabel()}
                        aria-labelledby={pcaSectionLabelId}
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
      </div>

      <div className={rbipStep32.savePanel}>
        <div className={rbipStep32.saveHeading}>{getStep32SaveDecisionSectionHeading()}</div>
        <p id={saveHintId} className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {saveDecisionUi === 'leave_open'
            ? getStep32SaveLeaveOpenStep34Explainer()
            : saveDecisionUi === 'committed' && currentSelectionIsCommitted && selectedPcaName && reservedInterval
              ? getStep32SaveReservesOnlyHintFor34({ pcaName: selectedPcaName, interval: reservedInterval })
              : saveDecisionUi === 'unset' && selectedPcaName && reservedInterval
                ? getStep32SaveIfYouPressSaveReservationHintFor34({
                    pcaName: selectedPcaName,
                    interval: reservedInterval,
                  })
                : getStep32SaveHintPlaceholder()}
        </p>
        <div
          className="mt-3 flex flex-wrap gap-2"
          role="group"
          aria-label={getStep32SaveDecisionSectionHeading()}
        >
          <button
            type="button"
            className={cn(
              step32ChoiceButtonBase,
              leaveOpenChoiceSelected ? rbipStep32.choiceSelected : null
            )}
            aria-pressed={leaveOpenChoiceSelected}
            onClick={onLeaveOpen}
          >
            {getStep32LeaveOpenFor34ChoiceLabel()}
          </button>
          <button
            type="button"
            className={cn(step32ChoiceButtonBase, saveChoiceSelected ? rbipStep32.choiceSelected : null)}
            aria-pressed={saveChoiceSelected}
            aria-describedby={saveHintId}
            disabled={!canCommit}
            onClick={onCommit}
          >
            {getStep32SaveSelectedOutcomeLabel()}
          </button>
        </div>
        {staleCommit ? (
          <div className="mt-3 text-xs text-amber-900 dark:text-amber-100">
            {getStep32SaveDecisionHelperStaleCommit()}
          </div>
        ) : saveDecisionUi === 'unset' && !committedAssignment && !(selectedPcaName && reservedInterval) ? (
          <div className="mt-3 text-xs text-muted-foreground">{getStep32SaveDecisionHelperUnsetNoCommit()}</div>
        ) : null}
      </div>
    </Step3V2LaneDetailShell>
  )
}
