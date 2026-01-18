'use client'

import { X } from 'lucide-react'
import type { SnapshotDiffResult } from '@/lib/features/schedule/snapshotDiff'
import { formatDateDDMMYYYY } from '@/lib/features/schedule/date'

export function SnapshotDiffPopover(props: {
  open: boolean
  panelRef: React.RefObject<HTMLDivElement | null>
  position: { left: number; top: number } | null
  selectedDate: Date
  loading: boolean
  error: string | null
  result: SnapshotDiffResult | null
  onClose: () => void
}) {
  if (!props.open) return null

  return (
    <div
      ref={props.panelRef}
      className="fixed z-[10500] w-[min(520px,calc(100vw-24px))] rounded-lg border border-border bg-background shadow-lg"
      style={props.position ? { left: props.position.left, top: props.position.top } : undefined}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Snapshot differences</div>
          <div className="text-xs text-muted-foreground">
            Snapshot for {formatDateDDMMYYYY(props.selectedDate)} vs current dashboard configuration
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={props.onClose}
          className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-3 text-sm">
        {props.loading ? (
          <div className="text-sm text-muted-foreground">Loading current dashboard config…</div>
        ) : props.error ? (
          <div className="text-sm text-destructive">Failed to load differences: {props.error}</div>
        ) : props.result ? (
          <SnapshotDiffDetails result={props.result} />
        ) : (
          <div className="text-sm text-muted-foreground">No differences computed yet.</div>
        )}
      </div>
    </div>
  )
}

function SnapshotDiffDetails(props: { result: SnapshotDiffResult }) {
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
        <details className="rounded-md border border-border bg-muted/20 p-2">
          <summary className="cursor-pointer select-none text-sm font-medium">
            Staff{' '}
            <span className="text-xs text-muted-foreground">
              (added {staffAdded.length}, removed {staffRemoved.length}, changed {props.result.staff.changed.length})
            </span>
          </summary>
          <div className="mt-2 space-y-2">
            {staffAdded.length > 0 ? (
              <div>
                <div className="text-xs font-semibold">Added</div>
                {renderList(staffAdded)}
              </div>
            ) : null}
            {staffRemoved.length > 0 ? (
              <div>
                <div className="text-xs font-semibold">Removed</div>
                {renderList(staffRemoved)}
              </div>
            ) : null}
            {staffChanged.length > 0 ? (
              <div>
                <div className="text-xs font-semibold">Changed</div>
                {renderList(staffChanged)}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {hasWards ? (
        <details className="rounded-md border border-border bg-muted/20 p-2">
          <summary className="cursor-pointer select-none text-sm font-medium">
            Wards{' '}
            <span className="text-xs text-muted-foreground">
              (added {wardsAdded.length}, removed {wardsRemoved.length}, changed {props.result.wards.changed.length})
            </span>
          </summary>
          <div className="mt-2 space-y-2">
            {wardsAdded.length > 0 ? (
              <div>
                <div className="text-xs font-semibold">Added</div>
                {renderList(wardsAdded)}
              </div>
            ) : null}
            {wardsRemoved.length > 0 ? (
              <div>
                <div className="text-xs font-semibold">Removed</div>
                {renderList(wardsRemoved)}
              </div>
            ) : null}
            {wardsChanged.length > 0 ? (
              <div>
                <div className="text-xs font-semibold">Changed</div>
                {renderList(wardsChanged)}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {hasPrefs ? (
        <details className="rounded-md border border-border bg-muted/20 p-2">
          <summary className="cursor-pointer select-none text-sm font-medium">
            PCA preferences <span className="text-xs text-muted-foreground">(changed {prefsChanged.length})</span>
          </summary>
          <div className="mt-2">{renderList(prefsChanged)}</div>
        </details>
      ) : null}

      {hasSpecialPrograms ? (
        <details className="rounded-md border border-border bg-muted/20 p-2">
          <summary className="cursor-pointer select-none text-sm font-medium">
            Special programs{' '}
            <span className="text-xs text-muted-foreground">
              (added {spAdded.length}, removed {spRemoved.length}, changed {props.result.specialPrograms.changed.length})
            </span>
          </summary>
          <div className="mt-2 space-y-2">
            {spAdded.length > 0 ? (
              <div>
                <div className="text-xs font-semibold">Added</div>
                {renderList(spAdded)}
              </div>
            ) : null}
            {spRemoved.length > 0 ? (
              <div>
                <div className="text-xs font-semibold">Removed</div>
                {renderList(spRemoved)}
              </div>
            ) : null}
            {spChanged.length > 0 ? (
              <div>
                <div className="text-xs font-semibold">Changed</div>
                {renderList(spChanged)}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {hasSpt ? (
        <details className="rounded-md border border-border bg-muted/20 p-2">
          <summary className="cursor-pointer select-none text-sm font-medium">
            SPT allocations{' '}
            <span className="text-xs text-muted-foreground">
              (added {sptAdded.length}, removed {sptRemoved.length}, changed {props.result.sptAllocations.changed.length})
            </span>
          </summary>
          <div className="mt-2 space-y-2">
            {sptAdded.length > 0 ? (
              <div>
                <div className="text-xs font-semibold">Added</div>
                {renderList(sptAdded)}
              </div>
            ) : null}
            {sptRemoved.length > 0 ? (
              <div>
                <div className="text-xs font-semibold">Removed</div>
                {renderList(sptRemoved)}
              </div>
            ) : null}
            {sptChanged.length > 0 ? (
              <div>
                <div className="text-xs font-semibold">Changed</div>
                {renderList(sptChanged)}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  )
}

