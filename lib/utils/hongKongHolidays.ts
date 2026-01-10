import Holidays from 'date-holidays'

// date-holidays instantiation is relatively expensive; reuse a single instance.
const hk = new Holidays('HK')

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
  
  // Get all holidays for the year
  const yearHolidays = hk.getHolidays(year)
  
  for (const holiday of yearHolidays) {
    // Format date as YYYY-MM-DD
    const date = new Date(holiday.date)
    const dateStr = formatDateString(date)
    holidays.set(dateStr, holiday.name)
  }
  
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
  const holiday = hk.isHoliday(date)
  if (holiday) {
    // In date-holidays typings, a truthy result is an array of holidays for that date.
    const name = holiday.map(h => h.name).join(', ')
    return { isHoliday: true, name }
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
