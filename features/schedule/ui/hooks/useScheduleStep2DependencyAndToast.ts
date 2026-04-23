import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { describeStep3BootstrapDelta, type Step3BootstrapSummary } from '@/lib/features/schedule/step3Bootstrap'
import { evaluateStep2DownstreamImpact } from '@/lib/features/schedule/step2DownstreamImpact'
import type { Step2ImpactKind } from '@/lib/features/schedule/step2DownstreamImpact'
import type { ScheduleCalculations, StepStatus } from '@/types/schedule'
import type { Team } from '@/types/staff'

export type Step2FinalizeContext = {
  kind: Step2ImpactKind
  explicitStep3Change?: boolean
  explicitStep4Change?: boolean
}

export const DEFAULT_STEP2_FINALIZE_CONTEXT: Step2FinalizeContext = {
  kind: 'main-rerun',
  explicitStep3Change: false,
  explicitStep4Change: false,
}

// --- Step 2 → Step 3/4 invalidation (fingerprints + finalize) ---

export function useScheduleStep2Dependency(args: {
  setStepStatus: (value: SetStateAction<Record<string, StepStatus>>) => void
  stepStatus: Record<string, StepStatus>
}): {
  latestStep3DependencyFingerprintRef: MutableRefObject<string>
  latestStep4DependencyFingerprintRef: MutableRefObject<string>
  step2DownstreamImpact: { step3Outdated: boolean; step4Outdated: boolean } | null
  markDependentStepsOutOfDate: (args: { step3Changed: boolean; step4Changed: boolean }) => void
  captureStep2DependencyBaseline: (context?: Step2FinalizeContext) => void
  finalizeStep2DependencyChanges: () => void
  scheduleFinalizeStep2DependencyChanges: () => void
} {
  const { setStepStatus, stepStatus } = args
  const latestStepStatusRef = useRef<Record<string, StepStatus>>(stepStatus)
  const latestStep3DependencyFingerprintRef = useRef<string>('')
  const latestStep4DependencyFingerprintRef = useRef<string>('')
  const step2FingerprintBaselineRef = useRef<{ step3: string; step4: string } | null>(null)
  const step2FinalizeContextRef = useRef<Step2FinalizeContext>(DEFAULT_STEP2_FINALIZE_CONTEXT)
  const [step2DownstreamImpact, setStep2DownstreamImpact] = useState<{
    step3Outdated: boolean
    step4Outdated: boolean
  } | null>(null)

  useLayoutEffect(() => {
    latestStepStatusRef.current = stepStatus
  }, [stepStatus])

  useEffect(() => {
    setStep2DownstreamImpact((prev) => {
      if (!prev) return prev
      const step3StillOutdated = !!prev.step3Outdated && stepStatus['floating-pca'] === 'outdated'
      const step4StillOutdated = !!prev.step4Outdated && stepStatus['bed-relieving'] === 'outdated'
      if (!step3StillOutdated && !step4StillOutdated) return null
      if (step3StillOutdated === prev.step3Outdated && step4StillOutdated === prev.step4Outdated) return prev
      return { step3Outdated: step3StillOutdated, step4Outdated: step4StillOutdated }
    })
  }, [stepStatus])

  const markDependentStepsOutOfDate = useCallback(
    (impact: { step3Changed: boolean; step4Changed: boolean }) => {
      if (!impact.step3Changed && !impact.step4Changed) return
      setStepStatus((prev) => {
        let changed = false
        const next: Record<string, StepStatus> = { ...prev }
        if (impact.step3Changed && next['floating-pca'] === 'completed') {
          next['floating-pca'] = 'outdated'
          changed = true
        }
        if (impact.step4Changed && next['bed-relieving'] === 'completed') {
          next['bed-relieving'] = 'outdated'
          changed = true
        }
        return changed ? next : prev
      })
    },
    [setStepStatus]
  )

  const captureStep2DependencyBaseline = useCallback((context?: Step2FinalizeContext) => {
    step2FinalizeContextRef.current = context ?? DEFAULT_STEP2_FINALIZE_CONTEXT
    step2FingerprintBaselineRef.current = {
      step3: latestStep3DependencyFingerprintRef.current,
      step4: latestStep4DependencyFingerprintRef.current,
    }
  }, [])

  const finalizeStep2DependencyChanges = useCallback(() => {
    const baseline = step2FingerprintBaselineRef.current
    step2FingerprintBaselineRef.current = null
    const finalizeContext = step2FinalizeContextRef.current
    step2FinalizeContextRef.current = DEFAULT_STEP2_FINALIZE_CONTEXT
    if (!baseline) return
    const fingerprintStep3Changed = baseline.step3 !== latestStep3DependencyFingerprintRef.current
    const fingerprintStep4Changed = baseline.step4 !== latestStep4DependencyFingerprintRef.current
    const { step3Changed, step4Changed } = evaluateStep2DownstreamImpact({
      kind: finalizeContext.kind,
      step3FingerprintChanged: fingerprintStep3Changed,
      step4FingerprintChanged: fingerprintStep4Changed,
      step3TargetsDependOnPtDistribution: true,
      explicitStep3Change: !!finalizeContext.explicitStep3Change,
      explicitStep4Change: !!finalizeContext.explicitStep4Change,
    })

    const status = latestStepStatusRef.current
    const step3Outdated = step3Changed && status?.['floating-pca'] === 'completed'
    const step4Outdated = step4Changed && status?.['bed-relieving'] === 'completed'

    markDependentStepsOutOfDate({ step3Changed, step4Changed })

    if (step3Outdated || step4Outdated) {
      setStep2DownstreamImpact({ step3Outdated, step4Outdated })
    }
  }, [markDependentStepsOutOfDate])

  const scheduleFinalizeStep2DependencyChanges = useCallback(() => {
    const run = () => finalizeStep2DependencyChanges()
    if (typeof window !== 'undefined') {
      window.setTimeout(run, 0)
    } else {
      queueMicrotask(run)
    }
  }, [finalizeStep2DependencyChanges])

  return {
    latestStep3DependencyFingerprintRef,
    latestStep4DependencyFingerprintRef,
    step2DownstreamImpact,
    markDependentStepsOutOfDate,
    captureStep2DependencyBaseline,
    finalizeStep2DependencyChanges,
    scheduleFinalizeStep2DependencyChanges,
  }
}

// --- Buffered Step 2 success toast (deferred until calculations flush) ---

type ToastRefEntry = { id: number; title: string } | null

type BufferedPayload = { title: string; variant: any; description?: string }

export function useScheduleStep2SuccessToastBuffer(args: {
  showActionToast: (title: string, variant?: any, description?: string) => void
  calculations: Record<Team, ScheduleCalculations | null | undefined> | null | undefined
}): {
  bufferStep2SuccessToastRef: MutableRefObject<boolean>
  bufferedStep2SuccessToastPayloadRef: MutableRefObject<BufferedPayload | null>
  bufferedStep2ToastPendingRef: MutableRefObject<boolean>
  bufferedStep2ToastAwaitCalculationsRef: MutableRefObject<typeof args.calculations | null>
  bufferedStep2ToastFlushVersion: number
  setBufferedStep2ToastFlushVersion: Dispatch<SetStateAction<number>>
  clearBufferedStep2Toast: () => void
  flushBufferedStep2Toast: (options?: { awaitCalculations?: boolean }) => void
  step2ToastProxy: (title: string, variant?: any, description?: string) => void
} {
  const { showActionToast, calculations } = args
  const bufferStep2SuccessToastRef = useRef(false)
  const bufferedStep2SuccessToastPayloadRef = useRef<BufferedPayload | null>(null)
  const bufferedStep2ToastPendingRef = useRef(false)
  const bufferedStep2ToastAwaitCalculationsRef = useRef<typeof calculations | null>(null)
  const [bufferedStep2ToastFlushVersion, setBufferedStep2ToastFlushVersion] = useState(0)

  const clearBufferedStep2Toast = useCallback(() => {
    bufferedStep2SuccessToastPayloadRef.current = null
    bufferedStep2ToastAwaitCalculationsRef.current = null
    bufferedStep2ToastPendingRef.current = false
  }, [])

  const flushBufferedStep2Toast = useCallback(
    (options?: { awaitCalculations?: boolean }) => {
      bufferedStep2ToastAwaitCalculationsRef.current = options?.awaitCalculations ? calculations : null
      bufferedStep2ToastPendingRef.current = true
      setBufferedStep2ToastFlushVersion((version) => version + 1)
    },
    [calculations]
  )

  const step2ToastProxy = useCallback(
    (title: string, variant?: any, description?: string) => {
      const isStep2Success = title === 'Step 2 allocation completed.' && (variant ?? 'success') === 'success'
      if (bufferStep2SuccessToastRef.current && isStep2Success) {
        bufferedStep2SuccessToastPayloadRef.current = { title, variant: variant ?? 'success', description }
        return
      }
      showActionToast(title, variant ?? 'success', description)
    },
    [showActionToast]
  )

  return {
    bufferStep2SuccessToastRef,
    bufferedStep2SuccessToastPayloadRef,
    bufferedStep2ToastPendingRef,
    bufferedStep2ToastAwaitCalculationsRef,
    bufferedStep2ToastFlushVersion,
    setBufferedStep2ToastFlushVersion,
    clearBufferedStep2Toast,
    flushBufferedStep2Toast,
    step2ToastProxy,
  }
}

// --- After useStep3DialogProjection: baseline capture + toast flush effect ---

export function useScheduleBufferedStep2HandoffAfterProjection(args: {
  successToast: ReturnType<typeof useScheduleStep2SuccessToastBuffer>
  step3BootstrapSummary: Step3BootstrapSummary | null | undefined
  step3BootstrapSummaryV2: Step3BootstrapSummary | null | undefined
  calculations: Record<Team, ScheduleCalculations | null | undefined> | null | undefined
  showActionToast: (
    title: string,
    variant?: any,
    description?: string,
    options?: {
      durationMs?: number
      showDurationProgress?: boolean
      pauseOnHover?: boolean
    }
  ) => void
  dismissToast: () => void
  lastShownToastRef: MutableRefObject<ToastRefEntry>
}): {
  captureStep3BootstrapBaseline: () => void
  startBufferedStep2ToastSession: () => void
} {
  const {
    successToast,
    step3BootstrapSummary,
    step3BootstrapSummaryV2,
    calculations,
    showActionToast,
    dismissToast,
    lastShownToastRef,
  } = args
  const {
    bufferStep2SuccessToastRef,
    bufferedStep2SuccessToastPayloadRef,
    bufferedStep2ToastPendingRef,
    bufferedStep2ToastAwaitCalculationsRef,
    bufferedStep2ToastFlushVersion,
    clearBufferedStep2Toast,
  } = successToast

  const step3BootstrapBaselineRef = useRef<Step3BootstrapSummary | null>(null)
  const step3BootstrapV2BaselineRef = useRef<Step3BootstrapSummary | null>(null)

  const captureStep3BootstrapBaseline = useCallback(() => {
    step3BootstrapBaselineRef.current = step3BootstrapSummary ?? null
    step3BootstrapV2BaselineRef.current = step3BootstrapSummaryV2 ?? null
  }, [step3BootstrapSummary, step3BootstrapSummaryV2])

  const startBufferedStep2ToastSession = useCallback(() => {
    if (lastShownToastRef.current?.title === 'Step 2 allocation completed.') {
      dismissToast()
    }
    captureStep3BootstrapBaseline()
    bufferStep2SuccessToastRef.current = true
    clearBufferedStep2Toast()
  }, [dismissToast, lastShownToastRef, captureStep3BootstrapBaseline, bufferStep2SuccessToastRef, clearBufferedStep2Toast])

  useEffect(() => {
    if (bufferedStep2ToastFlushVersion === 0) return
    if (!bufferedStep2ToastPendingRef.current) return
    const awaitCalculations = bufferedStep2ToastAwaitCalculationsRef.current
    if (awaitCalculations && awaitCalculations === calculations) return

    const payload = bufferedStep2SuccessToastPayloadRef.current
    bufferedStep2SuccessToastPayloadRef.current = null
    bufferedStep2ToastAwaitCalculationsRef.current = null
    bufferedStep2ToastPendingRef.current = false
    if (!payload) return

    const handoffDelta = describeStep3BootstrapDelta(
      step3BootstrapV2BaselineRef.current,
      step3BootstrapSummaryV2
    )
    const description =
      payload.description && handoffDelta
        ? `${payload.description}\n${handoffDelta.main}\n${handoffDelta.details}`
        : handoffDelta
          ? `${handoffDelta.main}\n${handoffDelta.details}`
          : payload.description

    const hasHandoffDelta = !!handoffDelta
    showActionToast(
      payload.title,
      payload.variant,
      description,
      hasHandoffDelta ? { durationMs: 15000, showDurationProgress: true, pauseOnHover: true } : undefined
    )
    step3BootstrapBaselineRef.current = step3BootstrapSummary ?? null
    step3BootstrapV2BaselineRef.current = step3BootstrapSummaryV2 ?? null
  }, [bufferedStep2ToastFlushVersion, calculations, showActionToast, step3BootstrapSummary, step3BootstrapSummaryV2])

  return { captureStep3BootstrapBaseline, startBufferedStep2ToastSession }
}
