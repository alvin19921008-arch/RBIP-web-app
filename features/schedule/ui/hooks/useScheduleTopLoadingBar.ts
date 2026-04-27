import { useCallback, useEffect, useRef, useState } from 'react'

export type ScheduleTopLoadingBarResult = {
  topLoadingVisible: boolean
  topLoadingProgress: number
  startTopLoading: (initialProgress?: number) => void
  bumpTopLoadingTo: (target: number) => void
  startSoftAdvance: (cap?: number) => void
  stopSoftAdvance: () => void
  finishTopLoading: () => void
}

export function useScheduleTopLoadingBar(): ScheduleTopLoadingBarResult {
  const [topLoadingVisible, setTopLoadingVisible] = useState(false)
  const [topLoadingProgress, setTopLoadingProgress] = useState(0)
  const loadingBarIntervalRef = useRef<number | null>(null)
  const loadingBarHideTimeoutRef = useRef<number | null>(null)

  const startTopLoading = useCallback((initialProgress: number = 0.05) => {
    if (loadingBarHideTimeoutRef.current) {
      window.clearTimeout(loadingBarHideTimeoutRef.current)
      loadingBarHideTimeoutRef.current = null
    }
    if (loadingBarIntervalRef.current) {
      window.clearInterval(loadingBarIntervalRef.current)
      loadingBarIntervalRef.current = null
    }
    setTopLoadingVisible(true)
    setTopLoadingProgress(Math.max(0, Math.min(1, initialProgress)))
  }, [])

  const bumpTopLoadingTo = useCallback((target: number) => {
    setTopLoadingProgress((prev) => Math.max(prev, Math.max(0, Math.min(1, target))))
  }, [])

  const startSoftAdvance = useCallback((cap: number = 0.9) => {
    if (loadingBarIntervalRef.current) return
    loadingBarIntervalRef.current = window.setInterval(() => {
      setTopLoadingProgress((prev) => {
        const max = Math.max(prev, Math.min(0.98, cap))
        if (prev >= max) return prev
        const step = Math.min(0.015 + Math.random() * 0.02, max - prev)
        return prev + step
      })
    }, 180)
  }, [])

  const stopSoftAdvance = useCallback(() => {
    if (loadingBarIntervalRef.current) {
      window.clearInterval(loadingBarIntervalRef.current)
      loadingBarIntervalRef.current = null
    }
  }, [])

  const finishTopLoading = useCallback(() => {
    stopSoftAdvance()
    bumpTopLoadingTo(1)
    loadingBarHideTimeoutRef.current = window.setTimeout(() => {
      setTopLoadingVisible(false)
      setTopLoadingProgress(0)
      loadingBarHideTimeoutRef.current = null
    }, 350)
  }, [bumpTopLoadingTo, stopSoftAdvance])

  useEffect(() => {
    return () => {
      if (loadingBarIntervalRef.current) window.clearInterval(loadingBarIntervalRef.current)
      if (loadingBarHideTimeoutRef.current) window.clearTimeout(loadingBarHideTimeoutRef.current)
    }
  }, [])

  return {
    topLoadingVisible,
    topLoadingProgress,
    startTopLoading,
    bumpTopLoadingTo,
    startSoftAdvance,
    stopSoftAdvance,
    finishTopLoading,
  }
}
