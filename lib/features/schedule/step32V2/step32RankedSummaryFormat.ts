import { formatTimeRange, getSlotTime } from '@/lib/utils/slotHelpers'

/** Ordinal for rank position (1st, 2nd, …) — plan §0.1. */
export function formatStep32OrdinalSuffix(rank: number): string {
  if (rank === 1) return '1st'
  if (rank === 2) return '2nd'
  if (rank === 3) return '3rd'
  if (rank === 4) return '4th'
  return `${rank}th`
}

/** Dashboard-style phrase e.g. `1st rank`, `2nd rank`. */
export function formatStep32DashboardRankOrdinal(rank: number): string {
  return `${formatStep32OrdinalSuffix(rank)} rank`
}

export interface Step32RankedSlotRankMeta {
  slot: number
  rank: number
}

/**
 * One-line ranked summary: `1st rank: 1030-1200 · 2nd rank: 0900-1030` (plan §0.2).
 * Intervals use compact `formatTimeRange(getSlotTime(slot))`.
 */
export function formatStep32RankedSlotsSummaryLine(ranked: Step32RankedSlotRankMeta[]): string {
  if (ranked.length === 0) return ''
  const sorted = [...ranked].sort((a, b) => a.rank - b.rank)
  return sorted
    .map((row) => {
      const interval = formatTimeRange(getSlotTime(row.slot))
      return `${formatStep32DashboardRankOrdinal(row.rank)}: ${interval}`
    })
    .join(' · ')
}

/** Plan §0.3 — engine slot + interval, never bare `slot n`. */
export function formatStep32SlotLabelWithInterval(slot: number, interval?: string): string {
  const int = interval ?? formatTimeRange(getSlotTime(slot))
  return `Slot ${slot} (${int})`
}

/** Returns `1st rank` style phrase when [slot] is a dashboard-ranked slot, else null. */
export function getStep32DashboardRankOrdinalForSlot(
  rankedSlotsInDashboardOrder: number[],
  slot: number
): string | null {
  const idx = rankedSlotsInDashboardOrder.indexOf(slot)
  if (idx < 0) return null
  return formatStep32DashboardRankOrdinal(idx + 1)
}

export function buildStep32RankedMetaFromDashboardSlots(rankedSlotsInDashboardOrder: number[]): Step32RankedSlotRankMeta[] {
  return rankedSlotsInDashboardOrder.map((slot, index) => ({ slot, rank: index + 1 }))
}

/** Convenience for `Step32TeamReview.rankedChoices` (slot + rank). */
export function formatStep32RankedSlotsSummaryLineFromChoices(
  rankedChoices: Array<{ slot: number; rank: number }>
): string | null {
  if (!rankedChoices.length) return null
  return formatStep32RankedSlotsSummaryLine(
    rankedChoices.map((c) => ({ slot: c.slot, rank: c.rank }))
  )
}
