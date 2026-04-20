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
    <div
      className={cn(
        'flex min-h-0 w-full flex-1 flex-col text-xs leading-snug',
        className
      )}
    >
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 pb-2 pt-3 [scrollbar-gutter:stable]">
        <div className="font-semibold text-foreground">Avg PCA/team formula</div>
        <AvgPcaFormulaSteps />

        <div className="space-y-1 border-t border-amber-200/80 pt-2">
          <div className="font-semibold text-foreground">Sanity check</div>
          {sanityCheckFooter ?? <AvgPcaSanityCheckStaticDescription />}
        </div>

        <div className="space-y-2 border-t border-amber-200/80 pt-2">
          <AvgPcaContinuousVsSlotsExplain />
        </div>
      </div>

      <div className="shrink-0 border-t border-amber-200/80 bg-amber-50/95 px-3 py-2.5">
        <Link
          href="/help/avg-and-slots"
          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          title="Opens the Avg PCA and slots guide in Help"
        >
          Go to Help for more on continuous FTE vs slots — full guide
        </Link>
      </div>
    </div>
  )
}
