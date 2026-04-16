'use client'

import { cn } from '@/lib/utils'
import { StepIndicator, type StepIndicatorProps } from '@/components/allocation/StepIndicator'

export type ScheduleWorkflowStepShellProps = StepIndicatorProps & {
  isViewingMode: boolean
  stepIndicatorCollapsed: boolean
}

/**
 * Macro-step workflow chrome: collapsible strip + `StepIndicator` (Next/Previous, step pills, legend).
 * Per architecture plan Phase 2b — not in-step wizard bodies (`ui/steps/`).
 */
export function ScheduleWorkflowStepShell({
  isViewingMode,
  stepIndicatorCollapsed,
  ...stepIndicatorProps
}: ScheduleWorkflowStepShellProps) {
  return (
    <div
      className={cn(
        'vt-mode-anim shrink-0',
        'overflow-hidden transition-[max-height,opacity,transform,margin] duration-300 ease-in-out',
        isViewingMode
          ? 'max-h-0 opacity-0 -translate-y-2 mb-0 pointer-events-none'
          : stepIndicatorCollapsed
            ? 'max-h-0 opacity-0 mb-0 overflow-hidden'
            : 'max-h-[9999px] opacity-100 translate-y-0 mb-4'
      )}
      aria-hidden={isViewingMode || stepIndicatorCollapsed}
    >
      <StepIndicator {...stepIndicatorProps} />
    </div>
  )
}
