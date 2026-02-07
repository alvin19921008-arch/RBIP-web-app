import { HK_PUBLIC_HOLIDAYS_BY_YEAR } from './hongKongHolidayData'

// Cache computed year maps (YYYY-MM-DD -> holiday name) to avoid recomputation.
const yearHolidayCache = new Map<number, Map<string, string>>()

/**
 * Get Hong Kong public holidays for a given year
 * Returns a Map of date strings (YYYY-MM-DD) to holiday names
 */
export function getHongKongHolidays(year: number): Map<string, string> {
  const cached = yearHolidayCache.get(year)
  if (cached) return cached

  const holidays = new Map<string, string>()

  const yearHolidayData = HK_PUBLIC_HOLIDAYS_BY_YEAR[year] ?? {}
  Object.entries(yearHolidayData).forEach(([dateStr, name]) => {
    holidays.set(dateStr, name)
  })
  
  // Also add all Sundays for the year
  const startDate = new Date(year, 0, 1)
  const endDate = new Date(year, 11, 31)
  
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    if (date.getDay() === 0) { // Sunday
      const dateStr = formatDateString(date)
      if (!holidays.has(dateStr)) {
        holidays.set(dateStr, 'Sunday')
      }
    }
  }
  
  yearHolidayCache.set(year, holidays)
  return holidays
}

/**
 * Check if a date is a Hong Kong public holiday or Sunday
 */
export function isHongKongHoliday(date: Date): { isHoliday: boolean; name?: string } {
  // Check if it's a Sunday
  if (date.getDay() === 0) {
    return { isHoliday: true, name: 'Sunday' }
  }
  
  // Check if it's a public holiday
  const yearHolidayData = HK_PUBLIC_HOLIDAYS_BY_YEAR[date.getFullYear()]
  if (yearHolidayData) {
    const dateStr = formatDateString(date)
    const name = yearHolidayData[dateStr]
    if (name) {
      return { isHoliday: true, name }
    }
  }
  
  return { isHoliday: false }
}

/**
 * Format date as YYYY-MM-DD string
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
