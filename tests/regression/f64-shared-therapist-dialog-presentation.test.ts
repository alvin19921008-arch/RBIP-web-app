import assert from 'node:assert/strict'

import {
  applySharedTherapistTeamAssignment,
  getSharedTherapistDialogPresentation,
  getSharedTherapistQuickSelectPresentation,
  toggleSharedTherapistSelectedSlot,
} from '../../lib/features/schedule/sharedTherapistDialogPresentation'

async function main() {
  assert.deepEqual(
    getSharedTherapistDialogPresentation(1),
    {
      dialogWidthClass: 'w-[calc(100vw-24px)] sm:w-full sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl',
      desktopStepperClass: 'absolute right-3 top-3 hidden lg:flex sm:right-4 sm:top-4 items-center gap-2',
      headerClass: 'space-y-3 pr-4 lg:pr-32',
      cardsGridClass: 'grid grid-cols-1 gap-4',
    },
    'Expected a single shared therapist dialog to stay moderately narrow and avoid early desktop stepper overlap'
  )

  assert.deepEqual(
    getSharedTherapistDialogPresentation(2),
    {
      dialogWidthClass: 'w-[calc(100vw-24px)] sm:w-full max-w-[min(calc(100vw-24px),var(--rbip-app-max-width))]',
      desktopStepperClass: 'absolute right-3 top-3 hidden sm:flex sm:right-4 sm:top-4 items-center gap-2',
      headerClass: 'space-y-3 pr-4 sm:pr-32',
      cardsGridClass: 'grid grid-cols-1 gap-4 xl:grid-cols-2',
    },
    'Expected multi-therapist dialog to retain the wide two-column presentation'
  )

  assert.deepEqual(
    toggleSharedTherapistSelectedSlot([1, 3], 2),
    [1, 2, 3],
    'Expected clicking a new slot to preserve multi-select'
  )

  assert.deepEqual(
    toggleSharedTherapistSelectedSlot([1, 2, 3], 2),
    [1, 3],
    'Expected clicking an already selected slot to deselect only that slot'
  )

  assert.deepEqual(
    applySharedTherapistTeamAssignment(
      { 1: 'SMM', 2: 'SMM', 3: 'MC' },
      [1, 3],
      'FO'
    ),
    {
      slotTeamBySlot: { 1: 'FO', 2: 'SMM', 3: 'FO' },
      selectedSlots: [],
    },
    'Expected assigning a team to overwrite selected slots and clear selection immediately after the action'
  )

  assert.deepEqual(
    getSharedTherapistQuickSelectPresentation(),
    {
      helperRowClass: 'flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground',
      separatorClass: 'text-muted-foreground/50',
      quickSelectGroupClass: 'flex flex-wrap items-center gap-1.5',
      quickSelectLabelClass: 'text-[11px] font-medium text-muted-foreground',
      chipButtonClass:
        'h-6 rounded-full border border-border bg-slate-100 px-2.5 text-[10px] font-medium text-slate-700 transition-colors hover:bg-slate-200 hover:border-slate-300 hover:text-slate-900 active:bg-slate-300/80 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:border-slate-500 dark:hover:text-slate-100 dark:active:bg-slate-600/80',
    },
    'Expected quick select shortcuts to render as pill-shaped interactive chips within the slot helper row'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
