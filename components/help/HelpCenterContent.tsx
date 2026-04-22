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
  /** Close the hosting dialog before navigating to help sub-routes (when shown in the dialog). */
  onRequestCloseBeforeNavigate?: () => void
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
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Onboarding Tours</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tourCards
            .filter((x) => x.visible)
            .map((tour) => (
              <div
                key={tour.id}
                className="space-y-2 rounded-md border border-border/80 bg-muted/25 p-3"
              >
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
        <div className="divide-y divide-border border-t border-b border-border">
          <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-medium">Avg PCA/team and slots</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Plain-language notes on continuous FTE vs slots, when there are not enough slots or extra slack, and
                Extra after needs (Step 3).
              </p>
            </div>
            <Button asChild className="shrink-0 self-start sm:self-center" size="sm" variant="outline">
              <Link
                href="/help/avg-and-slots"
                onClick={() => {
                  props.onRequestCloseBeforeNavigate?.()
                }}
              >
                Open guide
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">How To Use (FAQ)</h2>
        <FaqAccordion role={access.role} context={helpContext} />
      </section>
    </div>
  )
}

