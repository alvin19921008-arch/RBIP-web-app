import { format, isWeekend, addDays, startOfWeek, isSameDay } from 'date-fns'

export function isWorkingDay(date: Date): boolean {
  return !isWeekend(date)
}

export function getNextWorkingDay(date: Date): Date {
  let nextDay = addDays(date, 1)
  while (!isWorkingDay(nextDay)) {
    nextDay = addDays(nextDay, 1)
  }
  return nextDay
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
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return format(dateObj, 'yyyy-MM-dd')
}

export function formatDateDisplay(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  return format(dateObj, 'MMM dd, yyyy')
}

