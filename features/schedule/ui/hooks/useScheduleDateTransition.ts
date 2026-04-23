'use client'

import { useCallback, useRef, type TransitionStartFunction, type RefObject } from 'react'

export type DateTransitionOptions = {
  resetLoadedForDate?: boolean
  useLocalTopBar?: boolean
}

export type QueueDateTransition = (nextDate: Date, options?: DateTransitionOptions) => void

type ScheduleDateTransitionParams = {
  urlDateKey: string | null
  replaceScheduleQuery: (mutate: (p: URLSearchParams) => void) => void
  toDateKey: (d: Date) => string
  controllerBeginDateTransition: (d: Date, o: { resetLoadedForDate: boolean }) => void
  startUiTransition: TransitionStartFunction
  gridLoadingUsesLocalBarRef: RefObject<boolean>
  startTopLoading: (initialProgress?: number) => void
  startSoftAdvance: (cap?: number) => void
}

/**
 * User-driven date changes: sync URL, then either let `useScheduleDateParam` update the controller once
 * (URL path) or call the controller when URL already matches.
 *
 * IMPORTANT: Keep URL `?date=YYYY-MM-DD` in sync; otherwise `useScheduleDateParam` may snap back.
 * When `urlDateKey` differs, do NOT call `controllerBeginDateTransition` here — the param hook
 * applies it once; avoids double transition and cache pollution.
 */
export function useScheduleDateTransition(params: ScheduleDateTransitionParams): {
  beginDateTransition: (nextDate: Date, options?: DateTransitionOptions) => void
  queueDateTransition: QueueDateTransition
} {
  const pRef = useRef(params)
  pRef.current = params

  const beginDateTransition = useCallback((nextDate: Date, options?: DateTransitionOptions) => {
    const p = pRef.current
    const useLocalTopBar = options?.useLocalTopBar ?? true
    p.gridLoadingUsesLocalBarRef.current = useLocalTopBar
    if (useLocalTopBar) {
      p.startTopLoading(0.08)
      p.startSoftAdvance(0.75)
    }
    const key = p.toDateKey(nextDate)
    if (p.urlDateKey !== key) {
      p.replaceScheduleQuery((q) => {
        q.set('date', key)
      })
      // Do NOT call controllerBeginDateTransition here: `useScheduleDateParam` drives it once.
      return
    }
    p.controllerBeginDateTransition(nextDate, { resetLoadedForDate: options?.resetLoadedForDate ?? true })
  }, [])

  const queueDateTransition = useCallback<QueueDateTransition>(
    (nextDate, options) => {
      pRef.current.startUiTransition(() => {
        beginDateTransition(nextDate, options)
      })
    },
    [beginDateTransition]
  )

  return { beginDateTransition, queueDateTransition }
}
