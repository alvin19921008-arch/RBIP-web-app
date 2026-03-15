import type { SharedTherapistAllocationMode, Staff, Team, LeaveType } from '@/types/staff'
import type { TherapistAllocation } from '@/types/schedule'
import { TEAMS, createEmptyTeamRecordFactory } from '@/lib/utils/types'

export type SharedTherapistSlotTeams = Partial<Record<1 | 2 | 3 | 4, Team>>
const SLOT_KEYS: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4]

export type SharedTherapistStepUpdate = {
  leaveType?: LeaveType | null
  fteRemaining?: number
  team?: Team
  sharedTherapistModeOverride?: SharedTherapistAllocationMode
  therapistTeamFTEByTeam?: Partial<Record<Team, number>>
  sharedTherapistSlotTeams?: SharedTherapistSlotTeams
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function roundToNearestQuarter(value: number): number {
  return Math.round(value * 4) / 4
}

export function getSharedTherapistBaseAllocationMode(
  staffLike: Pick<Staff, 'shared_therapist_mode'> | null | undefined
): SharedTherapistAllocationMode {
  return staffLike?.shared_therapist_mode === 'single-team' ? 'single-team' : 'slot-based'
}

export function getEffectiveSharedTherapistAllocationMode(args: {
  staffMode?: SharedTherapistAllocationMode | null
  overrideMode?: SharedTherapistAllocationMode | null
}): SharedTherapistAllocationMode {
  return args.overrideMode === 'single-team' || args.overrideMode === 'slot-based'
    ? args.overrideMode
    : args.staffMode === 'single-team'
      ? 'single-team'
      : 'slot-based'
}

export function buildSharedTherapistSlotsFromFte(
  fteRemaining: number,
  capacity: number
): Array<1 | 2 | 3 | 4> {
  const normalized = clampToRange(roundToNearestQuarter(fteRemaining), 0, capacity)
  const slotCount = clampToRange(Math.round(normalized / 0.25), 0, SLOT_KEYS.length)
  return SLOT_KEYS.slice(0, slotCount)
}

export function normalizeSharedTherapistStep1StateForModeChange(args: {
  targetMode: SharedTherapistAllocationMode
  capacity: number
  fteRemaining: number
  fteSubtraction?: number
  availableSlots?: number[]
  invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>
  amPmSelection?: 'AM' | 'PM'
}): {
  fteRemaining: number
  fteSubtraction: number
  availableSlots?: number[]
  invalidSlots?: Array<{ slot: number; timeRange: { start: string; end: string } }>
  amPmSelection?: 'AM' | 'PM'
} {
  if (args.targetMode === 'slot-based') {
    const normalizedFte = clampToRange(roundToNearestQuarter(args.fteRemaining), 0, args.capacity)
    return {
      fteRemaining: normalizedFte,
      fteSubtraction: clampToRange(Number((args.capacity - normalizedFte).toFixed(2)), 0, args.capacity),
      availableSlots: buildSharedTherapistSlotsFromFte(normalizedFte, args.capacity),
      invalidSlots: [],
      amPmSelection: undefined,
    }
  }

  const normalizedFte = clampToRange(Number(args.fteRemaining.toFixed(2)), 0, args.capacity)
  return {
    fteRemaining: normalizedFte,
    fteSubtraction: clampToRange(Number((args.capacity - normalizedFte).toFixed(2)), 0, args.capacity),
    availableSlots: undefined,
    invalidSlots: undefined,
    amPmSelection: undefined,
  }
}

function toSortedSlotEntries(slotTeamBySlot: SharedTherapistSlotTeams | null | undefined): Array<[1 | 2 | 3 | 4, Team]> {
  const entries = Object.entries(slotTeamBySlot ?? {})
    .filter((entry): entry is [string, Team] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
    .map(([slot, team]) => [Number(slot) as 1 | 2 | 3 | 4, team] as [1 | 2 | 3 | 4, Team])
    .filter(([slot, team]) => [1, 2, 3, 4].includes(slot) && TEAMS.includes(team))

  return entries.sort((a, b) => a[0] - b[0])
}

export function buildSharedTherapistTeamFteByTeam(args: {
  slotTeamBySlot: SharedTherapistSlotTeams | null | undefined
}): Partial<Record<Team, number>> {
  const byTeam = new Map<Team, number>()

  for (const [, team] of toSortedSlotEntries(args.slotTeamBySlot)) {
    byTeam.set(team, Number(((byTeam.get(team) ?? 0) + 0.25).toFixed(2)))
  }

  return Object.fromEntries(
    Array.from(byTeam.entries()).filter(([, fte]) => fte > 0)
  ) as Partial<Record<Team, number>>
}

export function getSharedTherapistSuggestedTeam(args: {
  ptPerTeamByTeam: Partial<Record<Team, number>>
  allowedTeams?: Team[]
}): Team {
  const candidates = (args.allowedTeams ?? TEAMS).filter((team) => TEAMS.includes(team))

  return (
    candidates
      .map((team) => ({
        team,
        ptPerTeam: args.ptPerTeamByTeam[team] ?? 0,
      }))
      .sort((a, b) => a.ptPerTeam - b.ptPerTeam)[0]?.team ?? 'FO'
  )
}

function buildAutoSlotMap(
  team: Team,
  availableSlots: Array<1 | 2 | 3 | 4>
): SharedTherapistSlotTeams {
  return Object.fromEntries(
    availableSlots.map((slot) => [slot, team])
  ) as SharedTherapistSlotTeams
}

export function normalizeSharedTherapistStep2StateForModeChange(args: {
  targetMode: SharedTherapistAllocationMode
  staffMode?: SharedTherapistAllocationMode | null
  currentAssignedTeam?: Team
  suggestedTeam: Team
  availableFte: number
  availableSlots: Array<1 | 2 | 3 | 4>
  slotTeamBySlot: SharedTherapistSlotTeams
}): {
  allocationMode: SharedTherapistAllocationMode
  allocationModeOverride?: SharedTherapistAllocationMode
  assignedTeam: Team
  mode: 'auto' | 'custom'
  availableSlots: Array<1 | 2 | 3 | 4>
  slotTeamBySlot: SharedTherapistSlotTeams
} {
  const baseMode = getSharedTherapistBaseAllocationMode({
    shared_therapist_mode: args.staffMode ?? null,
  })
  const allocationModeOverride = args.targetMode === baseMode ? undefined : args.targetMode
  const nextAvailableSlots = buildSharedTherapistSlotsFromFte(args.availableFte, 1)
  const routedTeams = Array.from(
    new Set(
      toSortedSlotEntries(args.slotTeamBySlot)
        .filter(([slot]) => args.availableSlots.includes(slot))
        .map(([, team]) => team)
    )
  )
  const teamForSingleTeam =
    routedTeams.length === 1 ? routedTeams[0] : args.suggestedTeam
  const teamForSlotBased = args.currentAssignedTeam ?? routedTeams[0] ?? args.suggestedTeam
  const assignedTeam = args.targetMode === 'single-team' ? teamForSingleTeam : teamForSlotBased

  return {
    allocationMode: args.targetMode,
    allocationModeOverride,
    assignedTeam,
    mode: assignedTeam === args.suggestedTeam ? 'auto' : 'custom',
    availableSlots: nextAvailableSlots,
    slotTeamBySlot: buildAutoSlotMap(assignedTeam, nextAvailableSlots),
  }
}

export function mergeStep2Point3SharedTherapistOverrides(args: {
  baseOverrides: Record<string, any> | null | undefined
  updates: Record<string, SharedTherapistStepUpdate>
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

    const splitMap = update.therapistTeamFTEByTeam
    const hasSplitMap = !!splitMap && Object.keys(splitMap).length > 0
    const merged: any = {
      ...base,
      ...existing,
      leaveType: update.leaveType ?? base.leaveType ?? null,
      fteRemaining: typeof update.fteRemaining === 'number' ? update.fteRemaining : base.fteRemaining,
    }

    if ('sharedTherapistModeOverride' in update) {
      if (update.sharedTherapistModeOverride === 'slot-based' || update.sharedTherapistModeOverride === 'single-team') {
        merged.sharedTherapistModeOverride = update.sharedTherapistModeOverride
      } else {
        delete merged.sharedTherapistModeOverride
      }
    }

    if (hasSplitMap) {
      merged.therapistTeamFTEByTeam = splitMap
      merged.sharedTherapistSlotTeams = update.sharedTherapistSlotTeams ?? {}
      delete merged.team
    } else if (update.team && TEAMS.includes(update.team)) {
      merged.team = update.team
      delete merged.therapistTeamFTEByTeam
      delete merged.sharedTherapistSlotTeams
    } else {
      delete merged.team
      delete merged.therapistTeamFTEByTeam
      delete merged.sharedTherapistSlotTeams
    }

    nextStaffOverrides[staffId] = merged
  })

  return nextStaffOverrides
}

export function applySharedTherapistEditsToTherapistAllocations(args: {
  therapistAllocations: Record<Team, Array<TherapistAllocation & { staff: Staff }>>
  updatesByStaffId: Record<string, SharedTherapistStepUpdate>
  staffById: Map<string, Staff>
  date: Date
}): Record<Team, Array<TherapistAllocation & { staff: Staff }>> {
  const next = createEmptyTeamRecordFactory<Array<TherapistAllocation & { staff: Staff }>>(() => [])
  const targetStaffIds = new Set(Object.keys(args.updatesByStaffId || {}))

  for (const team of TEAMS) {
    next[team] = (args.therapistAllocations?.[team] ?? []).filter((allocation) => {
      const staff = allocation.staff ?? args.staffById.get(allocation.staff_id)
      const isTarget = targetStaffIds.has(allocation.staff_id)
      const isSharedTherapist = staff?.rank === 'APPT' || staff?.rank === 'RPT'
      return !(isTarget && isSharedTherapist)
    })
  }

  for (const [staffId, update] of Object.entries(args.updatesByStaffId || {})) {
    const staff = args.staffById.get(staffId)
    if (!staff || !['APPT', 'RPT'].includes(staff.rank)) continue

    const existing = TEAMS.flatMap((team) => args.therapistAllocations?.[team] ?? []).find(
      (allocation) => allocation.staff_id === staffId
    )

    const splitMap = update.therapistTeamFTEByTeam
    const hasSplitMap = !!splitMap && Object.keys(splitMap).length > 0

    if (hasSplitMap) {
      const slotTeamBySlot = update.sharedTherapistSlotTeams ?? {}

      for (const team of TEAMS) {
        const fte = splitMap?.[team]
        if (typeof fte !== 'number' || fte <= 0) continue

        const allocation: TherapistAllocation & { staff: Staff } = {
          id: `override-shared-therapist:${args.date.toISOString().slice(0, 10)}:${staffId}:${team}`,
          schedule_id: existing?.schedule_id ?? '',
          staff_id: staffId,
          team,
          fte_therapist: fte,
          fte_remaining: Math.max(0, (update.fteRemaining ?? 1) - fte),
          slot_whole: null,
          slot1: slotTeamBySlot[1] === team ? team : null,
          slot2: slotTeamBySlot[2] === team ? team : null,
          slot3: slotTeamBySlot[3] === team ? team : null,
          slot4: slotTeamBySlot[4] === team ? team : null,
          leave_type: (update.leaveType ?? null) as any,
          special_program_ids: null,
          is_substitute_team_head: false,
          spt_slot_display: null,
          is_manual_override: true,
          manual_override_note: 'Step 2.3 shared therapist edit',
          staff,
        }

        next[team] = [...next[team], allocation]
      }
      continue
    }

    const team = update.team
    if (!team || !TEAMS.includes(team)) continue

    const allocation: TherapistAllocation & { staff: Staff } = {
      id: existing?.id ?? `override-shared-therapist:${args.date.toISOString().slice(0, 10)}:${staffId}`,
      schedule_id: existing?.schedule_id ?? '',
      staff_id: staffId,
      team,
      fte_therapist: typeof update.fteRemaining === 'number' ? update.fteRemaining : 1,
      fte_remaining: 0,
      slot_whole: null,
      slot1: null,
      slot2: null,
      slot3: null,
      slot4: null,
      leave_type: (update.leaveType ?? null) as any,
      special_program_ids: existing?.special_program_ids ?? null,
      is_substitute_team_head: existing?.is_substitute_team_head ?? false,
      spt_slot_display: null,
      is_manual_override: true,
      manual_override_note: 'Step 2.3 shared therapist edit',
      staff,
    }

    next[team] = [...next[team], allocation]
  }

  return next
}
