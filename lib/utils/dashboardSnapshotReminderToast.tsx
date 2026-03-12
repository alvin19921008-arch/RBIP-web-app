import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { ToastApi } from '@/components/ui/toast-context'

const SNAPSHOT_REMINDER_DESCRIPTION =
  'Only newly created schedule dates use the latest dashboard settings. Existing schedule dates keep their current snapshot until you pull global config to that date.'

const SNAPSHOT_REMINDER_DURATION_MS = 15000

export function showDashboardSnapshotReminderToast(toast: ToastApi, title: string) {
  toast.show({
    title,
    description: SNAPSHOT_REMINDER_DESCRIPTION,
    variant: 'info',
    durationMs: SNAPSHOT_REMINDER_DURATION_MS,
    showDurationProgress: true,
    pauseOnHover: true,
    actions: (
      <Link href="/dashboard?category=sync-publish">
        <Button type="button" size="sm" variant="outline">
          Go to Sync / Publish
        </Button>
      </Link>
    ),
  })
}
