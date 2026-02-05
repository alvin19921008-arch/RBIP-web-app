import type { Staff, Team, LeaveType } from '@/types/staff'
import type { TherapistAllocation } from '@/types/schedule'
import type { SptOnDayOverrideState } from '@/lib/features/schedule/controller/useScheduleController'

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']
type SlotMode = 'AND' | 'OR'

function normalizeSlotModes(m: any): { am: SlotMode; pm: SlotMode } {
  const am: SlotMode = m?.am === 'OR' ? 'OR' : 'AND'
  const pm: SlotMode = m?.pm === 'OR' ? 'OR' : 'AND'
  return { am, pm }
}

function uniqueSortedSlots(slots: number[]): number[] {
  const set = new Set<number>()
  for (const s of Array.isArray(slots) ? slots : []) {
    if ([1, 2, 3, 4].includes(s)) set.add(s)
  }
  return Array.from(set).sort((a, b) => a - b)
}

function computeEffectiveSlotCountForHalfDay(slots: number[], mode: SlotMode): number {
  if (slots.length === 0) return 0
  if (mode === 'OR' && slots.length > 1) return 1
  return slots.length
}

function deriveSlotDisplay(slots: number[]): 'AM' | 'PM' | 'AM+PM' | null {
  const hasAM = slots.some((s) => s === 1 || s === 2)
  const hasPM = slots.some((s) => s === 3 || s === 4)
  return hasAM && hasPM ? 'AM+PM' : hasAM ? 'AM' : hasPM ? 'PM' : null
}

export function computeSptBaseFteFromSlots(args: {
  enabled: boolean
  contributesFte: boolean
  slots: number[]
  slotModes: { am: SlotMode; pm: SlotMode }
}): { baseFte: number; effectiveSlots: { am: number; pm: number; total: number }; slotDisplay: 'AM' | 'PM' | 'AM+PM' | null } {
  const slots = uniqueSortedSlots(args.slots)
  const slotModes = normalizeSlotModes(args.slotModes)
  const amSlots = slots.filter((s) => s === 1 || s === 2)
  const pmSlots = slots.filter((s) => s === 3 || s === 4)
  const effectiveAM = computeEffectiveSlotCountForHalfDay(amSlots, slotModes.am)
  const effectivePM = computeEffectiveSlotCountForHalfDay(pmSlots, slotModes.pm)
  const effectiveTotal = effectiveAM + effectivePM
  const baseFte = args.enabled && args.contributesFte ? effectiveTotal * 0.25 : 0
  return { baseFte, effectiveSlots: { am: effectiveAM, pm: effectivePM, total: effectiveTotal }, slotDisplay: deriveSlotDisplay(slots) }
}

export function buildSptSlotAssignments(args: {
  team: Team
  slots: number[]
  slotModes: { am: SlotMode; pm: SlotMode }
}): { slot1: Team | null; slot2: Team | null; slot3: Team | null; slot4: Team | null; sptSlotDisplay: 'AM' | 'PM' | 'AM+PM' | null } {
  const slots = uniqueSortedSlots(args.slots)
  const modes = normalizeSlotModes(args.slotModes)

  const slot1 = slots.includes(1) ? args.team : null
  const slot2 = slots.includes(2) ? args.team : null
  const slot3 = slots.includes(3) ? args.team : null
  const slot4 = slots.includes(4) ? args.team : null

  // Apply OR mode rule (keep only the first slot in that half-day when multiple are selected)
  let final1 = slot1
  let final2 = slot2
  let final3 = slot3
  let final4 = slot4

  const amSlots = slots.filter((s) => s === 1 || s === 2)
  const pmSlots = slots.filter((s) => s === 3 || s === 4)

  if (modes.am === 'OR' && amSlots.length > 1) {
    const first = amSlots[0]
    final1 = first === 1 ? args.team : null
    final2 = first === 2 ? args.team : null
  }
  if (modes.pm === 'OR' && pmSlots.length > 1) {
    const first = pmSlots[0]
    final3 = first === 3 ? args.team : null
    final4 = first === 4 ? args.team : null
  }

  return {
    slot1: final1,
    slot2: final2,
    slot3: final3,
    slot4: final4,
    sptSlotDisplay: deriveSlotDisplay(slots),
  }
}

export function applySptFinalEditToTherapistAllocations(args: {
  therapistAllocations: Record<Team, Array<TherapistAllocation & { staff: Staff }>>
  updatesByStaffId: Record<
    string,
    {
      leaveType: LeaveType | null
      fteRemaining: number
      team?: Team
      sptOnDayOverride: SptOnDayOverrideState
    }
  >
  staffById: Map<string, Staff>
  date: Date
}): Record<Team, Array<TherapistAllocation & { staff: Staff }>> {
  const next: Record<Team, Array<TherapistAllocation & { staff: Staff }>> = {
    FO: [],
    SMM: [],
    SFM: [],
    CPPC: [],
    MC: [],
    GMC: [],
    NSM: [],
    DRO: [],
  }

  const staffIds = new Set(Object.keys(args.updatesByStaffId || {}))

  // 1) Start with existing allocations, but remove any SPT allocations we are going to rewrite.
  TEAMS.forEach((team) => {
    const list = args.therapistAllocations?.[team] ?? []
    next[team] = list.filter((a) => {
      const isTarget = staffIds.has(a.staff_id)
      const isSPT = a.staff?.rank === 'SPT' || args.staffById.get(a.staff_id)?.rank === 'SPT'
      return !(isTarget && isSPT)
    })
  })

  // 2) Re-add rewritten SPT allocations (or omit to effectively remove).
  for (const [staffId, u] of Object.entries(args.updatesByStaffId || {})) {
    const staff = args.staffById.get(staffId)
    if (!staff || staff.rank !== 'SPT') continue

    const cfg = u?.sptOnDayOverride
    const enabled = !!cfg?.enabled
    const slots = uniqueSortedSlots(cfg?.slots ?? [])
    if (!enabled || slots.length === 0) {
      continue
    }

    const team = (u.team ?? cfg?.assignedTeam) as Team | undefined
    if (!team || !TEAMS.includes(team)) continue

    // Try to preserve an existing allocation id if present (any team).
    let existing: (TherapistAllocation & { staff: Staff }) | null = null
    for (const t of TEAMS) {
      const found = (args.therapistAllocations?.[t] ?? []).find((a) => a.staff_id === staffId && (a.staff?.rank === 'SPT'))
      if (found) {
        existing = found
        break
      }
    }

    const slotModes = normalizeSlotModes(cfg?.slotModes ?? { am: 'AND', pm: 'AND' })
    const assigned = buildSptSlotAssignments({ team, slots, slotModes })

    const alloc: TherapistAllocation & { staff: Staff } = {
      id: existing?.id ?? `override-spt:${args.date.toISOString().slice(0, 10)}:${staffId}`,
      schedule_id: existing?.schedule_id ?? '',
      staff_id: staffId,
      team,
      fte_therapist: typeof u.fteRemaining === 'number' ? u.fteRemaining : 0,
      fte_remaining: 0,
      slot_whole: null,
      slot1: assigned.slot1,
      slot2: assigned.slot2,
      slot3: assigned.slot3,
      slot4: assigned.slot4,
      leave_type: (u.leaveType ?? null) as any,
      special_program_ids: existing?.special_program_ids ?? null,
      is_substitute_team_head: existing?.is_substitute_team_head ?? false,
      spt_slot_display: assigned.sptSlotDisplay as any,
      is_manual_override: true,
      manual_override_note: 'Step 2.2 SPT final edit',
      staff,
    }

    next[team] = [...next[team], alloc]
  }

  return next
}

