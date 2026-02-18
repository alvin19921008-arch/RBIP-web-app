'use client'

import { CloudDownload, CloudUpload } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DashboardSyncPublishAnswer() {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p>
          Think of each <span className="font-medium text-foreground">schedule date</span> as having its own saved{' '}
          <span className="font-medium text-foreground">data snapshot</span> (a “frozen copy” of the setup used on that day).
        </p>
        <p>
          The <span className="font-medium text-foreground">Global / live dashboard config</span> is the current master setup that you maintain in Dashboard
          (staff profile, wards, special programs, preferences, etc.).
        </p>
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
        <div className="text-xs font-medium text-foreground">Use these actions when you mean it</div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="button" aria-disabled="true" tabIndex={-1} variant="outline" className="pointer-events-none select-none">
            <CloudUpload className="mr-2 h-4 w-4" />
            Publish snapshot → Global
          </Button>
          <Button type="button" aria-disabled="true" tabIndex={-1} variant="outline" className="pointer-events-none select-none">
            <CloudDownload className="mr-2 h-4 w-4" />
            Pull Global → snapshot
          </Button>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>
            <span className="font-medium text-foreground">Publish</span> when the snapshot has the “correct” changes and you want to make them the new Global
            default for future work.
          </li>
          <li>
            <span className="font-medium text-foreground">Pull</span> when Global is the source of truth and you want to update a specific date snapshot to
            match the latest Global setup (for selected categories).
          </li>
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: if you’re unsure, start with <span className="font-medium text-foreground">Diff</span> and only publish/pull after you confirm the categories you
        intend to change.
      </p>
    </div>
  )
}

