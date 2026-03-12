'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Tooltip } from '@/components/ui/tooltip'
import { useAccessControl } from '@/lib/access/useAccessControl'

function formatFriendlyDateTime(value: unknown): string {
  const raw = typeof value === 'string' ? value : ''
  if (!raw) return '--'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
  } catch {
    return d.toLocaleString()
  }
}

function formatDisplayConfigId(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  if (!Number.isFinite(n) || n <= 0) return '#00000'
  return `#${String(Math.trunc(n)).padStart(5, '0')}`
}

const SYNC_TOOLTIP = 'Schedules can use saved snapshots per date. Use Dashboard → Sync / Publish to compare/sync.'

export function DashboardConfigMetaInline() {
  const supabase = createClientComponentClient()
  const access = useAccessControl()
  const [head, setHead] = useState<{ global_updated_at?: string; global_version?: number } | null>(null)
  const canShowInternalVersion =
    (access.role === 'admin' || access.role === 'developer') &&
    access.can('dashboard.sync-publish.show-internal-config-version')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await supabase.rpc('get_config_global_head_v1')
      if (cancelled) return
      if (!res.error) setHead(res.data)
    })().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [supabase])

  return (
    <span className="text-sm text-blue-800">
      <Tooltip side="top" content={SYNC_TOOLTIP}>
        <span className="cursor-help">Global config {formatFriendlyDateTime(head?.global_updated_at)}</span>
      </Tooltip>
      {canShowInternalVersion && typeof head?.global_version === 'number' ? (
        <Tooltip
          side="top"
          content={
            <>
              Display ID: <span className="font-medium">{formatDisplayConfigId(head.global_version)}</span>
              <br />
              Internal Config ID: <span className="font-medium">v{head.global_version}</span>
            </>
          }
        >
          <span className="ml-2 text-blue-800/80 underline decoration-dotted underline-offset-2 cursor-help">
            {formatDisplayConfigId(head.global_version)}
          </span>
        </Tooltip>
      ) : null}
    </span>
  )
}
