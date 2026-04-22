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
        const headRes = await supabase.rpc('get_config_global_head_v1')
        if (cancelled) return
        if (headRes.error || !headRes.data) return
        const head = headRes.data as any

        const rawThreshold = head?.drift_notification_threshold
        const unit =
          rawThreshold?.unit === 'weeks' || rawThreshold?.unit === 'months' ? rawThreshold.unit : 'days'
        const rawValue =
          typeof rawThreshold?.value === 'number' ? rawThreshold.value : Number(rawThreshold?.value ?? 30)
        const value = Number.isFinite(rawValue) && rawValue >= 0 ? rawValue : 30

        // Treat very large thresholds as “off”.
        if (unit === 'days' && value >= 3650) return

        const days =
          unit === 'weeks' ? value * 7 : unit === 'months' ? value * 30 : value
        const thresholdMs = Math.max(0, days) * 24 * 60 * 60 * 1000

        const { data: schedRow, error: schedErr } = await supabase
          .from('daily_schedules')
          .select('baseline_snapshot')
          .eq('id', currentScheduleId)
          .maybeSingle()
        if (cancelled) return
        if (schedErr) return

        const stored = (schedRow as any)?.baseline_snapshot
        const { envelope } = unwrapBaselineSnapshotStored(stored as any)

        const createdAtMs = Date.parse(String((envelope as any)?.createdAt ?? ''))
        const ageMs = Number.isFinite(createdAtMs) ? Date.now() - createdAtMs : 0
        if (thresholdMs > 0 && ageMs < thresholdMs) return

        // "Always" mode (threshold=0): use a real diff against current published configuration.
        // Version metadata may remain unchanged (e.g., during testing or when global_version hasn't bumped),
        // but users still expect to be warned when the saved snapshot differs from today's Global config.
        if (thresholdMs === 0) {
          const diff = await computeSnapshotDiffFromDbSnapshot()
          if (cancelled) return
          if (!hasAnySnapshotDiff(diff)) return

          if (cancelled) return
          setSnapshotDiffError(null)
          setSnapshotDiffResult(diff || null)
          showDriftNotice()
          return
        }

        const snapHead = (envelope as any)?.globalHeadAtCreation as any | null | undefined
        const snapCat = snapHead?.category_versions
        const liveCat = head?.category_versions
        let hasDrift = false
        if (snapCat && typeof snapCat === 'object' && liveCat && typeof liveCat === 'object') {
          for (const [k, v] of Object.entries(liveCat)) {
            const sv = (snapCat as any)[k]
            if (typeof v === 'number' && typeof sv === 'number' && v !== sv) {
              hasDrift = true
              break
            }
          }
        } else if (snapHead?.global_version != null && head?.global_version != null) {
          hasDrift = Number(snapHead.global_version) !== Number(head.global_version)
        } else {
          // If we can’t compare reliably (older snapshots), don’t spam.
          hasDrift = false
        }

        if (!hasDrift) return

        if (cancelled) return
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
