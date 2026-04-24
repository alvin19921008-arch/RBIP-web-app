import type { GymBlockedDuplicateReliefEntry } from '@/types/schedule'

function timeRangeForSlot(slot: 1 | 2 | 3 | 4): string {
  if (slot === 1) return '0900-1030'
  if (slot === 2) return '1030-1200'
  if (slot === 3) return '1330-1500'
  return '1500-1630'
}

/**
 * User-facing (Option B): why A1 duplicate → recipient relief was not used — recipient’s gym column
 * is the same as the duplicate slot.
 */
export function formatGymBlockedDuplicateReliefUserMessage(e: GymBlockedDuplicateReliefEntry): string {
  const tr = timeRangeForSlot(e.slot)
  return `Moving a duplicate floater from ${e.duplicateTeam} to ${e.recipientTeam} would put a floating PCA in ${e.recipientTeam}'s gym column (${tr}), so that option is blocked.`
}
