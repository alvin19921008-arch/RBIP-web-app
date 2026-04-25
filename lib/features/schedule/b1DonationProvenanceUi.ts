import { formatV2RepairReasonLabel } from '@/lib/features/schedule/pcaTrackerTooltip'
import type { B1DonationProvenanceEntry } from '@/types/schedule'

function timeRangeForSlot(slot: 1 | 2 | 3 | 4): string {
  if (slot === 1) return '0900-1030'
  if (slot === 2) return '1030-1200'
  if (slot === 3) return '1330-1500'
  return '1500-1630'
}

export function formatB1DonationStep34Line(entry: B1DonationProvenanceEntry): string {
  const reason = formatV2RepairReasonLabel(entry.repairIntent) ?? 'repair'
  return `A slot was donated to ${entry.toTeam} for ${reason}.`
}

export function formatB1DonationTrackerLine(entry: B1DonationProvenanceEntry): string {
  const tr = timeRangeForSlot(entry.slot)
  const reason = formatV2RepairReasonLabel(entry.repairIntent) ?? 'Repair'
  return `Slot ${entry.slot} (${tr}) → ${entry.toTeam} · ${reason}`
}
