'use client'

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type Step2DownstreamImpact = {
  step3Outdated: boolean
  step4Outdated: boolean
}

function renderMessage(impact: Step2DownstreamImpact): ReactNode {
  const step3 = !!impact.step3Outdated
  const step4 = !!impact.step4Outdated
  if (step3 && step4) {
    return (
      <span className="flex flex-col gap-0.5">
        <span>This Step 2 change made Step 3 (Floating PCA) and Step 4 (Bed relieving) out of date.</span>
        <span>Re-run downstream steps before saving.</span>
      </span>
    )
  }
  if (step3) {
    return 'This Step 2 change made Step 3 (Floating PCA) out of date. Re-run Step 3 before saving.'
  }
  return 'This Step 2 change made Step 4 (Bed relieving) out of date. Re-run Step 4 before saving.'
}

export function Step2DialogReminder(props: {
  impact?: Step2DownstreamImpact | null
  className?: string
}) {
  const impact = props.impact
  if (!impact?.step3Outdated && !impact?.step4Outdated) return null

  return (
    <div
      className={cn(
        'mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-900',
        'dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100',
        props.className
      )}
      role="note"
    >
      {renderMessage(impact)}
    </div>
  )
}

