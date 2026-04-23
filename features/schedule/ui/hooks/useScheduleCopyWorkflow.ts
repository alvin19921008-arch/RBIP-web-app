'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { COPY_ARRIVAL_ANIMATION_MS } from '@/lib/features/schedule/copyConstants'
import { formatDateDDMMYYYY as formatDateDDMMYYYYRef, formatDateForInput as formatDateForInputRef } from '@/lib/features/schedule/date'
import { clearCachedSchedule as clearCachedScheduleRef } from '@/lib/utils/scheduleCache'
import { clearDraftSchedule as clearDraftScheduleRef } from '@/lib/utils/scheduleDraftCache'
import { createTimingCollector as createTimingCollectorRef, type TimingReport } from '@/lib/utils/timing'

export type ScheduleCopyShowActionToast = (
  title: string,
  variant?: unknown,
  description?: string,
  options?: {
    durationMs?: number
    actions?: import('react').ReactNode
    persistUntilDismissed?: boolean
    dismissOnOutsideClick?: boolean
  }
) => number

type QueueDateTransition = (
  nextDate: Date,
  options?: { resetLoadedForDate?: boolean; useLocalTopBar?: boolean }
) => void

type LoadDatesWithData = (opts?: { force?: boolean }) => Promise<void>

type CopyWizardConfig = {
  sourceDate: Date
  targetDate: Date | null
  flowType: 'next-working-day' | 'last-working-day' | 'specific-date'
  direction: 'to' | 'from'
}

export function useScheduleCopyWorkflow(params: {
  scheduleActions: {
    copySchedule: (args: {
      fromDate: Date
      toDate: Date
      mode: 'hybrid'
      includeBufferStaff: boolean
      onProgress?: (next: number) => void
      startSoftAdvance?: (cap: number) => void
      stopSoftAdvance?: () => void
    }) => Promise<{ copiedUpToStep?: string; timing: TimingReport; rebaseWarning?: string | null }>
    goToStep: (step: import('@/types/schedule').ScheduleStepId) => void | Promise<void>
  }
  scheduleLoadedForDate: string | null
  currentStep: string
  setCopying: Dispatch<SetStateAction<boolean>>
  startTopLoading: (initialProgress?: number) => void
  bumpTopLoadingTo: (target: number) => void
  finishTopLoading: () => void
  startSoftAdvance: (cap?: number) => void
  stopSoftAdvance: () => void
  showActionToast: ScheduleCopyShowActionToast
  formatDateForInput: typeof formatDateForInputRef
  formatDateDDMMYYYY: typeof formatDateDDMMYYYYRef
  createTimingCollector: typeof createTimingCollectorRef
  setLastCopyTiming: Dispatch<SetStateAction<TimingReport | null>>
  setCopyWizardOpen: Dispatch<SetStateAction<boolean>>
  setCopyWizardConfig: Dispatch<SetStateAction<CopyWizardConfig | null>>
  setCopyMenuOpen: Dispatch<SetStateAction<boolean>>
  clearCachedSchedule: typeof clearCachedScheduleRef
  clearDraftSchedule: typeof clearDraftScheduleRef
  queueDateTransition: QueueDateTransition
  setDatesWithData: Dispatch<SetStateAction<Set<string>>>
  loadDatesWithData: LoadDatesWithData
}) {
  const {
    scheduleActions,
    scheduleLoadedForDate,
    currentStep,
    setCopying,
    startTopLoading,
    bumpTopLoadingTo,
    finishTopLoading,
    startSoftAdvance,
    stopSoftAdvance,
    showActionToast,
    formatDateForInput,
    formatDateDDMMYYYY,
    createTimingCollector,
    setLastCopyTiming,
    setCopyWizardOpen,
    setCopyWizardConfig,
    setCopyMenuOpen,
    clearCachedSchedule,
    clearDraftSchedule,
    queueDateTransition,
    setDatesWithData,
    loadDatesWithData,
  } = params

  const highlightTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const [copyTargetDateKey, setCopyTargetDateKey] = useState<string | null>(null)
  const [leaveSetupPulseKey, setLeaveSetupPulseKey] = useState(0)
  const [isDateHighlighted, setIsDateHighlighted] = useState(false)

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!copyTargetDateKey) return
    const loadedDateKey = scheduleLoadedForDate
    const activeStep = currentStep
    if (!loadedDateKey) return
    if (loadedDateKey !== copyTargetDateKey) return
    if (activeStep !== 'leave-fte') {
      void scheduleActions.goToStep('leave-fte')
    }
    setIsDateHighlighted(true)
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = globalThis.setTimeout(() => {
      setIsDateHighlighted(false)
    }, COPY_ARRIVAL_ANIMATION_MS)
    setLeaveSetupPulseKey((prev) => prev + 1)
    setCopyTargetDateKey(null)
  }, [copyTargetDateKey, scheduleLoadedForDate, currentStep, scheduleActions])

  const handleConfirmCopy = useCallback(
    async ({
      fromDate,
      toDate,
      includeBufferStaff,
    }: {
      fromDate: Date
      toDate: Date
      includeBufferStaff: boolean
    }): Promise<{ copiedUpToStep?: string }> => {
      let timing: any = null
      let serverTiming: any = null
      let copyError: unknown = null

      setCopying(true)
      startTopLoading(0.06)
      bumpTopLoadingTo(0.18)
      startSoftAdvance(0.72)

      try {
        const result = await scheduleActions.copySchedule({
          fromDate,
          toDate,
          mode: 'hybrid',
          includeBufferStaff,
          onProgress: bumpTopLoadingTo,
          startSoftAdvance,
          stopSoftAdvance,
        })

        timing = result.timing
        serverTiming = (result.timing as any)?.meta?.server ?? null

        setCopyWizardOpen(false)
        setCopyWizardConfig(null)
        setCopyMenuOpen(false)
        bumpTopLoadingTo(0.86)

        const targetKey = formatDateForInput(toDate)
        setCopyTargetDateKey(targetKey)
        clearCachedSchedule(targetKey)
        clearDraftSchedule(targetKey)
        // Copy route may backfill baseline_snapshot on the source row; clear so the next visit reads DB.
        clearCachedSchedule(formatDateForInput(fromDate))

        queueDateTransition(toDate, { resetLoadedForDate: true, useLocalTopBar: false })
        bumpTopLoadingTo(0.92)

        setDatesWithData((prev) => {
          const next = new Set(prev)
          next.add(formatDateForInput(toDate))
          return next
        })
        loadDatesWithData({ force: true })
        bumpTopLoadingTo(0.98)

        showActionToast('Copied schedule to ' + formatDateDDMMYYYY(toDate) + '.', 'success')
        if (result.rebaseWarning) {
          showActionToast(
            'Copied, but baseline rebase failed.',
            'warning',
            `Please go to Dashboard > Sync / Publish and run "Pull Global → snapshot" for today. (${result.rebaseWarning})`
          )
        }

        return {
          copiedUpToStep: result.copiedUpToStep,
        }
      } catch (e: any) {
        copyError = e
        timing = e?.timing ?? timing
        serverTiming = e?.serverTiming ?? serverTiming
        throw e
      } finally {
        setCopying(false)
        setLastCopyTiming(
          (timing as any) ||
            createTimingCollector().finalize({
              ok: !copyError,
              server: serverTiming,
            })
        )
        finishTopLoading()
      }
    },
    [
      scheduleActions,
      setCopying,
      startTopLoading,
      bumpTopLoadingTo,
      finishTopLoading,
      startSoftAdvance,
      stopSoftAdvance,
      showActionToast,
      formatDateForInput,
      formatDateDDMMYYYY,
      createTimingCollector,
      setLastCopyTiming,
      setCopyWizardOpen,
      setCopyWizardConfig,
      setCopyMenuOpen,
      clearCachedSchedule,
      clearDraftSchedule,
      queueDateTransition,
      setDatesWithData,
      loadDatesWithData,
    ]
  )

  return {
    handleConfirmCopy,
    copyTargetDateKey,
    leaveSetupPulseKey,
    isDateHighlighted,
  }
}
