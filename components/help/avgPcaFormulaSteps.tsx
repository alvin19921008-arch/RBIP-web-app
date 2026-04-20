/**
 * Shared copy for the Avg PCA/team formula (dashboard + schedule popovers + /help/avg-and-slots).
 * No 'use client' — safe to import from client or server components.
 */
import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Inline formula: monospace + muted pill (chat-style), distinct from body text. */
export function FormulaChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code
      className={cn(
        'rounded-md bg-muted px-1.5 py-px font-mono text-[0.85em] leading-snug text-foreground',
        className
      )}
    >
      {children}
    </code>
  )
}

/** Formula line: width fits content; on narrow viewports can cap at 100% and scroll horizontally. */
export function FormulaBlock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code
      className={cn(
        'mt-1 inline-block w-fit max-w-full overflow-x-auto rounded-md bg-muted/80 px-2 py-1.5 font-mono text-[0.8em] leading-relaxed text-foreground align-top',
        className
      )}
    >
      {children}
    </code>
  )
}

export function AvgPcaFormulaSteps() {
  return (
    <>
      <div className="text-muted-foreground">
        We follow the legacy Excel approach: <span className="font-medium text-foreground">special program</span> PCA
        slots are <span className="font-medium text-foreground">reserved capacity</span> — they are{' '}
        <span className="font-medium text-foreground">set aside first</span> and do{' '}
        <span className="font-medium text-foreground">not</span> count toward ordinary “Assigned” fulfillment for the
        rest.
      </div>

      <div className="space-y-1">
        <div className="font-semibold text-foreground">1) Set aside special program capacity</div>
        <div className="text-muted-foreground">
          Required program slots for this weekday (including Step 2.0 overrides, excluding DRM) are turned into FTE (
          <span className="font-medium text-foreground">each slot = 0.25 FTE</span>). That amount is subtracted before we
          split what is left across teams.
        </div>
        <FormulaBlock>
          special program FTE = (required slots) × 0.25
        </FormulaBlock>
      </div>

      <div className="space-y-1">
        <div className="font-semibold text-foreground">2) What is left to share (base pool)</div>
        <div className="text-muted-foreground">
          Start from <span className="font-medium text-foreground">total PCA on duty (FTE)</span>.{' '}
          <span className="font-medium text-foreground">Take off</span> the special program FTE and the{' '}
          <span className="font-medium text-foreground">DRM add-on FTE</span> first. What remains is the pool we split
          using therapist (PT) weights.
        </div>
        <FormulaBlock>basePool = on-duty FTE − special program FTE − DRM add-on FTE</FormulaBlock>
      </div>

      <div className="space-y-1">
        <div className="font-semibold text-foreground">3) Distribute Avg PCA/team</div>
        <div className="text-muted-foreground">
          Each team’s <span className="font-medium text-foreground">Avg PCA/team</span> is its{' '}
          <span className="font-medium text-foreground">share of PT workload</span> times that pool: (this team’s PT ÷
          all teams’ PT combined) × base pool.
        </div>
        <FormulaBlock>Avg[team] = (PT[team] / totalPT) × basePool</FormulaBlock>
      </div>

      <div className="space-y-1">
        <div className="font-semibold text-foreground">4) DRO on DRM days</div>
        <div className="text-muted-foreground">
          The <span className="font-medium text-foreground">DRO</span> team gets its weighted share from step 3,{' '}
          <span className="font-medium text-foreground">plus</span> the DRM add-on FTE from Step 2.0 (override; often{' '}
          <span className="font-medium text-foreground">0.4</span>). Other teams stay on the weighted share only.
        </div>
        <FormulaBlock>finalAvg[DRO] = baseAvg[DRO] + drmAddOnFte</FormulaBlock>
      </div>
    </>
  )
}

export function AvgPcaSanityCheckStaticDescription() {
  return (
    <>
      <div className="text-muted-foreground">
        For each team, compare <span className="font-medium text-foreground">assigned FTE</span> to{' '}
        <span className="font-medium text-foreground">Avg</span>. On DRM days, use DRO’s{' '}
        <span className="font-medium text-foreground">final</span> Avg (including the add-on). Check:{' '}
        <FormulaChip>balance = Assigned − Avg</FormulaChip>. Then:
      </div>
      <div className="text-muted-foreground">
        <span className="font-medium text-foreground">Over-assigned sum</span> and{' '}
        <span className="font-medium text-foreground">Under-assigned sum</span> should roughly match (small drift can
        happen due to quarter-slot rounding and 2-decimal display).
      </div>
    </>
  )
}
