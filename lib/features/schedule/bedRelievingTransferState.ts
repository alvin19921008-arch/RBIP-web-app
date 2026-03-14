import type {
  BedRelievingNoteRow,
  BedRelievingTransferNote,
  BedRelievingTransferNoteInput,
} from '@/types/schedule'

export function formatBedCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'bed' : 'beds'}`
}

export function hasAnyBedNumbers(rows: BedRelievingNoteRow[] | undefined): boolean {
  return (rows || []).some((row) => (row.bedNumbersText || '').trim().length > 0)
}

export function normalizeBedRelievingTransferEntry(
  entry: BedRelievingTransferNoteInput | null | undefined
): Required<BedRelievingTransferNote> {
  if (Array.isArray(entry)) {
    return {
      resolution: 'taken',
      rows: entry,
    }
  }

  return {
    resolution: entry?.resolution === 'not-released' ? 'not-released' : 'taken',
    rows: Array.isArray(entry?.rows) ? entry.rows : [],
  }
}

export function isBedRelievingTransferDone(
  entry: BedRelievingTransferNoteInput | null | undefined,
  expectedBedCount?: number
): boolean {
  const normalized = normalizeBedRelievingTransferEntry(entry)
  if (normalized.resolution === 'not-released') return expectedBedCount === 1
  return hasAnyBedNumbers(normalized.rows)
}

export function getTransferDisplayMode(
  entry: BedRelievingTransferNoteInput | null | undefined,
  expectedBedCount?: number
): 'shown' | 'hidden' {
  const normalized = normalizeBedRelievingTransferEntry(entry)
  if (normalized.resolution === 'not-released' && expectedBedCount === 1) return 'hidden'
  return 'shown'
}

