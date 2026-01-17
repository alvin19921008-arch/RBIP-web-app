import type { Weekday } from '@/types/staff'

/**
 * Date helpers used by the Schedule page.
 * IMPORTANT: These must preserve existing behavior (local timezone semantics).
 */

export function getWeekday(date: Date): Weekday {
  const day = date.getDay()
  const weekdayMap: { [key: number]: Weekday } = {
    1: 'mon',
    2: 'tue',
    3: 'wed',
    4: 'thu',
    5: 'fri',
  }
  return weekdayMap[day] || 'mon'
}

export function formatDateDDMMYYYY(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

/**
 * Local YYYY-MM-DD (used as stable schedule date key).
 * NOTE: Uses local date components to avoid timezone issues.
 */
export function formatDateForInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Alias for readability: schedule date key in local time.
 */
export function formatDateIsoLocal(date: Date): string {
  return formatDateForInput(date)
}

/**
 * Parse YYYY-MM-DD in local timezone.
 */
export function parseDateFromInput(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

