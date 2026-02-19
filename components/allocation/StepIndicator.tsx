'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Circle, ChevronRight, ChevronLeft, AlertCircle, HelpCircle, FilePenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverArrow, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { COPY_ARRIVAL_ANIMATION_MS } from '@/lib/features/schedule/copyConstants'

interface Step {
  id: string
  number: number
  title: string
  description: string
}

interface StepIndicatorProps {
  steps: Step[]
  currentStep: string
  stepStatus: Record<string, 'pending' | 'completed' | 'modified'>
  onStepClick?: (stepId: string) => void
  canNavigateToStep?: (stepId: string) => boolean
  onNext?: () => void
  onPrevious?: () => void
  canGoNext?: boolean
  canGoPrevious?: boolean
  className?: string
  onInitialize?: () => void
  onInitializePrefetch?: () => void
  onClearStep?: (stepId: string) => void
  // Developer-only: show "Reset to baseline" under the Clear button.
  userRole?: 'developer' | 'admin' | 'user'
  canResetToBaseline?: boolean
  onResetToBaseline?: () => void
  showClear?: boolean
  isInitialized?: boolean
  isLoading?: boolean
  onOpenLeaveSetup?: () => void
  leaveSetupPulseKey?: number
}

export function StepIndicator({
  steps,
  currentStep,
  stepStatus,
  onStepClick,
  canNavigateToStep,
  onNext,
  onPrevious,
  canGoNext = true,
  canGoPrevious = true,
  className,
  onInitialize,
  onInitializePrefetch,
  onClearStep,
  userRole,
  canResetToBaseline,
  onResetToBaseline,
  showClear = true,
  isInitialized = false,
  isLoading = false,
  onOpenLeaveSetup,
  leaveSetupPulseKey,
}: StepIndicatorProps) {
  const currentStepIndex = steps.findIndex(s => s.id === currentStep)
  const currentStepData = steps[currentStepIndex]
  const canClear = ['leave-fte', 'therapist-pca', 'floating-pca', 'bed-relieving'].includes(currentStep)
  const canInitialize = !!onInitialize && ['therapist-pca', 'floating-pca', 'bed-relieving'].includes(currentStep)
  const canResetBaseline =
    (typeof canResetToBaseline === 'boolean' ? canResetToBaseline : userRole === 'developer') &&
    typeof onResetToBaseline === 'function' &&
    canClear
  const [clearMenuOpen, setClearMenuOpen] = useState(false)
  const canOpenLeaveSetup = currentStep === 'leave-fte' && typeof onOpenLeaveSetup === 'function'
  const [isLeaveSetupHighlighted, setIsLeaveSetupHighlighted] = useState(false)
  const lastLeaveSetupPulseKeyRef = useRef<number | null>(leaveSetupPulseKey ?? null)

  useEffect(() => {
    if (leaveSetupPulseKey == null || leaveSetupPulseKey <= 0) return
    if (lastLeaveSetupPulseKeyRef.current === leaveSetupPulseKey) return
    lastLeaveSetupPulseKeyRef.current = leaveSetupPulseKey
    setIsLeaveSetupHighlighted(true)
    const timeout = window.setTimeout(() => {
      setIsLeaveSetupHighlighted(false)
    }, COPY_ARRIVAL_ANIMATION_MS)
    return () => window.clearTimeout(timeout)
  }, [leaveSetupPulseKey])

  return (
    <div
      data-tour="step-indicator"
      className={cn(
        "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 shadow-xs",
        className
      )}
    >
      <div className="flex flex-col gap-2">
        {/* Row 1: step flow */}
        <div className="flex items-center gap-2 py-0.5">
          {/* Left control */}
          <div className="shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onPrevious}
              disabled={!canGoPrevious}
              className={cn("h-7 w-7", !canGoPrevious && "opacity-50 cursor-not-allowed")}
              aria-label="Previous step"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>

          {/* Centered step flow (scrolls if needed) */}
          <div className="flex-1 min-w-0 overflow-x-auto">
            <div className="w-fit mx-auto flex items-center flex-nowrap">
              {steps.map((step, index) => {
                const status = stepStatus[step.id]
                const isCurrent = step.id === currentStep
                const isPast = index < currentStepIndex
                const canNavigate = canNavigateToStep ? canNavigateToStep(step.id) : true

                const showCheck = status === 'completed'
                const circleBase =
                  "inline-flex items-center justify-center rounded-full border transition-colors flex-shrink-0"
                const circleSize = isCurrent ? "w-7 h-7 text-xs" : "w-6 h-6 text-[11px]"
                const circleStyle = showCheck
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : status === 'modified'
                    ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-400 text-yellow-700 dark:text-yellow-300"
                    : isCurrent
                      ? "bg-amber-500 border-amber-500 text-white ring-4 ring-amber-500/20 dark:ring-amber-500/25 shadow-sm"
                      : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200"

                const labelStyle = isCurrent
                  ? "text-slate-900 dark:text-slate-50 font-semibold"
                  : isPast
                    ? "text-emerald-700 dark:text-emerald-400"
                    : status === 'modified'
                      ? "text-yellow-700 dark:text-yellow-300"
                      : "text-slate-600 dark:text-slate-300"

                return (
                  <div key={step.id} className="flex items-center flex-shrink-0">
                    <button
                      type="button"
                      data-tour={`step-${step.number}`}
                      onClick={() => onStepClick?.(step.id)}
                      disabled={!canNavigate}
                      aria-current={isCurrent ? 'step' : undefined}
                      title={step.description}
                      className={cn(
                        "group inline-flex items-center gap-2 rounded-md px-2 py-1 transition-colors rbip-hover-scale",
                        "focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900",
                        isCurrent ? "bg-amber-50 dark:bg-amber-950/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/40",
                        !canNavigate &&
                          "opacity-50 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent hover:scale-100 active:scale-100"
                      )}
                    >
                      <span className={cn(circleBase, circleSize, circleStyle)}>
                        {showCheck ? <Check className="h-4 w-4" /> : <span>{step.number}</span>}
                      </span>
                      <span className={cn("text-xs whitespace-nowrap", labelStyle)}>{step.title}</span>
                      {isCurrent ? (
                        <span className="sr-only">
                          Current step {currentStepIndex + 1} of {steps.length}
                        </span>
                      ) : null}
                    </button>

                    {index < steps.length - 1 ? (
                      <div className="mx-1 flex items-center gap-1" aria-hidden>
                        <div
                          className={cn(
                            "h-0.5 w-4 md:w-6 rounded-full",
                            isPast ? "bg-emerald-500/70" : "bg-slate-300 dark:bg-slate-700"
                          )}
                        />
                        <ChevronRight
                          className={cn(
                            "h-3 w-3",
                            isPast ? "text-emerald-600/70 dark:text-emerald-400/60" : "text-slate-400 dark:text-slate-600"
                          )}
                        />
                        <div
                          className={cn(
                            "h-0.5 w-4 md:w-6 rounded-full",
                            isPast ? "bg-emerald-500/70" : "bg-slate-300 dark:bg-slate-700"
                          )}
                        />
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right controls */}
          <div className="shrink-0 flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onNext}
              disabled={!canGoNext}
              className={cn("h-7 w-7", !canGoNext && "opacity-50 cursor-not-allowed")}
              aria-label="Next step"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50"
                  aria-label="Step status legend"
                >
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                side="bottom"
                className="w-48 rounded-md border border-amber-200 bg-amber-50/95 p-2 text-xs text-slate-800 shadow-md dark:border-amber-900/40 dark:bg-slate-900"
              >
                <PopoverArrow />
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Circle className="h-3 w-3 text-slate-600 dark:text-slate-300" fill="currentColor" />
                    <span>Pending</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
                    <span>Modified</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    <span>Completed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-3 w-3 rounded-full bg-amber-500" aria-hidden />
                    <span>Current</span>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Row 2: centered description + centered actions */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div aria-hidden />
          <div className="min-w-0 justify-self-center text-center flex flex-col items-center gap-2">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-800 dark:text-slate-100">
                Step {currentStepIndex + 1}/{steps.length}
              </span>
              <span className="mx-2 text-slate-300 dark:text-slate-700" aria-hidden>
                |
              </span>
              <span className="truncate">
                {currentStepData?.description ?? currentStepData?.title ?? ''}
              </span>
            </div>

            {(canClear || canInitialize || canOpenLeaveSetup) ? (
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {canClear && showClear && onClearStep ? (
                  canResetBaseline ? (
                    <div className="inline-flex">
                      <Button
                        type="button"
                        onClick={() => onClearStep(currentStep)}
                        disabled={isLoading}
                        size="sm"
                        variant="outline"
                        className="h-8 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40 rounded-r-none"
                      >
                        Clear
                      </Button>
                      <Popover open={clearMenuOpen} onOpenChange={setClearMenuOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            disabled={isLoading}
                            size="sm"
                            variant="outline"
                            className="h-8 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40 rounded-l-none border-l-0 px-2"
                            aria-label="More clear actions"
                          >
                            <ChevronRight
                              className={cn("w-4 h-4 transition-transform", clearMenuOpen ? "rotate-90" : "")}
                            />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          side="bottom"
                          align="end"
                          sideOffset={6}
                          className="w-56 rounded-md border border-slate-200 bg-white p-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
                        >
                          <PopoverArrow width={10} height={6} className="fill-white stroke-slate-200 dark:fill-slate-900 dark:stroke-slate-700" />
                          <PopoverClose asChild>
                            <button
                              className="w-full flex items-center px-3 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                              onClick={() => onResetToBaseline?.()}
                              type="button"
                            >
                              <span className="text-red-600 dark:text-red-300">Reset to baseline</span>
                            </button>
                          </PopoverClose>
                        </PopoverContent>
                      </Popover>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => onClearStep(currentStep)}
                      disabled={isLoading}
                      size="sm"
                      variant="outline"
                      className="h-8 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      Clear
                    </Button>
                  )
                ) : null}
                {canOpenLeaveSetup ? (
                  <Button
                    type="button"
                    onClick={onOpenLeaveSetup}
                    disabled={isLoading}
                    size="sm"
                    variant="default"
                    className={cn(
                      'h-8 bg-blue-600 text-white transition-[transform,box-shadow,filter] duration-200 ease-out hover:bg-blue-700 hover:-translate-y-px hover:shadow-md active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-none',
                      isLeaveSetupHighlighted ? 'rbip-step-cta-highlight' : null
                    )}
                    style={
                      isLeaveSetupHighlighted
                        ? { animationDuration: `${COPY_ARRIVAL_ANIMATION_MS}ms` }
                        : undefined
                    }
                  >
                    <FilePenLine className="h-4 w-4 mr-1.5" />
                    Leave setup
                  </Button>
                ) : null}
                {canInitialize ? (
                  <Button
                    type="button"
                    onClick={onInitialize}
                    onMouseEnter={onInitializePrefetch}
                    onFocus={onInitializePrefetch}
                    disabled={isLoading}
                    size="sm"
                    variant="default"
                    className="h-8 bg-blue-600 text-white transition-[transform,box-shadow,filter] duration-200 ease-out hover:bg-blue-700 hover:-translate-y-px hover:shadow-md active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-none"
                  >
                    {isLoading ? 'Running...' : isInitialized ? 'Re-run Algorithm' : 'Initialize Algorithm'}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div aria-hidden />
        </div>
      </div>
    </div>
  )
}

/**
 * Compact version of the step indicator for smaller spaces
 */
export function StepIndicatorCompact({
  steps,
  currentStep,
  stepStatus,
  className,
}: Pick<StepIndicatorProps, 'steps' | 'currentStep' | 'stepStatus' | 'className'>) {
  const currentStepIndex = steps.findIndex(s => s.id === currentStep)
  const currentStepData = steps[currentStepIndex]

  return (
    <div className={cn("flex items-center gap-3 text-sm", className)}>
      {/* Step dots */}
      <div className="flex items-center gap-1.5">
        {steps.map((step, index) => {
          const status = stepStatus[step.id]
          const isCurrent = step.id === currentStep

          return (
            <div
              key={step.id}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                isCurrent && "w-3 h-3 bg-amber-500",
                !isCurrent && status === 'completed' && "bg-emerald-500",
                !isCurrent && status === 'modified' && "bg-yellow-500",
                !isCurrent && status === 'pending' && "bg-slate-600"
              )}
            />
          )
        })}
      </div>

      {/* Current step label */}
      <span className="text-slate-400">
        Step {currentStepIndex + 1}/{steps.length}: {currentStepData?.title}
      </span>
    </div>
  )
}


