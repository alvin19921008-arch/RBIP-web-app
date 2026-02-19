'use client'

import { AlertCircle } from 'lucide-react'
import { GifViewer } from '@/components/help/GifViewer'
import { helpMedia } from '@/lib/help/helpMedia'

export function SnapshotReminderAnswer() {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p>
          Each <span className="font-medium text-foreground">schedule date</span> stores a{' '}
          <span className="font-medium text-foreground">snapshot</span> of the dashboard config at the time it was last saved.
        </p>
        <p>
          When the system detects differences between this snapshot and the current{' '}
          <span className="font-medium text-foreground">Global / live dashboard config</span>, it shows the yellow alert icon:
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-50 text-amber-700">
              <AlertCircle className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium text-foreground">Snapshot differs from Global config</span>
          </div>

          <div className="text-xs text-muted-foreground ml-9">
            <div className="font-medium text-foreground mb-1.5">Categories checked for differences:</div>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>Staff profile (name, rank, FTE, status)</li>
              <li>Team configuration</li>
              <li>Ward config & bed statistics</li>
              <li>Special programs</li>
              <li>SPT allocations</li>
              <li>PCA preferences</li>
            </ul>
          </div>
        </div>

        <div className="w-full max-w-[320px]">
          <GifViewer
            src={helpMedia.snapshotDiffGif}
            alt="Saved snapshot difference illustration"
            frame={false}
            className="!max-w-full"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Admins</span> can click the alert icon to review the differences and choose to{' '}
        <span className="font-medium text-foreground">sync</span> (Pull Global → snapshot) or{' '}
        <span className="font-medium text-foreground">publish</span> (Publish snapshot → Global) in Dashboard.
      </p>
    </div>
  )
}
