'use client'

import { useEffect } from 'react'

/**
 * Two `useScheduleController` instances (primary schedule + split reference) remain separate.
 * This module only shares **orchestration**: AbortController, `beginDateTransition` + `loadAndHydrateDate`,
 * optional `gridLoading` clear after load, and hydration exit timing — not merged controller state.
 *
 * Business rules: spec §7 item 6 (split reference: abort, hydration, stuck-skeleton), item 8 (copy/date nav).
 */

/** Cleanup in-flight `AbortController` on unmount (and expose ref for a pane’s date-load effect). */
export function useSchedulePaneInFlightAbortCleanup(
  inFlightAbortRef: React.MutableRefObject<AbortController | null>
) {
  useEffect(() => {
    return () => {
      inFlightAbortRef.current?.abort()
    }
  }, [inFlightAbortRef])
}

export type SchedulePaneHydrationEndMode = 'sync' | 'requestAnimationFrame'

/**
 * When loading has finished and `scheduleLoadedForDate` matches the target key, end `isHydratingSchedule`.
 * - `requestAnimationFrame`: used for the reference pane so work flushes after load-driven updates (stuck skeleton).
 * - `sync`: main schedule page (pairs with other hooks that assume hydration flag during the same commit window).
 */
export function useSchedulePaneHydrationEndEffect(input: {
  endMode: SchedulePaneHydrationEndMode
  /** If null, the effect is a no-op. */
  targetDateKey: string | null
  isHydratingSchedule: boolean
  loading: boolean
  scheduleLoadedForDate: string | null
  setIsHydratingSchedule: (next: boolean) => void
  /** Main pane only: matches legacy `SchedulePageContent` hydration exit dependencies. */
  mainPaneStaffLength?: number
  mainPaneHasLoadedStoredCalculations?: boolean
  mainPaneHasSavedAllocations?: boolean
}) {
  const {
    endMode,
    targetDateKey,
    isHydratingSchedule,
    loading,
    scheduleLoadedForDate,
    setIsHydratingSchedule,
    mainPaneStaffLength,
    mainPaneHasLoadedStoredCalculations,
    mainPaneHasSavedAllocations,
  } = input

  useEffect(() => {
    if (!targetDateKey) return
    if (!isHydratingSchedule) return
    if (loading) return
    if (scheduleLoadedForDate !== targetDateKey) return

    if (endMode === 'requestAnimationFrame') {
      try {
        window.requestAnimationFrame(() => setIsHydratingSchedule(false))
      } catch {
        setIsHydratingSchedule(false)
      }
      return
    }

    setIsHydratingSchedule(false)
  }, [
    endMode,
    targetDateKey,
    isHydratingSchedule,
    loading,
    scheduleLoadedForDate,
    setIsHydratingSchedule,
    mainPaneStaffLength,
    mainPaneHasLoadedStoredCalculations,
    mainPaneHasSavedAllocations,
  ])
}

export type MainPaneLoadAndHydrateReport = unknown

/**
 * When `selectedDate` is not yet loaded, run `loadAndHydrateDate` with an `AbortController`.
 * `beginDateTransition` is **not** called here; URL / `useScheduleDateParam` already drive the primary controller.
 */
export function useMainPaneLoadAndHydrateDateEffect(input: {
  initialDateResolved: boolean
  selectedDate: Date
  scheduleLoadedForDate: string | null
  loadAndHydrateDate: (args: {
    date: Date
    signal?: AbortSignal
    recalculateScheduleCalculations?: () => void
  }) => Promise<MainPaneLoadAndHydrateReport | null>
  recalculateScheduleCalculations: () => void
  /** Runs synchronously when a new load is scheduled (e.g. pending load diagnostics). */
  onLoadScheduled: (args: { dateStr: string }) => void
  /** Called when the load for `dateStr` finishes successfully (aborted / stale loads are skipped before invoke). */
  onLoadedForDate: (args: { dateStr: string; report: MainPaneLoadAndHydrateReport | null }) => void
  /** When load throws and the op was not aborted and still current for `dateStr`. */
  onLoadError: (args: { dateStr: string; error: unknown }) => void
  latestLoadKeyRef: React.MutableRefObject<string | null>
}): void {
  const {
    initialDateResolved,
    selectedDate,
    scheduleLoadedForDate,
    loadAndHydrateDate,
    recalculateScheduleCalculations,
    onLoadScheduled,
    onLoadedForDate,
    onLoadError,
    latestLoadKeyRef,
  } = input

  useEffect(() => {
    if (!initialDateResolved) return
    let cancelled = false

    const year = selectedDate.getFullYear()
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0')
    const day = String(selectedDate.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    if (scheduleLoadedForDate === dateStr) return
    latestLoadKeyRef.current = dateStr
    onLoadScheduled({ dateStr })

    const controller = new AbortController()

    void (async () => {
      const report = await loadAndHydrateDate({
        date: selectedDate,
        signal: controller.signal,
        recalculateScheduleCalculations,
      })
      if (cancelled || controller.signal.aborted) return
      if (latestLoadKeyRef.current !== dateStr) return
      onLoadedForDate({ dateStr, report })
    })().catch((e) => {
      // eslint-disable-next-line no-console
      console.error('Error loading schedule:', e)
      if (cancelled || controller.signal.aborted) return
      if (latestLoadKeyRef.current !== dateStr) return
      onLoadError({ dateStr, error: e })
    })

    return () => {
      cancelled = true
      controller.abort()
    }
    // NOTE: do not depend on scheduleLoadedForDate here; it is set during loadAndHydrateDate(),
    // and including it would re-run and abort in-flight loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDateResolved, selectedDate])
}

/**
 * Split reference: when `refDateParam` changes, `beginDateTransition` then `loadAndHydrateDate` with abort;
 * `finally` clears `gridLoading` if the signal was not aborted (reference pane has no page grid finalizer).
 */
export function useSplitReferenceDateLoadEffect(input: {
  refDateParam: string | null
  parseDateFromInput: (s: string) => Date
  statusRef: React.MutableRefObject<{ loading: boolean; loadedForDate: string | null }>
  lastRequestedRef: React.MutableRefObject<string | null>
  inFlightAbortRef: React.MutableRefObject<AbortController | null>
  beginDateTransitionRef: React.MutableRefObject<(d: Date, options?: { resetLoadedForDate?: boolean }) => void>
  loadAndHydrateRef: React.MutableRefObject<(args: { date: Date; signal?: AbortSignal }) => Promise<unknown>>
  setGridLoadingRef: React.MutableRefObject<(v: boolean) => void>
}): void {
  const {
    refDateParam,
    parseDateFromInput,
    lastRequestedRef,
    inFlightAbortRef,
    beginDateTransitionRef,
    loadAndHydrateRef,
    setGridLoadingRef,
    statusRef,
  } = input

  useEffect(() => {
    if (!refDateParam) return

    try {
      window.sessionStorage.setItem('rbip_split_ref_date', refDateParam)
    } catch {
      // ignore
    }

    const status = statusRef.current
    if (status.loadedForDate === refDateParam && !status.loading) {
      lastRequestedRef.current = refDateParam
      return
    }

    if (lastRequestedRef.current === refDateParam && status.loading) {
      return
    }

    let parsed: Date
    try {
      parsed = parseDateFromInput(refDateParam)
    } catch {
      return
    }

    inFlightAbortRef.current?.abort()
    const ac = new AbortController()
    inFlightAbortRef.current = ac
    lastRequestedRef.current = refDateParam
    beginDateTransitionRef.current(parsed, { resetLoadedForDate: true })
    void (async () => {
      try {
        await loadAndHydrateRef.current({ date: parsed, signal: ac.signal })
      } finally {
        if (!ac.signal.aborted) {
          setGridLoadingRef.current(false)
        }
      }
    })()
    return () => {
      ac.abort()
      if (inFlightAbortRef.current === ac) inFlightAbortRef.current = null
    }
    // Refs + parseDateFromInput are stable; match legacy behavior: react only to refDateParam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refDateParam])
}
