'use client'

import { useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatDateForInput } from '@/lib/features/schedule/date'
import { getPreviousWorkingDay } from '@/lib/utils/dateHelpers'

/** Session keys for split view restore (mirrors SchedulePageClient prior behavior). */
export const RBIP_SPLIT_SESSION_REF_DATE = 'rbip_split_ref_date'
export const RBIP_SPLIT_SESSION_DIR = 'rbip_split_dir'
export const RBIP_SPLIT_SESSION_RATIO = 'rbip_split_ratio'
export const RBIP_SPLIT_SESSION_REF_HIDDEN = 'rbip_split_ref_hidden'
export const RBIP_SPLIT_SESSION_SWAPPED = 'rbip_split_swapped'

export type ScheduleSplitDirection = 'row' | 'col'

/**
 * URL/searchParams + `router.replace` helpers for the schedule page.
 * Preserves scroll on in-page query updates and full query-string preservation when mutating.
 */
export function useSchedulePageQueryState(selectedDateForSplitSeed: Date) {
  const router = useRouter()
  const searchParams = useSearchParams()

  /** Read-only / presentation: `?display=1`. Legacy `?view=1` still activates display mode. */
  const isDisplayMode =
    searchParams.get('display') === '1' || searchParams.get('view') === '1'
  const isSplitMode = searchParams.get('split') === '1'
  const refDateParam = searchParams.get('refDate')
  const refHiddenParam = searchParams.get('refHidden')
  const splitDirParam: ScheduleSplitDirection =
    searchParams.get('splitDir') === 'row' ? 'row' : 'col'
  const splitRatioParamRaw = searchParams.get('splitRatio')
  const splitRatioParam = (() => {
    const n = splitRatioParamRaw != null ? Number(splitRatioParamRaw) : NaN
    if (!Number.isFinite(n)) return 0.5
    return Math.max(0.15, Math.min(0.85, n))
  })()
  const splitSwapParam = searchParams.get('splitSwap') === '1'
  const isRefHidden = (refHiddenParam || '') === '1'

  const splitDirection = splitDirParam
  const splitRatio = splitRatioParam
  const isSplitSwapped = splitSwapParam

  const replaceScheduleQuery = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString())
      mutate(params)
      const qs = params.toString()
      const href = qs ? `/schedule?${qs}` : '/schedule'

      // Keep scroll stable for in-page query updates.
      let y = 0
      try {
        y = typeof window !== 'undefined' ? window.scrollY : 0
      } catch {
        y = 0
      }
      router.replace(href)
      try {
        window.requestAnimationFrame(() => {
          try {
            window.scrollTo({ top: y, left: 0, behavior: 'instant' as any })
          } catch {
            window.scrollTo(0, y)
          }
        })
      } catch {
        // ignore
      }
    },
    [router, searchParams]
  )

  const toggleDisplayMode = useCallback(() => {
    replaceScheduleQuery((p) => {
      const on = p.get('display') === '1' || p.get('view') === '1'
      if (on) {
        p.delete('display')
        p.delete('view')
      } else {
        p.set('display', '1')
        p.delete('view')
      }
    })
  }, [replaceScheduleQuery])

  const setRefHidden = useCallback(
    (hidden: boolean) => {
      try {
        window.sessionStorage.setItem(RBIP_SPLIT_SESSION_REF_HIDDEN, hidden ? '1' : '0')
      } catch {
        // ignore
      }
      replaceScheduleQuery((p) => {
        p.set('split', '1')
        p.set('refHidden', hidden ? '1' : '0')
      })
    },
    [replaceScheduleQuery]
  )

  const revealReferencePane = useCallback(() => {
    try {
      window.sessionStorage.setItem(RBIP_SPLIT_SESSION_REF_HIDDEN, '0')
    } catch {
      // ignore
    }
    replaceScheduleQuery((p) => {
      p.set('split', '1')
      p.set('refHidden', '0')
    })
  }, [replaceScheduleQuery])

  const commitSplitRatio = useCallback(
    (r: number) => {
      try {
        window.sessionStorage.setItem(RBIP_SPLIT_SESSION_RATIO, String(r))
      } catch {
        // ignore
      }
      replaceScheduleQuery((p) => {
        p.set('split', '1')
        p.set('splitRatio', r.toFixed(3))
        p.set('refHidden', '0')
      })
    },
    [replaceScheduleQuery]
  )

  const toggleSplitSwap = useCallback(() => {
    // True swap: swap pane positions (left<->right / top<->bottom), keeping each pane's own size.
    const next = !isSplitSwapped
    try {
      window.sessionStorage.setItem(RBIP_SPLIT_SESSION_SWAPPED, next ? '1' : '0')
      // Swapping is most useful when reference is visible.
      window.sessionStorage.setItem(RBIP_SPLIT_SESSION_REF_HIDDEN, '0')
    } catch {
      // ignore
    }
    replaceScheduleQuery((p) => {
      p.set('split', '1')
      if (next) p.set('splitSwap', '1')
      else p.delete('splitSwap')
      p.set('refHidden', '0')
    })
  }, [isSplitSwapped, replaceScheduleQuery])

  const toggleSplitMode = useCallback(() => {
    if (isSplitMode) {
      // Turn off split: persist last-used ref settings in sessionStorage for fast restore,
      // but clear split-related params from the URL.
      try {
        const refDate = searchParams.get('refDate')
        const dir = searchParams.get('splitDir')
        const ratio = searchParams.get('splitRatio')
        const hidden = searchParams.get('refHidden')
        const swapped = searchParams.get('splitSwap')
        if (refDate) window.sessionStorage.setItem(RBIP_SPLIT_SESSION_REF_DATE, refDate)
        if (dir) window.sessionStorage.setItem(RBIP_SPLIT_SESSION_DIR, dir)
        if (ratio) window.sessionStorage.setItem(RBIP_SPLIT_SESSION_RATIO, ratio)
        if (hidden) window.sessionStorage.setItem(RBIP_SPLIT_SESSION_REF_HIDDEN, hidden)
        window.sessionStorage.setItem(RBIP_SPLIT_SESSION_SWAPPED, swapped === '1' ? '1' : '0')
      } catch {
        // ignore
      }

      replaceScheduleQuery((p) => {
        p.delete('split')
        p.delete('splitDir')
        p.delete('splitRatio')
        p.delete('splitSwap')
        p.delete('refHidden')
        p.delete('refDate')
      })
      return
    }

    // Turn on split: seed from sessionStorage where possible.
    let seededRefDate: string | null = null
    try {
      seededRefDate = window.sessionStorage.getItem(RBIP_SPLIT_SESSION_REF_DATE)
    } catch {
      seededRefDate = null
    }
    if (!seededRefDate) {
      try {
        seededRefDate = formatDateForInput(getPreviousWorkingDay(selectedDateForSplitSeed))
      } catch {
        seededRefDate = formatDateForInput(new Date())
      }
    }

    let dir: string | null = null
    try {
      dir = window.sessionStorage.getItem(RBIP_SPLIT_SESSION_DIR)
    } catch {
      dir = null
    }
    if (dir !== 'col' && dir !== 'row') dir = 'col'

    let ratioStr: string | null = null
    try {
      ratioStr = window.sessionStorage.getItem(RBIP_SPLIT_SESSION_RATIO)
    } catch {
      ratioStr = null
    }
    const ratioNum = ratioStr != null ? Number(ratioStr) : NaN
    const ratio = Number.isFinite(ratioNum) ? Math.max(0.15, Math.min(0.85, ratioNum)) : 0.5

    let hidden: string | null = null
    try {
      hidden = window.sessionStorage.getItem(RBIP_SPLIT_SESSION_REF_HIDDEN)
    } catch {
      hidden = null
    }

    let swapped: string | null = null
    try {
      swapped = window.sessionStorage.getItem(RBIP_SPLIT_SESSION_SWAPPED)
    } catch {
      swapped = null
    }

    replaceScheduleQuery((p) => {
      p.set('split', '1')
      p.set('refDate', seededRefDate!)
      p.set('splitDir', dir!)
      p.set('splitRatio', ratio.toFixed(3))
      p.set('refHidden', hidden === '1' ? '1' : '0')
      if (swapped === '1') p.set('splitSwap', '1')
      else p.delete('splitSwap')
    })
  }, [isSplitMode, replaceScheduleQuery, searchParams, selectedDateForSplitSeed])

  // Split mode: ensure we always have a refDate param (seed from session storage or previous working day).
  useEffect(() => {
    if (!isSplitMode) return
    if (refDateParam) return

    let seeded: string | null = null
    try {
      seeded = window.sessionStorage.getItem(RBIP_SPLIT_SESSION_REF_DATE)
    } catch {
      seeded = null
    }
    if (!seeded) {
      try {
        seeded = formatDateForInput(getPreviousWorkingDay(selectedDateForSplitSeed))
      } catch {
        seeded = formatDateForInput(new Date())
      }
    }

    replaceScheduleQuery((p) => {
      p.set('refDate', seeded!)
      p.set('split', '1')
      if (!p.get('splitDir')) p.set('splitDir', splitDirection)
      if (!p.get('splitRatio')) p.set('splitRatio', String(splitRatio))
      if (!p.get('refHidden')) p.set('refHidden', '0')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSplitMode, refDateParam])

  const urlDateKey = searchParams.get('date')

  return {
    searchParams,
    urlDateKey,
    isDisplayMode,
    isSplitMode,
    refDateParam,
    splitDirection,
    splitRatio,
    isSplitSwapped,
    isRefHidden,
    replaceScheduleQuery,
    toggleDisplayMode,
    setRefHidden,
    revealReferencePane,
    commitSplitRatio,
    toggleSplitSwap,
    toggleSplitMode,
  }
}
