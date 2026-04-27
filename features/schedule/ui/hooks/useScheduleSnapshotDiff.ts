'use client'

import { createElement, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { BaselineSnapshot } from '@/types/schedule'
import type { SnapshotDiffResult } from '@/lib/features/schedule/snapshotDiff'
import { fetchSnapshotDiffLiveInputs } from '@/lib/features/schedule/snapshotDiffLiveInputs'
import { unwrapBaselineSnapshotStored } from '@/lib/utils/snapshotEnvelope'

type ScheduleSnapshotSupabase = ReturnType<
  (typeof import('@/lib/supabase/client'))['createClientComponentClient']
>

export type ScheduleSnapshotDiffShowActionToast = (
  title: string,
  variant?: unknown,
  description?: string,
  options?: {
    durationMs?: number
    actions?: ReactNode
    persistUntilDismissed?: boolean
    dismissOnOutsideClick?: boolean
  }
) => number

export function useScheduleSnapshotDiff(params: {
  supabase: ScheduleSnapshotSupabase
  currentScheduleId: string | null | undefined
  selectedDateStr: string
  baselineSnapshot: BaselineSnapshot | null | undefined
  loading: boolean
  gridLoading: boolean
  userRole: 'developer' | 'admin' | 'user'
  showActionToast: ScheduleSnapshotDiffShowActionToast
  dismissActionToast: () => void
}) {
  const {
    supabase,
    currentScheduleId,
    selectedDateStr,
    baselineSnapshot,
    loading,
    gridLoading,
    userRole,
    showActionToast,
    dismissActionToast,
  } = params

  const snapshotDiffButtonRef = useRef<HTMLButtonElement | null>(null)
  const [savedSetupPopoverOpen, setSavedSetupPopoverOpen] = useState(false)
  const [snapshotDiffExpanded, setSnapshotDiffExpanded] = useState(false)
  const [snapshotDiffLoading, setSnapshotDiffLoading] = useState(false)
  const [snapshotDiffError, setSnapshotDiffError] = useState<string | null>(null)
  const [snapshotDiffResult, setSnapshotDiffResult] = useState<SnapshotDiffResult | null>(null)

  const hasAnySnapshotDiff = useCallback((diff: SnapshotDiffResult | null | undefined) => {
    if (!diff) return false
    return (
      (diff.staff.added.length ?? 0) > 0 ||
      (diff.staff.removed.length ?? 0) > 0 ||
      (diff.staff.changed.length ?? 0) > 0 ||
      (diff.teamSettings.changed.length ?? 0) > 0 ||
      (diff.wards.added.length ?? 0) > 0 ||
      (diff.wards.removed.length ?? 0) > 0 ||
      (diff.wards.changed.length ?? 0) > 0 ||
      (diff.pcaPreferences.changed.length ?? 0) > 0 ||
      (diff.specialPrograms.added.length ?? 0) > 0 ||
      (diff.specialPrograms.removed.length ?? 0) > 0 ||
      (diff.specialPrograms.changed.length ?? 0) > 0 ||
      (diff.sptAllocations.added.length ?? 0) > 0 ||
      (diff.sptAllocations.removed.length ?? 0) > 0 ||
      (diff.sptAllocations.changed.length ?? 0) > 0
    )
  }, [])

  const computeSnapshotDiffFromDbSnapshot = useCallback(async (): Promise<SnapshotDiffResult | null> => {
    if (!currentScheduleId) return null
    const { data: schedRow, error: schedErr } = await supabase
      .from('daily_schedules')
      .select('baseline_snapshot')
      .eq('id', currentScheduleId)
      .maybeSingle()
    if (schedErr) throw schedErr

    const stored = (schedRow as any)?.baseline_snapshot
    const { data: snapshotData } = unwrapBaselineSnapshotStored(stored as any)

    const diffKey = `${selectedDateStr}|${currentScheduleId || ''}`
    const liveInputs = await fetchSnapshotDiffLiveInputs({
      supabase,
      includeTeamSettings: true,
      cacheKey: `schedule-snapshot-diff:${diffKey}`,
      // Deterministic recompute: avoid stale result when dashboard config changed recently.
      ttlMs: 0,
    })

    const { diffBaselineSnapshot } = await import('@/lib/features/schedule/snapshotDiff')
    return diffBaselineSnapshot({
      snapshot: snapshotData as any,
      live: liveInputs,
    })
  }, [currentScheduleId, selectedDateStr, supabase])

  const showSnapshotUiReminder = !!baselineSnapshot && hasAnySnapshotDiff(snapshotDiffResult)

  const onToggleSnapshotDiffExpanded = useCallback(() => {
    setSnapshotDiffExpanded((v) => !v)
  }, [])

  const lastDriftToastKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (userRole !== 'developer' && userRole !== 'admin') return
    if (!currentScheduleId) return
    if (!baselineSnapshot) return
    if (loading || gridLoading) return

    const toastKey = `${selectedDateStr}|${currentScheduleId}`
    if (lastDriftToastKeyRef.current === toastKey) return

    const showDriftNotice = () => {
      lastDriftToastKeyRef.current = toastKey
      showActionToast(
        'Published setup has changed',
        'warning',
        'This schedule is using the saved setup from that day. You can review what changed in “Show differences” or manage it in Dashboard → Sync / Publish.',
        {
          persistUntilDismissed: true,
          dismissOnOutsideClick: true,
          actions: createElement(
            'div',
            { className: 'flex items-center gap-2' },
            createElement(
              Button,
              {
                type: 'button',
                size: 'sm',
                variant: 'outline',
                onClick: () => {
                  dismissActionToast()
                  setSavedSetupPopoverOpen(true)
                  setSnapshotDiffExpanded(true)
                },
              },
              'Show differences'
            )
          ),
        }
      )
    }

    let cancelled = false
    // Don’t block initial paint.
    window.setTimeout(() => {
      if (cancelled) return
      ;(async () => {
        const diff = await computeSnapshotDiffFromDbSnapshot()
        if (cancelled) return
        if (!hasAnySnapshotDiff(diff)) return
        if (cancelled) return
        setSnapshotDiffError(null)
        setSnapshotDiffResult(diff || null)
        showDriftNotice()
      })().catch(() => {})
    }, 0)

    return () => {
      cancelled = true
    }
  }, [
    userRole,
    currentScheduleId,
    selectedDateStr,
    loading,
    gridLoading,
    baselineSnapshot,
    supabase,
    showActionToast,
    dismissActionToast,
    computeSnapshotDiffFromDbSnapshot,
    hasAnySnapshotDiff,
  ])

  useEffect(() => {
    if (!savedSetupPopoverOpen) return
    if (!snapshotDiffExpanded) return
    if (!baselineSnapshot) return

    let cancelled = false
    setSnapshotDiffLoading(true)
    setSnapshotDiffError(null)

    ;(async () => {
      const diff = await computeSnapshotDiffFromDbSnapshot()
      if (cancelled) return
      setSnapshotDiffResult(diff)
    })()
      .catch((e) => {
        if (cancelled) return
        setSnapshotDiffError(e?.message || 'Failed to compute differences.')
        setSnapshotDiffResult(null)
      })
      .finally(() => {
        if (cancelled) return
        setSnapshotDiffLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [savedSetupPopoverOpen, snapshotDiffExpanded, baselineSnapshot, computeSnapshotDiffFromDbSnapshot])

  // Prime diff in background so the reminder icon uses the same semantic check as "Review".
  useEffect(() => {
    if (!baselineSnapshot) return
    if (!currentScheduleId) return
    let cancelled = false
    ;(async () => {
      try {
        const diff = await computeSnapshotDiffFromDbSnapshot()
        if (cancelled) return
        setSnapshotDiffResult(diff)
        setSnapshotDiffError(null)
      } catch (e: any) {
        if (cancelled) return
        setSnapshotDiffError(e?.message || 'Failed to compute differences.')
        setSnapshotDiffResult(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [baselineSnapshot, currentScheduleId, computeSnapshotDiffFromDbSnapshot])

  useEffect(() => {
    if (!savedSetupPopoverOpen && snapshotDiffExpanded) {
      setSnapshotDiffExpanded(false)
    }
  }, [savedSetupPopoverOpen, snapshotDiffExpanded])

  return {
    snapshotDiffButtonRef,
    savedSetupPopoverOpen,
    setSavedSetupPopoverOpen,
    snapshotDiffExpanded,
    snapshotDiffLoading,
    snapshotDiffError,
    snapshotDiffResult,
    showSnapshotUiReminder,
    onToggleSnapshotDiffExpanded,
    computeSnapshotDiffFromDbSnapshot,
    hasAnySnapshotDiff,
  }
}
