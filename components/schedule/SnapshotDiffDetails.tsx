'use client'

import type { SnapshotDiffResult } from '@/lib/features/schedule/snapshotDiff'

export function SnapshotDiffDetails(props: { result: SnapshotDiffResult }) {
  const MAX = 20
  const formatChanges = (changes: Array<{ field: string; from: string; to: string }>) =>
    changes.map((c) => `${c.field}: ${c.from} → ${c.to}`)

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

  const staffAdded = props.result.staff.added.map((s) => s.name)
  const staffRemoved = props.result.staff.removed.map((s) => s.name)
  const staffChanged = props.result.staff.changed.map((s) => `${s.name} (${formatChanges(s.changes).join('; ')})`)

  const wardsAdded = props.result.wards.added.map((w) => w.name)
  const wardsRemoved = props.result.wards.removed.map((w) => w.name)
  const wardsChanged = props.result.wards.changed.map((w) => `${w.name} (${formatChanges(w.changes).join('; ')})`)

  const prefsChanged = props.result.pcaPreferences.changed.map((p) => `${p.team} (${formatChanges(p.changes).join('; ')})`)

  const spAdded = props.result.specialPrograms.added.map((p) => p.name)
  const spRemoved = props.result.specialPrograms.removed.map((p) => p.name)
  const spChanged = props.result.specialPrograms.changed.map((p) => `${p.name} (${formatChanges(p.changes).join('; ')})`)

  const sptAdded = props.result.sptAllocations.added.map((a) => a.staff_id)
  const sptRemoved = props.result.sptAllocations.removed.map((a) => a.staff_id)
  const sptChanged = props.result.sptAllocations.changed.map((a) => `${a.staff_id} (${formatChanges(a.changes).join('; ')})`)

  const hasStaff = staffAdded.length > 0 || staffRemoved.length > 0 || staffChanged.length > 0
  const hasWards = wardsAdded.length > 0 || wardsRemoved.length > 0 || wardsChanged.length > 0
  const hasPrefs = prefsChanged.length > 0
  const hasSpecialPrograms = spAdded.length > 0 || spRemoved.length > 0 || spChanged.length > 0
  const hasSpt = sptAdded.length > 0 || sptRemoved.length > 0 || sptChanged.length > 0
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
            {staffChanged.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wider mb-0.5">Changed</div>
                {renderList(staffChanged)}
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
            {wardsChanged.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wider mb-0.5">Changed</div>
                {renderList(wardsChanged)}
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
            {renderList(prefsChanged)}
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
            {spChanged.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wider mb-0.5">Changed</div>
                {renderList(spChanged)}
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
            {sptChanged.length > 0 ? (
              <div>
                <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wider mb-0.5">Changed</div>
                {renderList(sptChanged)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

