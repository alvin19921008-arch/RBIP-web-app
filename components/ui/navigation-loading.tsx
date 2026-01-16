'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'

type NavigationLoadingApi = {
  start: (targetHref?: string) => void
  stop: () => void
  active: boolean
  targetHref: string | null
}

const NavigationLoadingContext = React.createContext<NavigationLoadingApi | null>(null)

export function useNavigationLoading(): NavigationLoadingApi {
  const ctx = React.useContext(NavigationLoadingContext)
  if (!ctx) throw new Error('useNavigationLoading must be used within <NavigationLoadingProvider>')
  return ctx
}

type ProviderProps = {
  children: React.ReactNode
}

export function NavigationLoadingProvider({ children }: ProviderProps) {
  const pathname = usePathname()
  const [active, setActive] = React.useState(false)
  const [targetHref, setTargetHref] = React.useState<string | null>(null)
  const timeoutRef = React.useRef<number | null>(null)
  const lastPathRef = React.useRef<string>(pathname)
  const targetHrefRef = React.useRef<string | null>(null)

  const stop = React.useCallback(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    setActive(false)
    setTargetHref(null)
    targetHrefRef.current = null
    try {
      window.sessionStorage.removeItem('rbip_nav_start_ms')
      window.sessionStorage.removeItem('rbip_nav_target_href')
    } catch {
      // ignore
    }
  }, [])

  const start = React.useCallback((nextTargetHref?: string) => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    setActive(true)
    const href = nextTargetHref ?? null
    setTargetHref(href)
    targetHrefRef.current = href
    try {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (href) window.sessionStorage.setItem('rbip_nav_target_href', href)
      window.sessionStorage.setItem('rbip_nav_start_ms', String(now))
      // Clear prior per-route marks so we don't show stale timing.
      window.sessionStorage.removeItem('rbip_nav_schedule_loading_shown_ms')
      window.sessionStorage.removeItem('rbip_nav_schedule_mounted_ms')
      window.sessionStorage.removeItem('rbip_nav_schedule_grid_ready_ms')
    } catch {
      // ignore
    }
    // Fail-safe: never leave the overlay stuck.
    timeoutRef.current = window.setTimeout(() => {
      setActive(false)
      timeoutRef.current = null
    }, 10000)
  }, [])

  // When route changes, end the overlay shortly after.
  React.useEffect(() => {
    const prev = lastPathRef.current
    if (prev !== pathname) {
      lastPathRef.current = pathname
      if (active) {
        const isScheduleTarget = (targetHrefRef.current ?? '').startsWith('/schedule')
        // For Schedule, let the destination page stop the overlay when data is ready.
        if (!isScheduleTarget) window.setTimeout(() => stop(), 120)
      }
    }
  }, [active, pathname, stop])

  // Start on internal link clicks (covers most navigations).
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.defaultPrevented) return
      if (e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      const target = e.target as HTMLElement | null
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href) return
      if (href.startsWith('#')) return
      if (href.startsWith('http')) return
      if (anchor.getAttribute('target') === '_blank') return

      // Only for internal app routes.
      if (!href.startsWith('/')) return

      // Skip if navigating to same path.
      if (href === pathname) return

      start(href)
    }

    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [pathname, start])

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  const api = React.useMemo<NavigationLoadingApi>(() => ({ start, stop, active, targetHref }), [active, start, stop, targetHref])

  return (
    <NavigationLoadingContext.Provider value={api}>
      {children}
      {active ? (
        <>
          {/* Thicker top loading bar for navigation */}
          <div className="fixed top-0 left-0 right-0 h-[6px] z-[100000] bg-transparent">
            <div className="h-full w-full overflow-hidden">
              <div className="h-full w-1/2 bg-sky-500 animate-[navbar-indeterminate_1.1s_ease-in-out_infinite]" />
            </div>
          </div>
        </>
      ) : null}
    </NavigationLoadingContext.Provider>
  )
}

