'use client'

import { AvgPcaExtraAfterNeedsDifferentParagraph } from '@/components/help/AvgPcaContinuousVsSlotsExplain'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/** In-dialog “What does this mean?” — scoped copy for Step 3.1 (no navigation). */
export function WizardAvgSlotsHelpInlinePopover({ className }: { className?: string }) {
  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="link"
          className={cn(
            'h-auto min-h-0 shrink-0 p-0 align-baseline text-sm font-medium text-primary underline-offset-4 hover:underline',
            className
          )}
        >
          What does this mean?
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="z-[100] w-[min(20rem,calc(100vw-2rem))] border border-border bg-popover p-3 text-popover-foreground shadow-lg"
      >
        <div className="space-y-2 text-xs leading-snug">
          <div className="font-semibold text-foreground">Extra after needs</div>
          <AvgPcaExtraAfterNeedsDifferentParagraph />
        </div>
      </PopoverContent>
    </Popover>
  )
}
