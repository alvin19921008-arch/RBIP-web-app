import { cn } from '@/lib/utils'

/** Snapping many teams to 0.25 FTE slots vs continuous Avg — shared intro. */
export function AvgPcaContinuousVsSlotsGridMismatchParagraph({ className }: { className?: string }) {
  return (
    <p className={cn('text-muted-foreground', className)}>
      Avg PCA/team is computed in <span className="font-medium text-foreground">continuous</span> FTE (fractions).
      Step 3 placement uses <span className="font-medium text-foreground">slots</span> (each 0.25 FTE). Snapping many
      teams to the grid and adding them up can leave a small global mismatch: sometimes extra placeable slots remain,
      sometimes the pool is tight. That is normal—not necessarily an error in the Avg formula.
    </p>
  )
}

export function AvgPcaRaisedTargetSharedSpareParagraph({ className }: { className?: string }) {
  return (
    <p className={cn('text-muted-foreground', className)}>
      <span className="font-medium text-foreground">Raised target (shared spare)</span> (V2) means spare capacity in the
      floating pool was shared at the Step 2→3 handoff so a team’s{' '}
      <span className="font-medium text-foreground">floating target</span> can be slightly higher after rounding; the
      dashboard <span className="font-medium text-foreground">Avg</span> row stays the raw therapist-weighted value.
    </p>
  )
}

export function AvgPcaExtraAfterNeedsDifferentParagraph({ className }: { className?: string }) {
  return (
    <p className={cn('text-muted-foreground', className)}>
      <span className="font-medium text-foreground">Extra after needs</span> is different: optional slots placed in Step
      3.4 after basic floating needs were met—depends on how allocation runs, not the same as a raised target from
      rounding.
    </p>
  )
}

/** Full block: dashboard / schedule formula popover + any surface that needs both ideas. */
export function AvgPcaContinuousVsSlotsExplain({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-2 text-xs leading-snug', className)}>
      <div className="font-semibold">Continuous FTE vs slots</div>
      <AvgPcaContinuousVsSlotsGridMismatchParagraph />
      <AvgPcaRaisedTargetSharedSpareParagraph />
      <AvgPcaExtraAfterNeedsDifferentParagraph />
    </div>
  )
}
