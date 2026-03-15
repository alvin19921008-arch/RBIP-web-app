export function getSharedTherapistModeControlPresentation() {
  return {
    wrapperClass: 'flex min-w-0 flex-col items-start gap-1.5 text-xs',
    topRowClass: 'flex flex-wrap items-center gap-2',
    labelClass: 'text-muted-foreground',
    valueClass: 'font-medium text-foreground',
    metaRowClass: 'flex flex-wrap items-center gap-x-2 gap-y-1',
    metaTextClass: 'text-[10px] text-muted-foreground/80',
    resetButtonClass: 'h-7 gap-1 px-2 text-xs text-muted-foreground',
  }
}
