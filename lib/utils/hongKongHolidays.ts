import Holidays from 'date-holidays'

/**
 * Get Hong Kong public holidays for a given year
 * Returns a Map of date strings (YYYY-MM-DD) to holiday names
 */
export function getHongKongHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>()
  const hk = new Holidays('HK')
  
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
  
  return holidays
}

/**
 * Check if a date is a Hong Kong public holiday or Sunday
 */
export function isHongKongHoliday(date: Date): { isHoliday: boolean; name?: string } {
  const hk = new Holidays('HK')
  
  // Check if it's a Sunday
  if (date.getDay() === 0) {
    return { isHoliday: true, name: 'Sunday' }
  }
  
  // Check if it's a public holiday
  const holiday = hk.isHoliday(date)
  if (holiday) {
    return { isHoliday: true, name: holiday.name }
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
