'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AvgPcaContinuousVsSlotsExplain } from '@/components/help/AvgPcaContinuousVsSlotsExplain'
import { AvgPcaFormulaSteps, AvgPcaSanityCheckStaticDescription } from '@/components/help/avgPcaFormulaSteps'

export type AvgPcaFormulaPopoverContentProps = {
  className?: string
  /** When set, replaces the static “Sanity check” footer (e.g. schedule page live totals). */
  sanityCheckFooter?: ReactNode
}

export function AvgPcaFormulaPopoverContent({ className, sanityCheckFooter }: AvgPcaFormulaPopoverContentProps) {
  return (
    <div className={cn('space-y-2 text-xs leading-snug', className)}>
      <div className="font-semibold">Avg PCA/team formula</div>
      <AvgPcaFormulaSteps />

      <div className="border-t border-amber-200/80 pt-2 space-y-1">
        <div className="font-semibold">Sanity check</div>
        {sanityCheckFooter ?? <AvgPcaSanityCheckStaticDescription />}
      </div>

      <div className="border-t border-amber-200/80 pt-2 space-y-2">
        <AvgPcaContinuousVsSlotsExplain />
        <Link
          href="/help/avg-and-slots"
          className="inline-flex text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          What does this mean?
        </Link>
      </div>
    </div>
  )
}
