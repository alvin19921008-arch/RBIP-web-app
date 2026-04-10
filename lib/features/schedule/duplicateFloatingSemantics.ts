import { getSubstitutionSlotsForTeam } from '@/lib/utils/substitutionFor'
import type { SlotAssignmentLog } from '@/types/schedule'
import type { Team } from '@/types/staff'

function dedupeAssignmentsByPcaId(logs: SlotAssignmentLog[]): SlotAssignmentLog[] {
  const seen = new Set<string>()
  const out: SlotAssignmentLog[] = []
  logs.forEach((log, index) => {
    const key = log.pcaId?.trim() || log.pcaName?.trim() || `row-${index}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(log)
  })
  return out
}

export function isPcaSubstitutingNonFloatingOnSlotForTeam(args: {
  staffOverrides?: Record<string, any>
  pcaId?: string
  team: Team
  slot: 1 | 2 | 3 | 4
}): boolean {
  const { staffOverrides, pcaId, team, slot } = args
  if (!pcaId || !staffOverrides) return false
  const substitutionSlots = getSubstitutionSlotsForTeam(staffOverrides[pcaId], team)
  return substitutionSlots.includes(slot)
}

export function getQualifyingDuplicateFloatingAssignmentsForSlot(args: {
  team: Team
  slot: 1 | 2 | 3 | 4
  logsForSlot: SlotAssignmentLog[]
  staffOverrides?: Record<string, any>
}): SlotAssignmentLog[] {
  const step34Logs = args.logsForSlot.filter((entry) => entry.assignedIn === 'step34')
  const qualifying = step34Logs.filter(
    (entry) =>
      !isPcaSubstitutingNonFloatingOnSlotForTeam({
        staffOverrides: args.staffOverrides,
        pcaId: entry.pcaId,
        team: args.team,
        slot: args.slot,
      })
  )

  return dedupeAssignmentsByPcaId(qualifying)
}
