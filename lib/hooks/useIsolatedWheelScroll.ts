import { useEffect, type RefObject } from 'react'

type WheelTargetRef = RefObject<HTMLElement | null>

type IsolatedWheelScrollOptions = {
  enabled?: boolean
  mode: 'vertical' | 'horizontal'
  /**
   * For horizontal mode, use max(|deltaY|, |deltaX|) and apply to scrollLeft.
   * Matches the existing behavior in PCADedicatedScheduleTable.
   */
  horizontalUsesDominantDelta?: boolean
  /**
   * If true, only preventDefault/stopPropagation when the element actually overflows in the target axis.
   */
  onlyWhenOverflowing?: boolean
  /**
   * Optional callback after applying scroll (e.g. to update hint state).
   */
  onApplied?: () => void
}

export function useIsolatedWheelScroll(ref: WheelTargetRef, opts: IsolatedWheelScrollOptions) {
  useEffect(() => {
    const enabled = opts.enabled ?? true
    if (!enabled) return

    const el = ref.current
    if (!el) return

    const onWheelNative = (ev: WheelEvent) => {
      const overflowing =
        opts.mode === 'vertical'
          ? el.scrollHeight > el.clientHeight + 1
          : el.scrollWidth > el.clientWidth + 1

      if ((opts.onlyWhenOverflowing ?? true) && !overflowing) return

      ev.preventDefault()
      ev.stopPropagation()

      if (opts.mode === 'vertical') {
        el.scrollTop += ev.deltaY
      } else {
        const delta = opts.horizontalUsesDominantDelta
          ? Math.abs(ev.deltaY) > Math.abs(ev.deltaX)
            ? ev.deltaY
            : ev.deltaX
          : ev.deltaX
        el.scrollLeft += delta
      }

      opts.onApplied?.()
    }

    el.addEventListener('wheel', onWheelNative, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheelNative as EventListener)
    }
  }, [ref, opts.enabled, opts.mode, opts.horizontalUsesDominantDelta, opts.onlyWhenOverflowing, opts.onApplied])
}

