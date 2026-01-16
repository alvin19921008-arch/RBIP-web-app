'use client'

import { Check, Circle, ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

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
  onClearStep?: (stepId: string) => void
  showClear?: boolean
  isInitialized?: boolean
  isLoading?: boolean
  errorMessage?: string // Optional error message to display in center area
  bufferTherapistStatus?: string // Optional buffer therapist status message (for step 2)
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
  onClearStep,
  showClear = true,
  isInitialized = false,
  isLoading = false,
  errorMessage,
  bufferTherapistStatus,
}: StepIndicatorProps) {
  const currentStepIndex = steps.findIndex(s => s.id === currentStep)
  const canClear = ['leave-fte', 'therapist-pca', 'floating-pca', 'bed-relieving'].includes(currentStep)
  const canInitialize = !!onInitialize && ['therapist-pca', 'floating-pca', 'bed-relieving'].includes(currentStep)

  return (
    <div className={cn("bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 shadow-xs", className)}>
      {/* Step Progress Bar with Titles */}
      <div className="relative mb-4">
        {/* Connector Lines (behind circles) - positioned at center of w-14 circles (28px) for alignment */}
        <div className="absolute top-7 left-0 right-0 flex items-center">
          {steps.map((step, index) => {
            if (index >= steps.length - 1) return null
            const isPast = index < currentStepIndex
            return (
              <div
                key={`connector-${index}`}
                className={cn(
                  "flex-1 h-0.5 mx-2",
                  isPast ? "bg-emerald-500 dark:bg-emerald-500/70" : "bg-slate-300 dark:bg-slate-600"
                )}
              />
            )
          })}
        </div>

        {/* Step Circles and Titles - align by centering all circles at the same vertical position */}
        <div className="relative flex items-start justify-between">
          {steps.map((step, index) => {
            const status = stepStatus[step.id]
            const isCurrent = step.id === currentStep
            const isPast = index < currentStepIndex
            const canNavigate = canNavigateToStep ? canNavigateToStep(step.id) : true

            return (
              <div key={step.id} className={cn("flex flex-col items-center flex-1 last:flex-none relative z-10", !isCurrent && "mt-1.5")}>
                {/* Step Circle */}
                <button
                  onClick={() => onStepClick?.(step.id)}
                  disabled={!canNavigate}
                  className={cn(
                    "relative flex items-center justify-center rounded-full transition-all mb-2",
                    "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 focus:ring-amber-500",
                    // Size: current step is moderately larger for visual distinction, others are normal
                    isCurrent && "w-14 h-14 border-2 shadow-lg ring-4 ring-amber-500/20 dark:ring-amber-500/30",
                    !isCurrent && "w-10 h-10 border-2",
                    // Status-based colors (independent of current step)
                    status === 'completed' && "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
                    status === 'modified' && "border-yellow-500 bg-yellow-50 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
                    status === 'pending' && "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/20 text-slate-500 dark:text-slate-400",
                    // Hover: enlarge (only if not current)
                    canNavigate && !isCurrent && "cursor-pointer hover:scale-110",
                    // Click: push effect
                    canNavigate && "active:scale-95",
                    !canNavigate && "cursor-not-allowed opacity-50"
                  )}
                >
                  {status === 'completed' ? (
                    <Check className={cn(
                      "transition-all",
                      isCurrent ? "w-7 h-7" : "w-5 h-5"
                    )} />
                  ) : (
                    // Modified and Pending both show number - larger for current step
                    <span className={cn(
                      "font-semibold transition-all",
                      isCurrent ? "text-lg" : "text-sm"
                    )}>{step.number}</span>
                  )}
                </button>

                {/* Step Title under Circle */}
                <div className="text-center px-1 max-w-[120px]">
                  <p className={cn(
                    "font-medium leading-tight break-words",
                    // Title size: current step gets larger text
                    isCurrent && "text-lg",
                    !isCurrent && "text-xs",
                    status === 'completed' && "text-emerald-600 dark:text-emerald-400",
                    status === 'modified' && "text-yellow-600 dark:text-yellow-400",
                    status === 'pending' && "text-slate-500 dark:text-slate-400"
                  )}>
                    {step.title}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Current Step Description and Navigation */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-md px-3 py-2 mb-2">
        <div className="flex items-center justify-between mb-2">
          {/* Previous Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrevious}
            disabled={!canGoPrevious}
            className={cn(
              "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white",
              !canGoPrevious && "opacity-50 cursor-not-allowed"
            )}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>

          {/* Current Step Description or Error Message */}
          <div className="text-center flex-1 px-4">
            {errorMessage ? (
              <div className="flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  {errorMessage}
                </p>
              </div>
            ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {steps[currentStepIndex]?.description}
              </p>
              {bufferTherapistStatus && (
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {bufferTherapistStatus}
                </p>
              )}
            </div>
            )}
          </div>

          {/* Next Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onNext}
            disabled={!canGoNext}
            className={cn(
              "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white",
              !canGoNext && "opacity-50 cursor-not-allowed"
            )}
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        {/* Initialize Algorithm Button */}
        {(canClear || canInitialize) && (
          <div className="flex justify-center gap-2">
            {canClear && showClear && onClearStep ? (
              <Button
                onClick={() => onClearStep(currentStep)}
                disabled={isLoading}
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                Clear
              </Button>
            ) : null}
            {canInitialize ? (
              <Button
                onClick={onInitialize}
                disabled={isLoading}
                variant="default"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isLoading ? 'Running...' : isInitialized ? 'Re-run Algorithm' : 'Initialize Algorithm'}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {/* Step Status Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <Circle className="w-3 h-3 text-slate-500 dark:text-slate-400" fill="currentColor" />
          <span>Pending</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3 text-yellow-500" />
          <span>Modified</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Check className="w-3 h-3 text-emerald-500" />
          <span>Completed</span>
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


