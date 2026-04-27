import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { createClientComponentClient } from '@/lib/supabase/client'

type ScheduleCalendarDataParams = {
  supabase: ReturnType<typeof createClientComponentClient>
  calendarOpen: boolean
  copyWizardOpen: boolean
  copyMenuOpen: boolean
  selectedDate: Date
  scheduleLoadedForDate: string | null
}

export type ScheduleCalendarDataResult = {
  datesWithData: Set<string>
  setDatesWithData: Dispatch<SetStateAction<Set<string>>>
  datesWithDataLoading: boolean
  datesWithDataLoadedAtRef: MutableRefObject<number | null>
  holidays: Map<string, string>
  loadDatesWithData: (opts?: { force?: boolean }) => Promise<void>
}

export function useScheduleCalendarData({
  supabase,
  calendarOpen,
  copyWizardOpen,
  copyMenuOpen,
  selectedDate,
  scheduleLoadedForDate,
}: ScheduleCalendarDataParams): ScheduleCalendarDataResult {
  const [datesWithData, setDatesWithData] = useState<Set<string>>(new Set())
  const [datesWithDataLoading, setDatesWithDataLoading] = useState(false)
  const datesWithDataLoadedAtRef = useRef<number | null>(null)
  const datesWithDataInFlightRef = useRef<Promise<void> | null>(null)
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map())

  const loadDatesWithData = useCallback(async (opts?: { force?: boolean }): Promise<void> => {
    try {
      // Dot semantics (aligned with History page):
      // show dot only if the schedule has any saved allocation rows (therapist/PCA/bed).
      const now = Date.now()
      const lastLoadedAt = datesWithDataLoadedAtRef.current
      if (!opts?.force && lastLoadedAt && now - lastLoadedAt < 60_000) return
      if (datesWithDataInFlightRef.current) return await datesWithDataInFlightRef.current

      const inFlight = (async () => {
        setDatesWithDataLoading(true)

        const { data: scheduleData, error: scheduleError } = await supabase
          .from('daily_schedules')
          .select('id,date')
          .order('date', { ascending: false })

        if (scheduleError) {
          console.error('Error loading schedule dates:', scheduleError)
          return
        }

        const schedules = scheduleData ?? []
        const scheduleIds = schedules.map((s) => s.id).filter(Boolean)

        // If there are no schedules at all, clear dots.
        if (scheduleIds.length === 0) {
          setDatesWithData(new Set())
          datesWithDataLoadedAtRef.current = Date.now()
          return
        }

        // Chunk to avoid excessively long query strings for `.in(...)`.
        const chunkSize = 500
        const chunks: string[][] = []
        for (let i = 0; i < scheduleIds.length; i += chunkSize) {
          chunks.push(scheduleIds.slice(i, i + chunkSize))
        }

        const hasTherapist = new Set<string>()
        const hasPca = new Set<string>()
        const hasBed = new Set<string>()

        for (const ids of chunks) {
          const [therapistRes, pcaRes, bedRes] = await Promise.all([
            supabase.from('schedule_therapist_allocations').select('schedule_id').in('schedule_id', ids),
            supabase.from('schedule_pca_allocations').select('schedule_id').in('schedule_id', ids),
            supabase.from('schedule_bed_allocations').select('schedule_id').in('schedule_id', ids),
          ])
          ;(therapistRes.data || []).forEach((r) => {
            if (r?.schedule_id) hasTherapist.add(r.schedule_id)
          })
          ;(pcaRes.data || []).forEach((r) => {
            if (r?.schedule_id) hasPca.add(r.schedule_id)
          })
          ;(bedRes.data || []).forEach((r) => {
            if (r?.schedule_id) hasBed.add(r.schedule_id)
          })
        }

        const dotDates = schedules
          .filter((s) => hasTherapist.has(s.id) || hasPca.has(s.id) || hasBed.has(s.id))
          .map((s) => s.date)

        const dateSet = new Set<string>(dotDates)
        setDatesWithData(dateSet)
        datesWithDataLoadedAtRef.current = Date.now()
      })()

      datesWithDataInFlightRef.current = inFlight
      await inFlight
    } catch (error) {
      console.error('Error loading dates with data:', error)
    } finally {
      datesWithDataInFlightRef.current = null
      setDatesWithDataLoading(false)
    }
  }, [supabase])

  // Load holidays when calendar or copy wizard opens (reuses same CalendarGrid UI)
  useEffect(() => {
    if (!(calendarOpen || copyWizardOpen || copyMenuOpen)) return
    loadDatesWithData().catch(() => {})

    let cancelled = false
    void (async () => {
      const { getHongKongHolidays } = await import('@/lib/utils/hongKongHolidays')
      if (cancelled) return
      // Generate holidays for selected year and next year
      const baseYear = selectedDate.getFullYear()
      const holidaysMap = new Map<string, string>()
      const yearHolidays = getHongKongHolidays(baseYear)
      const nextYearHolidays = getHongKongHolidays(baseYear + 1)
      yearHolidays.forEach((value, key) => holidaysMap.set(key, value))
      nextYearHolidays.forEach((value, key) => holidaysMap.set(key, value))
      if (cancelled) return
      setHolidays(holidaysMap)
    })().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [calendarOpen, copyWizardOpen, copyMenuOpen, selectedDate, loadDatesWithData])

  // Background prefetch: after the main schedule finishes loading (cold-start critical path),
  // fetch calendar dots in idle time so the Copy menu doesn't flicker disabled->enabled.
  useEffect(() => {
    if (!scheduleLoadedForDate) return
    const now = Date.now()
    const lastLoadedAt = datesWithDataLoadedAtRef.current
    if (lastLoadedAt && now - lastLoadedAt < 60_000) return

    let cancelled = false
    const run = () => {
      if (cancelled) return
      loadDatesWithData().catch(() => {})
    }

    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 1200 })
      return () => {
        cancelled = true
        if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(id)
      }
    }

    const t = window.setTimeout(run, 250)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [scheduleLoadedForDate, loadDatesWithData])

  return {
    datesWithData,
    setDatesWithData,
    datesWithDataLoading,
    datesWithDataLoadedAtRef,
    holidays,
    loadDatesWithData,
  }
}
