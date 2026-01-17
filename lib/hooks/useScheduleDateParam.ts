import { useEffect, useRef } from 'react'
import type { ReadonlyURLSearchParams } from 'next/navigation'
import { parseDateFromInput } from '@/lib/features/schedule/date'

/**
 * Schedule page: reads `?date=YYYY-MM-DD` and updates selected date.
 * Preserves the original behavior of depending only on `searchParams` (to avoid param/update loops),
 * while comparing against the latest `selectedDate` via a ref.
 */
export function useScheduleDateParam(args: {
  searchParams: ReadonlyURLSearchParams
  selectedDate: Date
  setSelectedDate: (d: Date) => void
}) {
  const { searchParams, selectedDate, setSelectedDate } = args
  const selectedDateRef = useRef<Date>(selectedDate)

  useEffect(() => {
    selectedDateRef.current = selectedDate
  }, [selectedDate])

  useEffect(() => {
    const dateParam = searchParams.get('date')

    if (dateParam) {
      try {
        const parsedDate = parseDateFromInput(dateParam)

        // Only update if the date is different to avoid loops
        if (parsedDate.getTime() !== selectedDateRef.current.getTime()) {
          setSelectedDate(parsedDate)
        }
      } catch (error) {
        console.error('Error parsing date from URL:', error)
      }
    }
  }, [searchParams, setSelectedDate])
}

