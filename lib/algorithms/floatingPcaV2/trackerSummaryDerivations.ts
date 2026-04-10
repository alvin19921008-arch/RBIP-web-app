/**
 * Ranked-slot Step 3.4 (V2) tracker summary derivations.
 *
 * These fields depend on V2 assignment log shape (`fulfilledSlotRank`, `slotSelectionPhase`,
 * `pcaSelectionTier`). Legacy / standard floating allocation does not emit them consistently;
 * call `finalizeTrackerSummary()` from shared helpers first, then this for V2-ranked flows only.
 */

import type { AllocationTracker } from '@/types/schedule'
import { finalizeTrackerSummary, TEAMS } from '@/lib/utils/floatingPCAHelpers'

/**
 * Derive ranked-slot-specific summary flags from Step 3.4 assignment logs.
 * Must run after `finalizeTrackerSummary()` so shared fields (duplicate-floating, base AM/PM) stay canonical.
 */
export function applyRankedSlotStep34TrackerSummaryFields(tracker: AllocationTracker): void {
  for (const team of TEAMS) {
    const teamLog = tracker[team]

    const rankedFulfilled = teamLog.assignments
      .map((assignment) => assignment.fulfilledSlotRank)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
    teamLog.summary.highestRankedSlotFulfilled =
      rankedFulfilled.length > 0 ? Math.min(...rankedFulfilled) : null

    teamLog.summary.usedUnrankedSlot = teamLog.assignments.some(
      (assignment) => assignment.slotSelectionPhase === 'unranked-unused'
    )

    teamLog.summary.gymUsedAsLastResort = teamLog.assignments.some(
      (assignment) => assignment.slotSelectionPhase === 'gym-last-resort'
    )

    const tierPreferred = teamLog.assignments.some((assignment) => assignment.pcaSelectionTier === 'preferred')
    teamLog.summary.preferredPCAUsed = teamLog.summary.preferredPCAUsed || tierPreferred
  }
}

/** Shared finalize + ranked V2 derivations (use for full ranked-slot Step 3.4 tracker builds). */
export function finalizeRankedSlotFloatingTracker(tracker: AllocationTracker): void {
  finalizeTrackerSummary(tracker)
  applyRankedSlotStep34TrackerSummaryFields(tracker)
}
