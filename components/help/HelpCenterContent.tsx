'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { FaqAccordion } from '@/components/help/FaqAccordion'
import { useToast } from '@/components/ui/toast-context'
import { startHelpTourWithRetry } from '@/lib/help/startTour'
import { HELP_TOUR_PENDING_KEY, type HelpTourId } from '@/lib/help/tours'
import { useAccessControl } from '@/lib/access/useAccessControl'

export function HelpCenterContent(props: {
  onAfterStartTour?: () => void
  /** When true (dialog shell), show a callout linking to the dedicated `/help` route. */
  showFullPageLink?: boolean
  /** Close the hosting dialog before navigating to `/help`. */
  onRequestNavigateToFullPage?: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const access = useAccessControl()
  const [startingTour, setStartingTour] = useState<HelpTourId | null>(null)

  const isOnSchedule = pathname?.startsWith('/schedule')
  const isOnDashboard = pathname?.startsWith('/dashboard')
  const isAdmin = access.role === 'admin' || access.role === 'developer'
  const helpContext: 'schedule' | 'dashboard' | 'all' = isOnSchedule ? 'schedule' : isOnDashboard ? 'dashboard' : 'all'

  const tourCards = useMemo(
    () => [
      {
        id: 'schedule-core' as const,
        title: 'Schedule Core Tour',
        description: 'Core workflow for daily schedule operation (Step 1 to Step 5 + common actions).',
        visible: helpContext !== 'dashboard',
      },
      {
        id: 'dashboard-admin' as const,
        title: 'Dashboard Admin Tour',
        description: 'Admin configuration tour focusing on Special Programs, PCA Preferences, and Sync / Publish.',
        visible: isAdmin && helpContext !== 'schedule',
      },
    ],
    [helpContext, isAdmin]
  )

  const handleStartTour = async (tourId: HelpTourId) => {
    setStartingTour(tourId)
    props.onAfterStartTour?.()
    try {
      const isCurrentPageMatch =
        (tourId === 'schedule-core' && isOnSchedule) || (tourId === 'dashboard-admin' && isOnDashboard)
      if (isCurrentPageMatch) {
        const started = await startHelpTourWithRetry(tourId)
        if (!started) {
          toast.warning('Tour target not found.', 'Open the relevant page state and try again.')
        }
        return
      }

      window.localStorage.setItem(HELP_TOUR_PENDING_KEY, tourId)
      router.push(tourId === 'dashboard-admin' ? '/dashboard' : '/schedule')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Failed to start tour.', msg)
    } finally {
      setStartingTour(null)
    }
  }

  return (
    <div className="space-y-6">
      {props.showFullPageLink ? (
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Dedicated Help Center page</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Same tours and FAQ on a full page — useful for a separate tab, sharing the URL, or printing.
              </p>
            </div>
            <Button asChild className="shrink-0 w-full sm:w-auto" variant="default" size="sm">
              <Link
                href="/help"
                onClick={() => {
                  props.onRequestNavigateToFullPage?.()
                }}
              >
                Open /help
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Onboarding Tours</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tourCards
            .filter((x) => x.visible)
            .map((tour) => (
              <div key={tour.id} className="rounded-md border border-border p-3 space-y-2">
                <div className="text-sm font-medium">{tour.title}</div>
                <p className="text-xs text-muted-foreground">{tour.description}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleStartTour(tour.id)}
                  disabled={startingTour === tour.id}
                >
                  {startingTour === tour.id ? 'Starting…' : 'Start tour'}
                </Button>
              </div>
            ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Guides</h2>
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="text-sm font-medium">Avg PCA/team and slots</div>
          <p className="text-xs text-muted-foreground">
            Plain-language notes on continuous FTE vs slots, when there are not enough slots or extra slack, and Extra
            after needs (Step 3).
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/help/avg-and-slots">Open guide</Link>
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">How To Use (FAQ)</h2>
        <FaqAccordion role={access.role} context={helpContext} />
      </section>
    </div>
  )
}

