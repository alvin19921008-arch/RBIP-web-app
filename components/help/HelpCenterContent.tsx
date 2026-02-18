'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { FaqAccordion } from '@/components/help/FaqAccordion'
import { useToast } from '@/components/ui/toast-provider'
import { startHelpTourWithRetry } from '@/lib/help/startTour'
import { HELP_TOUR_PENDING_KEY, type HelpTourId } from '@/lib/help/tours'
import { useAccessControl } from '@/lib/access/useAccessControl'

export function HelpCenterContent(props: { onAfterStartTour?: () => void }) {
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
        <h2 className="text-base font-semibold">How To Use (FAQ)</h2>
        <FaqAccordion role={access.role} context={helpContext} />
      </section>
    </div>
  )
}

