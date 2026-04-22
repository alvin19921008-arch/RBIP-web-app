'use client'

import { useRef, useState, useEffect } from 'react'
import type { SnapshotDiffResult } from '@/lib/features/schedule/snapshotDiff'

export function SnapshotDiffDetails(props: { result: SnapshotDiffResult }) {
  const MAX = 20

  const resolveStaffName = (id: string) => props.result.staffIdToName?.[id]?.trim() || id

  const staffLabel = (args: { id: string; name?: string | null }) => {
    const name = typeof args.name === 'string' ? args.name.trim() : ''
    return name || resolveStaffName(args.id)
  }

  type Change = { field: string; from: string; to: string }
  type ChangeTableRow = { item: string; field: string; saved: string; dashboard: string }

  const toBoolLabel = (value: unknown) => (value === true ? 'Yes' : value === false ? 'No' : 'Not set')

  const prettyMergeSource = (value: unknown) => {
    if (value === 'main') return 'Main team'
    if (value === 'mergedAway') return 'Merged-away team'
    if (value === 'custom') return 'Custom'
    return value == null ? 'Not set' : String(value)
  }

  const renderMergedPcaOverride = (raw: string) => {
    const trimmed = (raw || '').trim()
    if (!trimmed || trimmed === '∅') return trimmed || '∅'
    if (trimmed === 'null') return 'Not set'
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return trimmed
      const p = parsed as {
        source?: unknown
        updatedAt?: unknown
        preferred_slots?: unknown
        preferred_pca_ids?: unknown
        gym_schedule?: unknown
        avoid_gym_schedule?: unknown
        floor_pca_selection?: unknown
      }
      const preferredSlots = Array.isArray(p.preferred_slots) ? p.preferred_slots.filter((n): n is number => typeof n === 'number') : []
      const preferredPcaIds = Array.isArray(p.preferred_pca_ids) ? p.preferred_pca_ids.filter((s): s is string => typeof s === 'string') : []
      const lines = [
        `Source: ${prettyMergeSource(p.source)}`,
        `Updated at: ${p.updatedAt ? String(p.updatedAt) : 'Not set'}`,
        `Preferred slots: ${preferredSlots.length > 0 ? preferredSlots.join(', ') : 'None'}`,
        `Gym slot: ${typeof p.gym_schedule === 'number' ? p.gym_schedule : 'None'}`,
        `Avoid gym schedule: ${toBoolLabel(p.avoid_gym_schedule)}`,
        `Floor: ${p.floor_pca_selection ? String(p.floor_pca_selection) : 'None'}`,
        `Preferred non-floating PCA: ${preferredPcaIds.length > 0 ? preferredPcaIds.map((id: string) => resolveStaffName(id)).join(', ') : 'None'}`,
      ]
      return lines.join('\n')
    } catch {
      return trimmed
    }
  }

  const formatCellValue = (field: string, value: string) => {
    if (field === 'merged_pca_preferences_override') {
      return renderMergedPcaOverride(value)
    }
    return value
  }

  const buildChangeRows = (items: Array<{ item: string; changes: Change[] }>): ChangeTableRow[] => {
    const rows: ChangeTableRow[] = []
    for (const it of items) {
      for (const c of it.changes || []) {
        rows.push({ item: it.item, field: c.field, saved: c.from, dashboard: c.to })
      }
    }
    return rows
  }

  const renderList = (items: string[]) => {
    const shown = items.slice(0, MAX)
    const rest = Math.max(0, items.length - shown.length)
    return (
      <div className="space-y-1">
        {shown.map((s, i) => (
          <div key={`${s}-${i}`} className="text-xs text-muted-foreground">
            - {s}
          </div>
        ))}
        {rest > 0 ? <div className="text-xs text-muted-foreground">…and {rest} more</div> : null}
      </div>
    )
  }

  const ScrollHintTable = ({ children }: { children: React.ReactNode }) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const [showHint, setShowHint] = useState(false)

    useEffect(() => {
      const el = containerRef.current
      if (!el) return
      const check = () => {
        const hasOverflow = el.scrollWidth > el.clientWidth
        const isAtEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2
        setShowHint(hasOverflow && !isAtEnd)
      }
      check()
      el.addEventListener('scroll', check, { passive: true })
      window.addEventListener('resize', check)
      const id = window.setInterval(check, 500)
      return () => {
        el.removeEventListener('scroll', check)
        window.removeEventListener('resize', check)
        window.clearInterval(id)
      }
    }, [])

    return (
      <div className="relative">
        <div ref={containerRef} className="w-full overflow-x-auto">
          {children}
        </div>
        {showHint ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-amber-100/90 to-transparent" />
        ) : null}
        <div className="pt-1">
          <div className="text-[10px] text-amber-700/80">
            {showHint ? 'Scroll right for more →' : '\u00A0'}
          </div>
        </div>
      </div>
    )
  }

  const renderChangeTable = (rows: ChangeTableRow[]) => {
    const shown = rows.slice(0, MAX)
    const rest = Math.max(0, rows.length - shown.length)
    const grouped: Array<{ item: string; rows: ChangeTableRow[] }> = []
    for (let i = 0; i < shown.length; ) {
      const item = shown[i]?.item ?? ''
      const bucket: ChangeTableRow[] = []
      while (i < shown.length && (shown[i]?.item ?? '') === item) {
        bucket.push(shown[i]!)
        i++
      }
      grouped.push({ item, rows: bucket })
    }
    return (
      <div className="space-y-1">
        <ScrollHintTable>
          <table className="w-full table-fixed text-[11px] border border-amber-200/60 rounded-md overflow-hidden">
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '37%' }} />
              <col style={{ width: '37%' }} />
            </colgroup>
            <thead className="bg-amber-100/60">
              <tr className="text-amber-950/80">
                <th className="text-left font-semibold px-2 py-1 border-b border-amber-200/60">Item</th>
                <th className="text-left font-semibold px-2 py-1 border-b border-amber-200/60">Field</th>
                <th className="text-left font-semibold px-2 py-1 border-b border-amber-200/60">Saved snapshot</th>
                <th className="text-left font-semibold px-2 py-1 border-b border-amber-200/60">Dashboard</th>
              </tr>
            </thead>
            <tbody className="bg-background/40">
              {grouped.flatMap((g, gi) => {
                return g.rows.map((r, ri) => {
                  const key = `${g.item}-${r.field}-${gi}-${ri}`
                  return (
                    <tr key={key} className="align-top">
                      {ri === 0 ? (
                        <td
                          rowSpan={g.rows.length}
                          className="px-2 py-1 border-b border-amber-200/40 text-foreground/80 whitespace-normal break-words"
                        >
                          {g.item}
                        </td>
                      ) : null}
                      <td className="px-2 py-1 border-b border-amber-200/40 text-muted-foreground whitespace-normal break-words">
                        {r.field}
                      </td>
                      <td className="px-2 py-1 border-b border-amber-200/40 text-muted-foreground whitespace-pre-wrap break-words">
                        {formatCellValue(r.field, r.saved)}
                      </td>
                      <td className="px-2 py-1 border-b border-amber-200/40 text-muted-foreground whitespace-pre-wrap break-words">
                        {formatCellValue(r.field, r.dashboard)}
                      </td>
                    </tr>
                  )
                })
              })}
            </tbody>
          </table>
        </ScrollHintTable>
        {rest > 0 ? <div className="text-xs text-muted-foreground">…and {rest} more</div> : null}
      </div>
    )
  }

  const staffAdded = props.result.staff.added.map((s) => s.name)
  const staffRemoved = props.result.staff.removed.map((s) => s.name)
  const staffChangedRows = buildChangeRows(
    props.result.staff.changed.map((s) => ({ item: staffLabel({ id: s.id, name: s.name }), changes: s.changes }))
  )

  const wardsAdded = props.result.wards.added.map((w) => w.name)
  const wardsRemoved = props.result.wards.removed.map((w) => w.name)
  const wardsChangedRows = buildChangeRows(props.result.wards.changed.map((w) => ({ item: w.name, changes: w.changes })))

  const teamSettingsChangedRows = buildChangeRows(
    props.result.teamSettings.changed.map((row) => ({ item: row.team, changes: row.changes }))
  )

  const prefsChangedRows = buildChangeRows(
    props.result.pcaPreferences.changed.map((p) => ({ item: p.team, changes: p.changes }))
  )

  const spAdded = props.result.specialPrograms.added.map((p) => p.name)
  const spRemoved = props.result.specialPrograms.removed.map((p) => p.name)
  const spChangedRows = buildChangeRows(props.result.specialPrograms.changed.map((p) => ({ item: p.name, changes: p.changes })))

  const sptAdded = props.result.sptAllocations.added.map((a) => staffLabel({ id: a.staff_id, name: a.staff_name }))
  const sptRemoved = props.result.sptAllocations.removed.map((a) => staffLabel({ id: a.staff_id, name: a.staff_name }))
  const sptChangedRows = buildChangeRows(
    props.result.sptAllocations.changed.map((a) => ({
      item: staffLabel({ id: a.staff_id, name: a.staff_name }),
      changes: a.changes,
    }))
  )

  const hasStaff = staffAdded.length > 0 || staffRemoved.length > 0 || staffChangedRows.length > 0
  const hasTeamSettings = teamSettingsChangedRows.length > 0
  const hasWards = wardsAdded.length > 0 || wardsRemoved.length > 0 || wardsChangedRows.length > 0
  const hasPrefs = prefsChangedRows.length > 0
  const hasSpecialPrograms = spAdded.length > 0 || spRemoved.length > 0 || spChangedRows.length > 0
  const hasSpt = sptAdded.length > 0 || sptRemoved.length > 0 || sptChangedRows.length > 0
  const hasAny = hasStaff || hasTeamSettings || hasWards || hasPrefs || hasSpecialPrograms || hasSpt

  return (
    <div className="space-y-3">
      {!hasAny ? <div className="text-sm text-muted-foreground">No differences detected.</div> : null}

      {hasStaff ? (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-amber-950/80">Staff</div>
          <div className="pl-2 border-l-2 border-amber-200/50 space-y-2">
            {staffAdded.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider mb-0.5">Added</div>
                {renderList(staffAdded)}
              </div>
            ) : null}
            {staffRemoved.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-rose-600 uppercase tracking-wider mb-0.5">Removed</div>
                {renderList(staffRemoved)}
              </div>
            ) : null}
            {staffChangedRows.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wider mb-0.5">Changed</div>
                {renderChangeTable(staffChangedRows)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasWards ? (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-amber-950/80">Wards</div>
          <div className="pl-2 border-l-2 border-amber-200/50 space-y-2">
            {wardsAdded.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider mb-0.5">Added</div>
                {renderList(wardsAdded)}
              </div>
            ) : null}
            {wardsRemoved.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-rose-600 uppercase tracking-wider mb-0.5">Removed</div>
                {renderList(wardsRemoved)}
              </div>
            ) : null}
            {wardsChangedRows.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wider mb-0.5">Changed</div>
                {renderChangeTable(wardsChangedRows)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasTeamSettings ? (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-amber-950/80">Team Settings</div>
          <div className="pl-2 border-l-2 border-amber-200/50 space-y-2">
            <div>
              <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wider mb-0.5">Changed</div>
              {renderChangeTable(teamSettingsChangedRows)}
            </div>
          </div>
        </div>
      ) : null}

      {hasPrefs ? (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-amber-950/80">PCA Preferences</div>
          <div className="pl-2 border-l-2 border-amber-200/50 space-y-2">
            <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wider mb-0.5">Changed</div>
            {renderChangeTable(prefsChangedRows)}
          </div>
        </div>
      ) : null}

      {hasSpecialPrograms ? (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-amber-950/80">Special Programs</div>
          <div className="pl-2 border-l-2 border-amber-200/50 space-y-2">
            {spAdded.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider mb-0.5">Added</div>
                {renderList(spAdded)}
              </div>
            ) : null}
            {spRemoved.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-rose-600 uppercase tracking-wider mb-0.5">Removed</div>
                {renderList(spRemoved)}
              </div>
            ) : null}
            {spChangedRows.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wider mb-0.5">Changed</div>
                {renderChangeTable(spChangedRows)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasSpt ? (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-amber-950/80">SPT Allocations</div>
          <div className="pl-2 border-l-2 border-amber-200/50 space-y-2">
            {sptAdded.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider mb-0.5">Added</div>
                {renderList(sptAdded)}
              </div>
            ) : null}
            {sptRemoved.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-rose-600 uppercase tracking-wider mb-0.5">Removed</div>
                {renderList(sptRemoved)}
              </div>
            ) : null}
            {sptChangedRows.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wider mb-0.5">Changed</div>
                {renderChangeTable(sptChangedRows)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

