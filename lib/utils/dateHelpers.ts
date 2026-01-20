import { format, isWeekend, addDays, startOfWeek, isSameDay, parseISO } from 'date-fns'
import { isHongKongHoliday } from './hongKongHolidays'

export function isWorkingDay(date: Date): boolean {
  // Working day = Mon–Fri AND not a Hong Kong public holiday (including Sundays)
  if (isWeekend(date)) return false
  const { isHoliday } = isHongKongHoliday(date)
  return !isHoliday
}

export function getNextWorkingDay(date: Date): Date {
  let nextDay = addDays(date, 1)
  while (!isWorkingDay(nextDay)) {
    nextDay = addDays(nextDay, 1)
  }
  return nextDay
}

export function getPreviousWorkingDay(date: Date): Date {
  let prevDay = addDays(date, -1)
  while (!isWorkingDay(prevDay)) {
    prevDay = addDays(prevDay, -1)
  }
  return prevDay
}

export function getLast5WorkingDays(date: Date = new Date()): Date[] {
  const workingDays: Date[] = []
  let currentDate = new Date(date)
  
  while (workingDays.length < 5) {
    if (isWorkingDay(currentDate)) {
      workingDays.unshift(new Date(currentDate))
    }
    currentDate = addDays(currentDate, -1)
  }
  
  return workingDays
}

export function formatDate(date: Date | string): string {
  // IMPORTANT: `new Date('YYYY-MM-DD')` is interpreted as UTC, which can shift the day
  // depending on server timezone. Treat date-only strings as local dates.
  const dateObj =
    typeof date === 'string'
      ? /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? parseISO(date)
        : new Date(date)
      : date
  return format(dateObj, 'yyyy-MM-dd')
}

export function formatDateDisplay(date: Date | string): string {
  const dateObj =
    typeof date === 'string'
      ? /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? parseISO(date)
        : new Date(date)
      : date
  return format(dateObj, 'MMM dd, yyyy')
}

