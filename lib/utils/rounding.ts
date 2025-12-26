export function roundToNearest(value: number, nearest: number = 1): number {
  return Math.round(value / nearest) * nearest
}

export function roundToNearestQuarter(value: number): number {
  return roundToNearest(value, 0.25)
}

export function roundToNearestInteger(value: number): number {
  return Math.round(value)
}

export function roundUp(value: number): number {
  return Math.ceil(value)
}

export function roundDown(value: number): number {
  return Math.floor(value)
}

/**
 * Rounds DOWN to the nearest 0.25 interval
 * Examples: 0.6 → 0.5, 0.65 → 0.5, 0.7 → 0.5, 0.75 → 0.75
 * Used for PCA FTE calculations where slots are 0.25 FTE each
 */
export function roundDownToQuarter(value: number): number {
  return Math.floor(value / 0.25) * 0.25
}

/**
 * Rounds to the nearest 0.25 increment using strict inequality with midpoint
 * Rules:
 * - Determine the 0.25 interval the value falls into
 * - Calculate midpoint = (lower + upper) / 2
 * - If value > midpoint: round up to upper bound
 * - If value < midpoint: round down to lower bound
 * - If value == midpoint: round down (since we use > not >=)
 * 
 * Examples:
 * - 1.03 → 1.0 (1.03 < 1.125, midpoint of 1.0-1.25)
 * - 1.15 → 1.25 (1.15 > 1.125)
 * - 0.96 → 1.0 (0.96 > 0.875, midpoint of 0.75-1.0)
 * - 0.75 → 0.75 (already at 0.25 increment)
 * - 0.6 → 0.5 (0.6 < 0.625, midpoint of 0.5-0.75)
 * - 0.83 → 0.75 (0.83 < 0.875, midpoint of 0.75-1.0)
 * - 0.1 → 0.0 (0.1 < 0.125, midpoint of 0.0-0.25)
 */
export function roundToNearestQuarterWithMidpoint(value: number): number {
  // Handle negative values (round to nearest quarter)
  if (value < 0) {
    return -roundToNearestQuarterWithMidpoint(-value)
  }
  
  // Find which 0.25 interval the value falls into
  const lower = Math.floor(value / 0.25) * 0.25
  const upper = lower + 0.25
  const midpoint = (lower + upper) / 2
  
  // Use strict inequality: > rounds up, <= rounds down
  if (value > midpoint) {
    return upper
  } else {
    return lower
  }
}

/**
 * Format FTE for display:
 * - If FTE = 0.25, show 2 decimal places (0.25)
 * - If FTE has 1 decimal place (0.6, 0.7, 0.3), show 1 decimal place (0.6, not 0.60)
 * - Otherwise, show appropriate decimal places
 */
export function formatFTE(fte: number): string {
  // Check if it's exactly 0.25 (or very close)
  if (Math.abs(fte - 0.25) < 0.001) {
    return '0.25'
  }
  
  // Check if it's a single decimal place value (0.1, 0.2, ..., 0.9)
  const rounded = Math.round(fte * 10) / 10
  if (Math.abs(fte - rounded) < 0.001) {
    return rounded.toFixed(1)
  }
  
  // Otherwise, show 2 decimal places
  return fte.toFixed(2)
}

