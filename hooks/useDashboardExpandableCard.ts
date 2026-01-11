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
    // Double RAF ensures DOM has laid out and reflowed after state updates.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const el = expandedRef.current
        el?.scrollIntoView({ behavior: scrollBehavior, block: scrollBlock })
      })
    })
  }, [scrollBehavior, scrollBlock])

  const open = useCallback(
    (key: T) => {
      clearTimer()
      setClosingKey(null)
      setExpandedKey(key)
      scrollToExpanded()
    },
    [clearTimer, scrollToExpanded]
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

