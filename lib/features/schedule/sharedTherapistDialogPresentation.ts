export function getSharedTherapistDialogPresentation(cardCount: number): {
  dialogWidthClass: string
  desktopStepperClass: string
  headerClass: string
  cardsGridClass: string
} {
  if (cardCount <= 1) {
    return {
      dialogWidthClass: 'w-[calc(100vw-24px)] sm:w-full sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl',
      desktopStepperClass: 'absolute right-3 top-3 hidden lg:flex sm:right-4 sm:top-4 items-center gap-2',
      headerClass: 'space-y-3 pr-4 lg:pr-32',
      cardsGridClass: 'grid grid-cols-1 gap-4',
    }
  }

  return {
    dialogWidthClass: 'w-[calc(100vw-24px)] sm:w-full max-w-[min(calc(100vw-24px),var(--rbip-app-max-width))]',
    desktopStepperClass: 'absolute right-3 top-3 hidden sm:flex sm:right-4 sm:top-4 items-center gap-2',
    headerClass: 'space-y-3 pr-4 sm:pr-32',
    cardsGridClass: 'grid grid-cols-1 gap-4 xl:grid-cols-2',
  }
}

export function toggleSharedTherapistSelectedSlot(
  selectedSlots: Array<1 | 2 | 3 | 4>,
  slot: 1 | 2 | 3 | 4
): Array<1 | 2 | 3 | 4> {
  if (selectedSlots.includes(slot)) {
    return selectedSlots.filter((value): value is 1 | 2 | 3 | 4 => value !== slot)
  }

  return [...selectedSlots, slot].sort((a, b) => a - b) as Array<1 | 2 | 3 | 4>
}

export function applySharedTherapistTeamAssignment(
  slotTeamBySlot: Partial<Record<1 | 2 | 3 | 4, string>>,
  selectedSlots: Array<1 | 2 | 3 | 4>,
  team: string
): {
  slotTeamBySlot: Partial<Record<1 | 2 | 3 | 4, string>>
  selectedSlots: Array<1 | 2 | 3 | 4>
} {
  if (selectedSlots.length === 0) {
    return {
      slotTeamBySlot,
      selectedSlots,
    }
  }

  const nextSlotMap = { ...slotTeamBySlot }
  selectedSlots.forEach((slot) => {
    nextSlotMap[slot] = team
  })

  return {
    slotTeamBySlot: nextSlotMap,
    selectedSlots: [],
  }
}

export function getSharedTherapistQuickSelectPresentation(): {
  helperRowClass: string
  separatorClass: string
  quickSelectGroupClass: string
  quickSelectLabelClass: string
  chipButtonClass: string
} {
  return {
    helperRowClass: 'flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground',
    separatorClass: 'text-muted-foreground/50',
    quickSelectGroupClass: 'flex flex-wrap items-center gap-1.5',
    quickSelectLabelClass: 'text-[11px] font-medium text-muted-foreground',
    chipButtonClass:
      'h-6 rounded-full border border-border bg-slate-100 px-2.5 text-[10px] font-medium text-slate-700 transition-colors hover:bg-slate-200 hover:border-slate-300 hover:text-slate-900 active:bg-slate-300/80 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:border-slate-500 dark:hover:text-slate-100 dark:active:bg-slate-600/80',
  }
}
