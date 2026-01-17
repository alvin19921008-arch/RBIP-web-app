import { useCallback, useEffect, useRef, useState } from 'react'

export function useAutoHideFlag(opts?: { hideAfterMs?: number; initialVisible?: boolean }) {
  const hideAfterMs = opts?.hideAfterMs ?? 3000
  const [visible, setVisible] = useState(!!opts?.initialVisible)
  const timerRef = useRef<number | null>(null)

  const clear = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const poke = useCallback(() => {
    setVisible(true)
    clear()
    timerRef.current = window.setTimeout(() => setVisible(false), hideAfterMs)
  }, [clear, hideAfterMs])

  const hideNow = useCallback(() => {
    clear()
    setVisible(false)
  }, [clear])

  useEffect(() => {
    return () => clear()
  }, [clear])

  return { visible, setVisible, poke, hideNow }
}

