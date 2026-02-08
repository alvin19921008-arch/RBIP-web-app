'use client'

import type { SnapshotDiffResult } from '@/lib/features/schedule/snapshotDiff'

export function SnapshotDiffDetails(props: { result: SnapshotDiffResult }) {
  const MAX = 20

  const staffLabel = (args: { id: string; name?: string | null }) => {
    const name = typeof args.name === 'string' ? args.name.trim() : ''
    return name ? name : args.id
  }

  type Change = { field: string; from: string; to: string }
  type ChangeTableRow = { item: string; field: string; saved: string; dashboard: string }

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

  const renderChangeTable = (rows: ChangeTableRow[]) => {
    const shown = rows.slice(0, MAX)
    const rest = Math.max(0, rows.length - shown.length)
    return (
      <div className="space-y-1">
        <div className="overflow-x-auto">
          <table className="min-w-[520px] w-full text-[11px] border border-amber-200/60 rounded-md overflow-hidden">
            <thead className="bg-amber-100/60">
              <tr className="text-amber-950/80">
                <th className="text-left font-semibold px-2 py-1 border-b border-amber-200/60 w-[34%]">Item</th>
                <th className="text-left font-semibold px-2 py-1 border-b border-amber-200/60 w-[22%]">Field</th>
                <th className="text-left font-semibold px-2 py-1 border-b border-amber-200/60 w-[22%]">Saved snapshot</th>
                <th className="text-left font-semibold px-2 py-1 border-b border-amber-200/60 w-[22%]">Dashboard</th>
              </tr>
            </thead>
            <tbody className="bg-background/40">
              {shown.map((r, i) => (
                <tr key={`${r.item}-${r.field}-${i}`} className="align-top">
                  <td className="px-2 py-1 border-b border-amber-200/40 text-muted-foreground">{r.item}</td>
                  <td className="px-2 py-1 border-b border-amber-200/40 text-muted-foreground">{r.field}</td>
                  <td className="px-2 py-1 border-b border-amber-200/40 text-muted-foreground whitespace-pre-wrap break-words">
                    {r.saved}
                  </td>
                  <td className="px-2 py-1 border-b border-amber-200/40 text-muted-foreground whitespace-pre-wrap break-words">
                    {r.dashboard}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const hasWards = wardsAdded.length > 0 || wardsRemoved.length > 0 || wardsChangedRows.length > 0
  const hasPrefs = prefsChangedRows.length > 0
  const hasSpecialPrograms = spAdded.length > 0 || spRemoved.length > 0 || spChangedRows.length > 0
  const hasSpt = sptAdded.length > 0 || sptRemoved.length > 0 || sptChangedRows.length > 0
  const hasAny = hasStaff || hasWards || hasPrefs || hasSpecialPrograms || hasSpt

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

