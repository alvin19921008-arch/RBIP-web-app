'use client'

import { X } from 'lucide-react'
import type { SnapshotDiffResult } from '@/lib/features/schedule/snapshotDiff'
import { formatDateDDMMYYYY } from '@/lib/features/schedule/date'
import { SnapshotDiffDetails } from '@/components/schedule/SnapshotDiffDetails'

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
