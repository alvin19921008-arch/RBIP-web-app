import { Weekday } from '@/types/staff'

export interface ScheduleHistoryEntry {
  id: string
  date: string // YYYY-MM-DD
  weekday: Weekday
  weekdayName: string
  hasTherapistAllocations: boolean
  hasPCAAllocations: boolean
  hasBedAllocations: boolean
  completionStatus: 'complete' | 'step3.2' | 'step2' | 'step1'
}

export interface MonthGroup {
  year: number
  month: number
  monthName: string // e.g., "Dec 2025"
  schedules: ScheduleHistoryEntry[]
}

/**
 * Get weekday from date
 */
export function getWeekday(date: Date): Weekday {
  const day = date.getDay()
  const weekdayMap: { [key: number]: Weekday } = {
    1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri'
  }
  return weekdayMap[day] || 'mon'
}

/**
 * Get weekday display name
 */
export function getWeekdayName(weekday: Weekday): string {
  const names: Record<Weekday, string> = {
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri'
  }
  return names[weekday]
}

/**
 * Format month name (e.g., "Dec 2025")
 */
export function formatMonthName(year: number, month: number): string {
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ]
  return `${monthNames[month]} ${year}`
}

/**
 * Determine completion status based on allocation data
 */
export function getCompletionStatus(
  hasTherapist: boolean,
  hasPCA: boolean,
  hasBed: boolean
): ScheduleHistoryEntry['completionStatus'] {
  if (hasTherapist && hasPCA && hasBed) {
    return 'complete'
  } else if (hasTherapist && hasPCA) {
    return 'step3.2'
  } else if (hasTherapist) {
    return 'step2'
  } else {
    return 'step1'
  }
}

/**
 * Group schedules by month and sort
 * Latest months first, latest dates within month first
 */
export function groupSchedulesByMonth(
  schedules: ScheduleHistoryEntry[]
): MonthGroup[] {
  // Group by year-month
  const monthMap = new Map<string, ScheduleHistoryEntry[]>()
  
  for (const schedule of schedules) {
    const date = new Date(schedule.date)
    const year = date.getFullYear()
    const month = date.getMonth()
    const key = `${year}-${month}`
    
    if (!monthMap.has(key)) {
      monthMap.set(key, [])
    }
    monthMap.get(key)!.push(schedule)
  }
  
  // Convert to MonthGroup array
  const monthGroups: MonthGroup[] = []
  
  for (const [key, scheduleList] of monthMap.entries()) {
    const [yearStr, monthStr] = key.split('-')
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10)
    
    // Sort schedules within month: latest first
    scheduleList.sort((a, b) => {
      const dateA = new Date(a.date)
      const dateB = new Date(b.date)
      return dateB.getTime() - dateA.getTime()
    })
    
    monthGroups.push({
      year,
      month,
      monthName: formatMonthName(year, month),
      schedules: scheduleList
    })
  }
  
  // Sort months: latest year-month first
  monthGroups.sort((a, b) => {
    if (a.year !== b.year) {
      return b.year - a.year // Latest year first
    }
    return b.month - a.month // Latest month first
  })
  
  return monthGroups
}
