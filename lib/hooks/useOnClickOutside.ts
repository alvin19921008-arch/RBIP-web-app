import { useEffect, type RefObject } from 'react'

type AnyElRef = RefObject<HTMLElement | null>

export function useOnClickOutside(
  refs: AnyElRef | AnyElRef[],
  onOutside: (event: MouseEvent | PointerEvent) => void,
  opts?: {
    enabled?: boolean
    event?: 'mousedown' | 'pointerdown'
    capture?: boolean
  }
) {
  useEffect(() => {
    const enabled = opts?.enabled ?? true
    if (!enabled) return

    const eventName = opts?.event ?? 'pointerdown'
    const capture = opts?.capture ?? true
    const refList = Array.isArray(refs) ? refs : [refs]

    const handler = (event: any) => {
      const target = event.target as Node | null
      if (!target) return

      for (const r of refList) {
        const el = r.current
        if (el && el.contains(target)) return
      }

      onOutside(event)
    }

    document.addEventListener(eventName, handler, { capture })
    return () => {
      document.removeEventListener(eventName, handler, { capture } as any)
    }
  }, [refs, onOutside, opts?.enabled, opts?.event, opts?.capture])
}

