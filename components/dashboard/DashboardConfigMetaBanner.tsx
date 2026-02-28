'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Tooltip } from '@/components/ui/tooltip'
import { Info } from 'lucide-react'
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

export function DashboardConfigMetaBanner() {
  const supabase = createClientComponentClient()
  const access = useAccessControl()
  const [head, setHead] = useState<any>(null)
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
    <div className="mb-4 w-full bg-blue-50/40 border border-blue-100/60 rounded-xl p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-blue-900">Published configuration (Global)</div>
            <div className="text-xs text-blue-800/70">
              Global config{' '}
              <span className="font-medium text-blue-900">{formatFriendlyDateTime(head?.global_updated_at)}</span>
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
                  <span className="ml-2 text-xs text-blue-800/60 underline decoration-dotted underline-offset-2 cursor-help">
                    {formatDisplayConfigId(head.global_version)}
                  </span>
                </Tooltip>
              ) : null}
            </div>
          </div>
        </div>
        <Tooltip content="Schedules can use saved snapshots per date. Use Dashboard → Sync / Publish to compare/sync.">
          <div className="mt-0.5 text-blue-400 flex-shrink-0">
            <Info className="h-4 w-4" />
          </div>
        </Tooltip>
      </div>
    </div>
  )
}

