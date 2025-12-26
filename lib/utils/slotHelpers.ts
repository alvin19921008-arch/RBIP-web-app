export const SLOT_TIMES = {
  1: '09:00-10:30',
  2: '10:30-12:00',
  3: '13:30-15:00',
  4: '15:00-16:30',
} as const

export function getSlotTime(slot: number): string {
  return SLOT_TIMES[slot as keyof typeof SLOT_TIMES] || `Slot ${slot}`
}

export function getSlotLabel(slot: number): string {
  return getSlotTime(slot)
}

// Helper to format time range for display (e.g., "1030-1200")
export function formatTimeRange(timeRange: string): string {
  return timeRange.replace(/:/g, '').replace(/-/g, '-').replace(/\s/g, '')
}
