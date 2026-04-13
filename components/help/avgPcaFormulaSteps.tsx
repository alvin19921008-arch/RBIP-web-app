/**
 * Shared copy for the Avg PCA/team formula (dashboard + schedule popovers + /help/avg-and-slots).
 * No 'use client' — safe to import from client or server components.
 */
export function AvgPcaFormulaSteps() {
  return (
    <>
      <div className="text-muted-foreground">
        We follow the legacy Excel semantics: special program PCA slots are treated as reserved capacity and
        do not count toward “Assigned” fulfillment.
      </div>

      <div className="space-y-1">
        <div className="font-semibold">1) Reserve special program slots</div>
        <div className="text-muted-foreground">
          <span className="font-mono">reservedSpecialProgramSlotsFTE</span> = sum of required program slots for this
          weekday (incl. Step 2.0 overrides, excludes DRM) × 0.25
        </div>
      </div>

      <div className="space-y-1">
        <div className="font-semibold">2) Base pool (earmark DRM first)</div>
        <div className="text-muted-foreground font-mono">
          basePool = totalPCAOnDuty − reservedSpecialProgramSlotsFTE − drmAddOnFte
        </div>
      </div>

      <div className="space-y-1">
        <div className="font-semibold">3) Distribute base Avg PCA/team</div>
        <div className="text-muted-foreground font-mono">
          baseAvg[team] = (PT[team] / totalPT) × basePool
        </div>
      </div>

      <div className="space-y-1">
        <div className="font-semibold">4) DRO special handling (DRM)</div>
        <div className="text-muted-foreground">
          <span className="font-mono">finalAvg[DRO]</span> = <span className="font-mono">baseAvg[DRO]</span> +{' '}
          <span className="font-mono">drmAddOnFte</span> (from Step 2.0 override, default 0.4)
        </div>
      </div>
    </>
  )
}

export function AvgPcaSanityCheckStaticDescription() {
  return (
    <>
      <div className="text-muted-foreground">
        For each team, compute <span className="font-mono">balance = Assigned − Target</span>. Use{' '}
        <span className="font-mono">finalAvg[DRO]</span> as DRO’s target on DRM days (otherwise use base Avg). Then:
      </div>
      <div className="text-muted-foreground">
        sum of positive balances ≈ absolute sum of negative balances (small drift can happen due to quarter-slot
        rounding and 2‑decimal display).
      </div>
    </>
  )
}
