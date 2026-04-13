import assert from 'node:assert/strict'

import { getSptFinalEditDialogPresentation } from '../../lib/features/schedule/sptFinalEditDialogPresentation'

async function main() {
  assert.deepEqual(
    getSptFinalEditDialogPresentation(1),
    {
      dialogWidthClass: 'w-[calc(100vw-24px)] sm:w-full sm:max-w-xl lg:max-w-2xl',
      desktopStepperClass: 'absolute right-3 top-3 hidden lg:flex sm:right-4 sm:top-4 items-center gap-2',
      headerClass: 'space-y-3 pr-4 lg:pr-20',
    },
    'Expected a single SPT card dialog to shrink significantly while avoiding header/stepper overlap'
  )

  assert.deepEqual(
    getSptFinalEditDialogPresentation(2),
    {
      dialogWidthClass: 'w-[calc(100vw-24px)] sm:w-full max-w-[min(calc(100vw-24px),var(--rbip-app-max-width))]',
      desktopStepperClass: 'absolute right-3 top-3 hidden sm:flex sm:right-4 sm:top-4 items-center gap-2',
      headerClass: 'space-y-3 pr-4 sm:pr-20',
    },
    'Expected multiple SPT cards to keep the existing wide dialog layout'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
