import type { LeaveType, Team } from '@/types/staff'

type Step2Point2SptFinalEditUpdate = {
  leaveType?: LeaveType | null
  fteRemaining?: number
  fteSubtraction?: number
  team?: Team
  sptOnDayOverride?: {
    enabled?: boolean
    assignedTeam?: Team | null
    slots?: number[]
  } | null
}

export function mergeStep2Point2StaffOverrides(args: {
  baseOverrides: Record<string, any> | null | undefined
  updates: Record<string, Step2Point2SptFinalEditUpdate>
}): Record<string, any> {
  const nextStaffOverrides: Record<string, any> = { ...(args.baseOverrides ?? {}) }

  Object.entries(args.updates || {}).forEach(([staffId, update]) => {
    const existing = nextStaffOverrides[staffId]
    const base =
      existing ??
      ({
        leaveType: update.leaveType ?? null,
        fteRemaining: typeof update.fteRemaining === 'number' ? update.fteRemaining : 0,
      } as any)

    const cfg: any = update?.sptOnDayOverride ?? {}
    const enabled = !!cfg.enabled
    const slots = Array.isArray(cfg.slots) ? cfg.slots : []
    const shouldAllocate = enabled && slots.length > 0
    const team = shouldAllocate ? ((update.team ?? cfg.assignedTeam) as Team | undefined) : undefined

    const merged: any = {
      ...base,
      ...existing,
      leaveType: update.leaveType ?? base.leaveType ?? null,
      fteSubtraction: typeof update.fteSubtraction === 'number' ? update.fteSubtraction : existing?.fteSubtraction,
      fteRemaining: typeof update.fteRemaining === 'number' ? update.fteRemaining : base.fteRemaining,
      sptOnDayOverride: {
        ...cfg,
        assignedTeam: shouldAllocate ? (team ?? null) : null,
      },
    }

    if (team) merged.team = team
    else delete merged.team

    nextStaffOverrides[staffId] = merged
  })

  return nextStaffOverrides
}
