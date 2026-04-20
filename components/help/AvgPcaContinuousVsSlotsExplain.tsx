import { cn } from '@/lib/utils'

/** Snapping many teams to 0.25 FTE slots vs continuous Avg — shared intro. */
export function AvgPcaContinuousVsSlotsGridMismatchParagraph({ className }: { className?: string }) {
  return (
    <p className={cn('text-muted-foreground', className)}>
      Avg PCA/team is computed in <span className="font-medium text-foreground">continuous</span> FTE (fractions).
      Step 3 placement uses <span className="font-medium text-foreground">slots</span> (each 0.25 FTE). Snapping many
      teams to the grid and adding them up can leave a small global mismatch: sometimes extra placeable slots remain,
      sometimes the pool has not enough slots for those needs. That is normal—not necessarily an error in the Avg
      formula.
    </p>
  )
}

export function AvgPcaExtraAfterNeedsDifferentParagraph({ className }: { className?: string }) {
  return (
    <p className={cn('text-muted-foreground', className)}>
      <span className="font-medium text-foreground">Extra after needs</span> are optional Step 3.4 slots after floating
      need is covered. How many depends on spare pool slots and rounding; larger rounding gaps are filled first (team
      order follows gap size).
    </p>
  )
}

/** Full block: dashboard / schedule formula popover + any surface that needs both ideas. */
export function AvgPcaContinuousVsSlotsExplain({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-2 text-xs leading-snug', className)}>
      <div className="font-semibold">Continuous FTE vs slots</div>
      <AvgPcaContinuousVsSlotsGridMismatchParagraph />
      <AvgPcaExtraAfterNeedsDifferentParagraph />
    </div>
  )
}
