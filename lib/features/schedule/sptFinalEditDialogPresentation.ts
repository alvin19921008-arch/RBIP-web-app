export function getSptFinalEditDialogPresentation(cardCount: number): {
  dialogWidthClass: string
  desktopStepperClass: string
  headerClass: string
} {
  if (cardCount <= 1) {
    return {
      dialogWidthClass: 'w-[calc(100vw-24px)] sm:w-full sm:max-w-xl lg:max-w-2xl',
      desktopStepperClass: 'absolute right-3 top-3 hidden lg:flex sm:right-4 sm:top-4 items-center gap-2',
      headerClass: 'space-y-3 pr-4 lg:pr-20',
    }
  }

  return {
    dialogWidthClass: 'w-[calc(100vw-24px)] sm:w-full max-w-[min(calc(100vw-24px),var(--rbip-app-max-width))]',
    desktopStepperClass: 'absolute right-3 top-3 hidden sm:flex sm:right-4 sm:top-4 items-center gap-2',
    headerClass: 'space-y-3 pr-4 sm:pr-20',
  }
}
