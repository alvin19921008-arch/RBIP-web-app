'use client'

import { driver } from 'driver.js'
import { HELP_TOURS, type HelpTourId } from '@/lib/help/tours'

type StartTourOptions = {
  onDestroyed?: () => void
}

function visibleSelectors(steps: { selector: string }[]) {
  return steps.filter((step) => !!document.querySelector(step.selector))
}

export async function startHelpTour(tourId: HelpTourId, options?: StartTourOptions): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const tour = HELP_TOURS[tourId]
  if (!tour) return false

  const resolved = visibleSelectors(tour.steps)
  if (resolved.length === 0) return false

  // Driver.js note:
  // If `onDestroyStarted` is provided, Driver.js will wait for us to call `destroy()`.
  // If we don't, the tour can't be closed (X/Done won't work).
  let d: ReturnType<typeof driver> | null = null
  d = driver({
    showProgress: true,
    progressText: '{{current}}/{{total}}',
    allowClose: true,
    showButtons: ['previous', 'next', 'close'],
    prevBtnText: 'Previous',
    nextBtnText: 'Next',
    doneBtnText: 'Done',
    onDestroyStarted: () => {
      try {
        d?.destroy()
      } finally {
        options?.onDestroyed?.()
      }
    },
    steps: tour.steps
      .filter((s) => !!document.querySelector(s.selector))
      .map((s) => ({
        element: s.selector,
        popover: {
          title: s.title,
          description: s.description,
          side: s.side ?? 'bottom',
          align: s.align ?? 'center',
        },
      })),
  })

  d.drive()
  return true
}

export async function startHelpTourWithRetry(tourId: HelpTourId, options?: StartTourOptions): Promise<boolean> {
  if (typeof window === 'undefined') return false
  for (let i = 0; i < 12; i += 1) {
    const started = await startHelpTour(tourId, options)
    if (started) return true
    await new Promise((resolve) => window.setTimeout(resolve, 180))
  }
  return false
}

