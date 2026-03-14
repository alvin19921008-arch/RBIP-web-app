import { createEmptyTeamRecordFactory } from '@/lib/utils/types'
import { getMainTeam } from '@/lib/utils/teamMerge'
import type { BedRelievingNotesByToTeam, BedRelievingNotesForToTeam, BedRelievingNoteRow } from '@/types/schedule'
import type { Team } from '@/types/staff'

export function projectBedRelievingNotesForDisplay(args: {
  bedRelievingNotesByToTeam: BedRelievingNotesByToTeam | null | undefined
  mergedInto: Partial<Record<Team, Team>>
}): BedRelievingNotesByToTeam {
  const out = createEmptyTeamRecordFactory<BedRelievingNotesForToTeam>(() => ({}))

  for (const [toTeamRaw, fromMapRaw] of Object.entries(args.bedRelievingNotesByToTeam || {})) {
    const toTeam = toTeamRaw as Team
    const mainToTeam = getMainTeam(toTeam, args.mergedInto)
    const existingToTeamMap = out[mainToTeam] || {}
    const fromMap = (fromMapRaw || {}) as BedRelievingNotesForToTeam

    for (const [fromTeamRaw, entryRaw] of Object.entries(fromMap)) {
      const fromTeam = fromTeamRaw as Team
      const mainFromTeam = getMainTeam(fromTeam, args.mergedInto)
      const entry = entryRaw as any
      const existing = (existingToTeamMap as any)[mainFromTeam]
      const normalizedCurrentRows: BedRelievingNoteRow[] = Array.isArray(existing)
        ? existing
        : Array.isArray(existing?.rows)
          ? existing.rows
          : []
      const incomingRows: BedRelievingNoteRow[] = Array.isArray(entry)
        ? entry
        : Array.isArray(entry?.rows)
          ? entry.rows
          : []
      const incomingResolution = entry?.resolution === 'not-released' ? 'not-released' : 'taken'

      ;(existingToTeamMap as any)[mainFromTeam] = {
        resolution:
          normalizedCurrentRows.length > 0 || incomingRows.length > 0 || incomingResolution === 'taken'
            ? 'taken'
            : 'not-released',
        rows: [...normalizedCurrentRows, ...incomingRows],
      }
    }

    out[mainToTeam] = existingToTeamMap
  }

  return out as BedRelievingNotesByToTeam
}

