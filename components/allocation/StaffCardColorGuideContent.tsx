'use client'

import { cn } from '@/lib/utils'

function LegendDemoCard(props: {
  label: string
  borderClassName?: string
  showBattery?: boolean
  batteryBaseRatio?: number
  batteryTrueRatio?: number
  fteLabel?: string
}) {
  const baseRatio = Math.max(0, Math.min(1, props.batteryBaseRatio ?? 1))
  const trueRatio = Math.max(0, Math.min(baseRatio, props.batteryTrueRatio ?? baseRatio))

  return (
    <div
      className={cn(
        'relative w-[132px] max-w-full rounded-md border-2 bg-card p-1 text-[11px] text-foreground pointer-events-none select-none',
        props.borderClassName ?? 'border-border',
        props.showBattery && 'overflow-hidden'
      )}
    >
      {props.showBattery ? (
        <div className="relative w-full">
          <div
            className="absolute top-0 left-0 h-full rounded-sm border border-blue-300 dark:border-blue-400"
            style={{ width: `${baseRatio * 100}%` }}
          >
            {trueRatio > 0 ? (
              <div
                className="absolute top-0 left-0 h-full rounded-sm bg-blue-50 dark:bg-blue-950/30"
                style={{ width: baseRatio > 0 ? `${(trueRatio / baseRatio) * 100}%` : '0%' }}
              />
            ) : null}
          </div>
          <div className="relative z-10 flex items-center justify-between gap-1">
            <span className="font-medium">{props.label}</span>
            {props.fteLabel ? <span className="text-muted-foreground">{props.fteLabel}</span> : null}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-1">
          <span className="font-medium">{props.label}</span>
          {props.fteLabel ? <span className="text-muted-foreground">{props.fteLabel}</span> : null}
        </div>
      )}
    </div>
  )
}

export function StaffCardColorGuideContent() {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-foreground">Staff card color guide</div>
      <div className="flex flex-col items-start space-y-1">
        <LegendDemoCard label="PCA (non-floating)" borderClassName="border-green-700" />
        <LegendDemoCard
          label="PCA (floating)"
          showBattery={true}
          batteryBaseRatio={0.75}
          batteryTrueRatio={0.5}
          fteLabel="0.5"
        />
        <LegendDemoCard label="APPT" borderClassName="border-[#e7cc32]" />
        <LegendDemoCard label="SPT" borderClassName="border-[#d38e25]" />
      </div>
      <ul className="list-disc pl-4 text-[11px] leading-snug text-muted-foreground space-y-0.5">
        <li>PCA with green border means non-floating PCA.</li>
        <li>PCA with blue thin border and light blue fill shows remaining floating PCA FTE.</li>
        <li>APPT uses yellow border; SPT uses brownish-yellow border.</li>
      </ul>
    </div>
  )
}

