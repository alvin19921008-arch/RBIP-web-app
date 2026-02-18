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
    <div className="mb-4 rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Published configuration (Global)</div>
          <div className="text-xs text-muted-foreground">
            Global config{' '}
            <span className="font-medium text-foreground">{formatFriendlyDateTime(head?.global_updated_at)}</span>
            {canShowInternalVersion && typeof head?.global_version === 'number' ? (
              <Tooltip
                side="top"
                content={
                  <>
                    Internal Config ID: <span className="font-medium">v{head.global_version}</span>
                  </>
                }
              >
                <span className="ml-2 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 cursor-help">
                  v{head.global_version}
                </span>
              </Tooltip>
            ) : null}
          </div>
        </div>
        <Tooltip content="Schedules can use saved snapshots per date. Use Dashboard → Sync / Publish to compare/sync.">
          <div className="mt-0.5 text-muted-foreground">
            <Info className="h-4 w-4" />
          </div>
        </Tooltip>
      </div>
    </div>
  )
}

