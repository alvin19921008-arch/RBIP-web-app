import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Mirrors the schedule page's ResizeObserver pattern:
 * - attempts to attach a ResizeObserver to a ref element with rAF retries
 * - ignores transient 0-height reads during layout transitions
 */
export function useResizeObservedHeight(args: {
  targetRef: RefObject<HTMLElement | null>
  maxAttempts?: number
}): number | null {
  const { targetRef, maxAttempts = 10 } = args
  const [height, setHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    let cancelled = false
    let ro: ResizeObserver | null = null

    let attempts = 0

    const attach = () => {
      if (cancelled) return
      const el = targetRef.current
      if (!el) {
        attempts += 1
        if (attempts < maxAttempts) requestAnimationFrame(attach)
        return
      }

      const update = () => {
        if (cancelled) return
        const h = el.offsetHeight
        if (h > 0) setHeight(h)
      }

      update()
      ro = new ResizeObserver(() => update())
      ro.observe(el)
    }

    attach()

    return () => {
      cancelled = true
      ro?.disconnect()
    }
  }, [targetRef, maxAttempts])

  return height
}

