'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { isHongKongHoliday } from '@/lib/utils/hongKongHolidays'

interface CalendarGridProps {
  selectedDate: Date
  onDateSelect: (date: Date) => void
  datesWithData?: Set<string> // Set of date strings in YYYY-MM-DD format
  holidays?: Map<string, string> // Map of date strings to holiday names
  isDateDisabled?: (date: Date) => boolean
  emphasizeDatesWithData?: boolean
}

export function CalendarGrid({
  selectedDate,
  onDateSelect,
  datesWithData = new Set(),
  holidays = new Map(),
  isDateDisabled,
  emphasizeDatesWithData = false,
}: CalendarGridProps) {
  const [currentMonth, setCurrentMonth] = useState(selectedDate.getMonth())
  const [currentYear, setCurrentYear] = useState(selectedDate.getFullYear())

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Get first day of month and number of days
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay()

  // Get days from previous month to fill the grid
  const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate()
  const days: Array<{ day: number; isCurrentMonth: boolean; date: Date }> = []

  // Previous month days
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const date = new Date(currentYear, currentMonth - 1, prevMonthLastDay - i)
    days.push({ day: prevMonthLastDay - i, isCurrentMonth: false, date })
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(currentYear, currentMonth, day)
    days.push({ day, isCurrentMonth: true, date })
  }

  // Next month days to fill the grid (42 cells total for 6 rows)
  const remainingCells = 42 - days.length
  for (let day = 1; day <= remainingCells; day++) {
    const date = new Date(currentYear, currentMonth + 1, day)
    days.push({ day, isCurrentMonth: false, date })
  }

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(currentYear - 1)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
  }

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(currentYear + 1)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
  }

  const isSelectedDate = (date: Date) => {
    return date.getDate() === selectedDate.getDate() &&
           date.getMonth() === selectedDate.getMonth() &&
           date.getFullYear() === selectedDate.getFullYear()
  }

  const isToday = (date: Date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const checkDate = new Date(date)
    checkDate.setHours(0, 0, 0, 0)
    return checkDate.getTime() === today.getTime()
  }

  const isPast = (date: Date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const checkDate = new Date(date)
    checkDate.setHours(0, 0, 0, 0)
    return checkDate.getTime() < today.getTime()
  }

  const isFuture = (date: Date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const checkDate = new Date(date)
    checkDate.setHours(0, 0, 0, 0)
    return checkDate.getTime() > today.getTime()
  }

  const formatDateString = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const handleDateClick = (date: Date) => {
    if (isDateDisabled?.(date)) return
    onDateSelect(date)
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePrevMonth}
          className="h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-semibold">
          {monthNames[currentMonth]} {currentYear}
        </h3>
        <Button
          variant="outline"
          size="icon"
          onClick={handleNextMonth}
          className="h-8 w-8"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekdayNames.map((day, idx) => (
          <div
            key={day}
            className={`text-center text-sm font-medium text-muted-foreground p-2 ${
              idx === 0 || idx === 6 ? 'opacity-40' : ''
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map(({ day, isCurrentMonth, date }, index) => {
          const selected = isSelectedDate(date)
          const today = isToday(date)
          const past = isPast(date)
          const future = isFuture(date)
          const dateStr = formatDateString(date)
          const hasData = datesWithData.has(dateStr)
          const dayOfWeek = date.getDay()
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
          const holidayNameFromMap = holidays.get(dateStr)
          const hk = holidayNameFromMap ? null : isHongKongHoliday(date)
          const holidayName = holidayNameFromMap ?? (hk?.isHoliday ? hk.name : undefined)
          const isHoliday = !isWeekend && !!holidayName
          const disabled = isDateDisabled?.(date) ?? false
          
          // Build className for the button
          let buttonClasses = 'h-10 w-10 rounded-md text-sm transition-colors flex flex-col items-center justify-center'
          
          // Past/future styling
          if (past && !selected) {
            buttonClasses += ' opacity-60 text-muted-foreground/70'
          } else if (future && !selected) {
            buttonClasses += ' font-semibold text-foreground'
          }
          
          // Holiday styling (red text)
          if (isHoliday && !selected) {
            buttonClasses += ' text-red-600 dark:text-red-400 font-semibold'
          }
          
          // Current month styling
          if (!isCurrentMonth) {
            buttonClasses += ' text-muted-foreground/50'
          }
          
          // Selected date styling
          if (selected) {
            buttonClasses += ' bg-primary text-primary-foreground font-semibold'
          } else if (today && !selected) {
            buttonClasses += ' bg-accent font-semibold'
          } else if (isCurrentMonth && !selected) {
            buttonClasses += ' hover:bg-accent'
          }

          if (disabled && !selected) {
            buttonClasses += ' opacity-35 cursor-not-allowed hover:bg-transparent'
          }

          // Optional UI mode: emphasize dates that have data using regular foreground color
          // (used by snapshot picker so available dates are clearly visible/clickable).
          if (emphasizeDatesWithData && hasData && !disabled && !selected) {
            buttonClasses += ' text-foreground opacity-100'
          }
          
          // Wrap in Tooltip if it's a holiday
          if (isHoliday) {
            return (
              <div key={index} className="flex items-center justify-center">
                <Tooltip content={holidayName} side="top">
                  <button
                    onClick={() => handleDateClick(date)}
                    className={buttonClasses}
                    disabled={disabled}
                  >
                    <span>{day}</span>
                    {hasData && (
                      <span className="text-[8px] leading-none mt-0.5 text-primary">•</span>
                    )}
                  </button>
                </Tooltip>
              </div>
            )
          }
          
          return (
            <button
              key={index}
              onClick={() => handleDateClick(date)}
              className={buttonClasses}
              disabled={disabled}
            >
              <span>{day}</span>
              {hasData && (
                <span className="text-[8px] leading-none mt-0.5 text-primary">•</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

