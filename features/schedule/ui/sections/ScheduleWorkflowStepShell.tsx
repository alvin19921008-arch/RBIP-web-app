'use client'

import { cn } from '@/lib/utils'
import { StepIndicator, type StepIndicatorProps } from '@/components/allocation/StepIndicator'

export type ScheduleWorkflowStepShellProps = StepIndicatorProps & {
  isDisplayMode: boolean
  /** Split layout: hide the step strip for space (same class of chrome hiding as display mode). */
  isSplitMode?: boolean
}

/**
 * Macro-step workflow chrome: `StepIndicator` (Next/Previous, step pills, legend).
 * The strip is hidden in **display mode** or **split**; the header “Display” control is the read-only / simplified chrome path (no separate “hide steps” toggle).
 * Per architecture plan Phase 2b — not in-step wizard bodies (`ui/steps/`).
 */
export function ScheduleWorkflowStepShell({
  isDisplayMode,
  isSplitMode = false,
  ...stepIndicatorProps
}: ScheduleWorkflowStepShellProps) {
  const stripHidden = isDisplayMode || isSplitMode
  return (
    <div
      className={cn(
        'vt-mode-anim shrink-0',
        'overflow-hidden transition-[max-height,opacity,transform,margin] duration-300 ease-in-out',
        isDisplayMode
          ? 'max-h-0 opacity-0 -translate-y-2 mb-0 pointer-events-none'
          : isSplitMode
            ? 'max-h-0 opacity-0 mb-0 overflow-hidden'
            : 'max-h-[9999px] opacity-100 translate-y-0 mb-4'
      )}
      aria-hidden={stripHidden}
    >
      <StepIndicator {...stepIndicatorProps} />
    </div>
  )
}
