'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

function LegendMiniCard(props: { name: string; detail?: ReactNode; borderClassName?: string }) {
  return (
    <div
      className={cn(
        'w-[132px] max-w-full rounded-md border-2 bg-card px-2 py-1 text-[11px]',
        props.borderClassName ?? 'border-border'
      )}
    >
      <div className="font-medium leading-tight">{props.name}</div>
      {props.detail ? <div className="text-[11px] leading-tight">{props.detail}</div> : null}
    </div>
  )
}

export function PcaAllocationLegendPopover(props: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-5 w-5 p-0 text-muted-foreground', props.className)}
          title="PCA legend"
          aria-label="PCA legend"
        >
          <Info className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-72 rounded-md border border-amber-200 bg-amber-50/95 p-3">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-amber-950">PCA allocation legend</div>

          <div className="flex flex-col items-start space-y-1">
            <LegendMiniCard
              name="陳小明"
              detail={
                <span>
                  AM <span className="text-blue-600">(1030-1100)</span>
                </span>
              }
            />
            <LegendMiniCard name="王美玲" detail={<span className="text-green-700 font-medium">AM</span>} />
            <LegendMiniCard name="李志強*" borderClassName="border-green-700" detail="Whole day" />
          </div>

          <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-amber-950">
            <li>Blue text in brackets shows partially present time.</li>
            <li>Green text indicates floating PCA is covering non-floating slots.</li>
            <li>Name with * indicates buffer PCA.</li>
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  )
}
