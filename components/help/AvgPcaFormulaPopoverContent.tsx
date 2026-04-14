'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
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
        <div className="font-semibold">Continuous FTE vs slots</div>
        <p className="text-muted-foreground">
          Avg PCA/team is computed in <span className="font-medium text-foreground">continuous</span> FTE (fractions).
          Step 3 placement uses <span className="font-medium text-foreground">slots</span> (each 0.25 FTE). Snapping
          many teams to the grid and adding them up can leave a small global mismatch: sometimes extra placeable slots
          remain, sometimes the pool is tight. That is normal—not necessarily an error in the Avg formula.
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Raised target (shared spare)</span> (V2) means spare capacity in
          the floating pool was shared at the Step 2→3 handoff so a team’s <span className="font-medium text-foreground">
            floating target
          </span>{' '}
          can be slightly higher after rounding; the dashboard <span className="font-medium text-foreground">Avg</span>{' '}
          row stays the raw therapist-weighted value.{' '}
          <span className="font-medium text-foreground">Extra after needs</span> is different: optional slots placed in
          Step 3.4 after basic floating needs were met—depends on how allocation runs, not the same as a raised target
          from rounding.
        </p>
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
