'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReadonlyURLSearchParams } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkflowState } from '@/types/schedule'
import { parseDateFromInput } from '@/lib/features/schedule/date'
import { getMostRecentDirtyScheduleDate } from '@/lib/utils/scheduleDraftCache'
import { hasMeaningfulStep1Overrides } from '@/lib/utils/staffOverridesMeaningful'
import { useScheduleDateParam } from '@/lib/hooks/useScheduleDateParam'

export const LAST_OPEN_SCHEDULE_DATE_KEY = 'rbip_last_open_schedule_date'

type BeginDate = (d: Date, o: { resetLoadedForDate: boolean }) => void

/**
 * Resolves the first active date (URL, dirty draft, session “last open”, today vs latest Step-1 date),
 * then keeps `?date` and controller selection aligned via `useScheduleDateParam`.
 */
export function useScheduleInitialDateResolution(args: {
  supabase: SupabaseClient
  searchParams: ReadonlyURLSearchParams
  selectedDate: Date
  toDateKey: (d: Date) => string
  controllerBeginDateTransition: BeginDate
  isScheduleCompletedToStep4: (w: WorkflowState | null | undefined) => boolean
}): { initialDateResolved: boolean } {
  const { supabase, searchParams, selectedDate, toDateKey, controllerBeginDateTransition, isScheduleCompletedToStep4 } = args

  const [initialDateResolved, setInitialDateResolved] = useState(false)
  const initialDateResolutionStartedRef = useRef(false)

  useEffect(() => {
    if (initialDateResolutionStartedRef.current) return
    initialDateResolutionStartedRef.current = true

    let cancelled = false

    const resolve = async () => {
      try {
        const dateParam = searchParams.get('date')
        if (dateParam) {
          try {
            const parsed = parseDateFromInput(dateParam)
            controllerBeginDateTransition(parsed, { resetLoadedForDate: true })
          } catch (e) {
            console.warn('Invalid ?date= param; falling back to auto date selection.', e)
          } finally {
            if (!cancelled) setInitialDateResolved(true)
          }
          return
        }

        const recentDirty = getMostRecentDirtyScheduleDate()
        if (recentDirty?.dateStr) {
          try {
            const parsed = parseDateFromInput(recentDirty.dateStr)
            controllerBeginDateTransition(parsed, { resetLoadedForDate: true })
            if (!cancelled) setInitialDateResolved(true)
            return
          } catch {
            // Ignore malformed pointer and continue normal fallback resolution.
          }
        }

        const findLastMeaningfulStep1ScheduleDateKey = async (): Promise<string | null> => {
          const res = await supabase
            .from('daily_schedules')
            .select('date,staff_overrides')
            .order('date', { ascending: false })
            .limit(180)
          if (res.error) return null
          const rows = (res.data || []) as Array<{ date?: string; staff_overrides?: unknown }>
          for (const row of rows) {
            if (typeof row?.date !== 'string') continue
            if (hasMeaningfulStep1Overrides(row.staff_overrides)) return row.date
          }
          return null
        }

        const stored =
          typeof window !== 'undefined' ? window.sessionStorage.getItem(LAST_OPEN_SCHEDULE_DATE_KEY) : null
        if (stored) {
          try {
            parseDateFromInput(stored)
            const storedRes = await supabase
              .from('daily_schedules')
              .select('id,staff_overrides')
              .eq('date', stored)
              .maybeSingle()
            const storedRow = storedRes.data
            const storedExists = typeof storedRow?.id === 'string' && storedRow.id.length > 0
            const storedIsMeaningful = hasMeaningfulStep1Overrides(storedRow?.staff_overrides)

            if (storedExists && storedIsMeaningful) {
              const parsed = parseDateFromInput(stored)
              controllerBeginDateTransition(parsed, { resetLoadedForDate: true })
              if (!cancelled) setInitialDateResolved(true)
              return
            }

            if (typeof window !== 'undefined') {
              window.sessionStorage.removeItem(LAST_OPEN_SCHEDULE_DATE_KEY)
            }
          } catch (e) {
            console.warn('Invalid stored last-open schedule date; falling back to auto date selection.', e)
            if (typeof window !== 'undefined') {
              window.sessionStorage.removeItem(LAST_OPEN_SCHEDULE_DATE_KEY)
            }
          }
        }

        const today = new Date()
        const todayKey = toDateKey(today)

        const todayRes = await supabase
          .from('daily_schedules')
          .select('id,date,workflow_state,staff_overrides')
          .eq('date', todayKey)
          .maybeSingle()

        const todayRow = todayRes.data
        const todayScheduleId = typeof todayRow?.id === 'string' ? todayRow.id : undefined
        const todayWorkflow = (todayRow?.workflow_state as WorkflowState | null | undefined) ?? null
        const todayOverrides = todayRow?.staff_overrides

        const scheduleHasAnyAllocations = async (scheduleId: string): Promise<boolean> => {
          try {
            const [tRes, pRes, bRes] = await Promise.all([
              supabase.from('schedule_therapist_allocations').select('id').eq('schedule_id', scheduleId).limit(1),
              supabase.from('schedule_pca_allocations').select('id').eq('schedule_id', scheduleId).limit(1),
              supabase.from('schedule_bed_allocations').select('id').eq('schedule_id', scheduleId).limit(1),
            ])
            if (tRes.error || pRes.error || bRes.error) return true
            return (
              ((tRes.data?.length ?? 0) > 0) || ((pRes.data?.length ?? 0) > 0) || ((bRes.data?.length ?? 0) > 0)
            )
          } catch {
            return true
          }
        }

        let initialDate: Date = today

        if (todayScheduleId) {
          const hasSavedRows = await scheduleHasAnyAllocations(todayScheduleId)
          const hasProgress =
            isScheduleCompletedToStep4(todayWorkflow) ||
            ((todayWorkflow?.completedSteps || [])?.length ?? 0) > 0 ||
            hasMeaningfulStep1Overrides(todayOverrides)
          if (!hasSavedRows && !hasProgress) {
            const lastMeaningfulKey = await findLastMeaningfulStep1ScheduleDateKey()
            if (lastMeaningfulKey) {
              try {
                initialDate = parseDateFromInput(lastMeaningfulKey)
              } catch {
                initialDate = today
              }
            }
          }
        } else {
          const lastMeaningfulKey = await findLastMeaningfulStep1ScheduleDateKey()
          if (lastMeaningfulKey) {
            try {
              initialDate = parseDateFromInput(lastMeaningfulKey)
            } catch {
              initialDate = today
            }
          }
        }

        if (cancelled) return
        controllerBeginDateTransition(initialDate, { resetLoadedForDate: true })
        setInitialDateResolved(true)
      } catch (e) {
        console.error('Failed to resolve initial schedule date:', e)
        if (cancelled) return
        setInitialDateResolved(true)
      }
    }

    resolve()
    return () => {
      cancelled = true
      initialDateResolutionStartedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!initialDateResolved) return
    try {
      if (typeof window === 'undefined') return
      window.sessionStorage.setItem(LAST_OPEN_SCHEDULE_DATE_KEY, toDateKey(selectedDate))
    } catch {
      // ignore
    }
  }, [initialDateResolved, selectedDate, toDateKey])

  useScheduleDateParam({
    searchParams,
    selectedDate,
    setSelectedDate: (d) => controllerBeginDateTransition(d, { resetLoadedForDate: true }),
  })

  return { initialDateResolved }
}
