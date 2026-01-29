import { useCallback, useEffect, useRef, useState } from 'react'

type UseDashboardExpandableCardOptions = {
  /** Duration should match the animate-in/out utility duration. */
  animationMs?: number
  /** Scroll behavior when expanding. */
  scrollBehavior?: ScrollBehavior
  /** scrollIntoView block alignment. */
  scrollBlock?: ScrollLogicalPosition
}

/**
 * Reusable helper for "expand card → auto-scroll into view → collapse with animation".
 * Intended for Dashboard panels where only one card is expanded at a time.
 */
export function useDashboardExpandableCard<T extends string | number>(
  opts: UseDashboardExpandableCardOptions = {}
) {
  const {
    animationMs = 220,
    scrollBehavior = 'smooth',
    scrollBlock = 'start',
  } = opts

  const expandedRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<number | null>(null)

  const [expandedKey, setExpandedKey] = useState<T | null>(null)
  const [closingKey, setClosingKey] = useState<T | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  const scrollToExpanded = useCallback(() => {
    // Scroll AFTER React commits the expanded card into the DOM.
    // (When called too early, the ref can still be null, causing only the browser's
    // minimal "keep clicked button visible" auto-scroll — which looks like a half-scroll.)
    const attempt = (remaining: number) => {
      window.requestAnimationFrame(() => {
        const el = expandedRef.current
        if (!el) {
          if (remaining > 0) attempt(remaining - 1)
          return
        }

        // Prefer scrolling the nearest scroll container so alignment is deterministic.
        // This is more reliable than plain scrollIntoView when the page has nested
        // overflow containers (dashboard layout uses an overflow-auto main panel).
        const scrollParent = findScrollableAncestor(el)
        if (!scrollParent) {
          el.scrollIntoView({ behavior: scrollBehavior, block: scrollBlock })
          return
        }

        const parentRect = scrollParent.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const deltaTop = elRect.top - parentRect.top

        // Align the expanded card to the top of the scroll container.
        // We keep a tiny offset so it doesn't feel "jammed" to the edge.
        const topOffsetPx = 8
        const targetTop = scrollParent.scrollTop + deltaTop - topOffsetPx

        scrollParent.scrollTo({ top: targetTop, behavior: scrollBehavior })
      })
    }

    // A few RAF retries handle cases where the expanded card is conditionally rendered.
    attempt(6)
  }, [scrollBehavior, scrollBlock])

  useEffect(() => {
    if (expandedKey === null) return
    scrollToExpanded()
    // Also re-align once more after the expand animation window, to counter any late
    // layout shifts from async-loaded content inside the expanded card.
    const t = window.setTimeout(() => scrollToExpanded(), animationMs + 30)
    return () => window.clearTimeout(t)
  }, [animationMs, expandedKey, scrollToExpanded])

  const open = useCallback(
    (key: T) => {
      clearTimer()
      setClosingKey(null)
      setExpandedKey(key)
    },
    [clearTimer]
  )

  const close = useCallback(
    (after?: () => void) => {
      if (expandedKey === null) {
        after?.()
        return
      }
      const key = expandedKey
      setClosingKey(key)
      clearTimer()
      timerRef.current = window.setTimeout(() => {
        setExpandedKey(null)
        setClosingKey(null)
        timerRef.current = null
        after?.()
      }, animationMs)
    },
    [animationMs, clearTimer, expandedKey]
  )

  const isExpanded = useCallback((key: T) => expandedKey === key, [expandedKey])
  const isClosing = useCallback((key: T) => closingKey === key, [closingKey])

  const getExpandedAnimationClass = useCallback(
    (key: T) => {
      if (expandedKey !== key) return ''
      // tailwindcss-animate utilities
      return closingKey === key
        ? 'animate-out fade-out zoom-out-95 duration-200'
        : 'animate-in fade-in zoom-in-95 duration-200'
    },
    [closingKey, expandedKey]
  )

  return {
    expandedRef,
    expandedKey,
    open,
    close,
    isExpanded,
    isClosing,
    getExpandedAnimationClass,
  }
}

function findScrollableAncestor(node: HTMLElement | null): HTMLElement | null {
  if (!node) return null
  let el: HTMLElement | null = node.parentElement
  while (el) {
    const style = window.getComputedStyle(el)
    const overflowY = style.overflowY
    const overflowX = style.overflowX
    const isScrollableY = (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight
    const isScrollableX = (overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth
    if (isScrollableY || isScrollableX) return el
    el = el.parentElement
  }
  return null
}