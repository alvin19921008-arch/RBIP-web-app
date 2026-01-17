import { useLayoutEffect, useState, type RefObject } from 'react'
import { clampFixedPositionToViewport } from '@/lib/utils/overlayPosition'

type AnchorLike = HTMLElement

export function useAnchoredPopoverPosition(args: {
  open: boolean
  anchorRef: RefObject<AnchorLike | null>
  popoverRef: RefObject<HTMLElement | null>
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'right'
  offset?: number
  pad?: number
}) {
  const { open, anchorRef, popoverRef } = args
  const placement = args.placement ?? 'bottom-start'
  const offset = args.offset ?? 8
  const pad = args.pad ?? 8

  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }

    const anchor = anchorRef.current
    const pop = popoverRef.current
    if (!anchor || !pop) return

    // Render first, then measure + clamp.
    requestAnimationFrame(() => {
      const a = anchorRef.current
      const p = popoverRef.current
      if (!a || !p) return

      const aRect = a.getBoundingClientRect()
      const pRect = p.getBoundingClientRect()

      let left = aRect.left
      let top = aRect.bottom + offset

      if (placement === 'bottom-end') {
        left = aRect.right - pRect.width
        top = aRect.bottom + offset
      } else if (placement === 'top-start') {
        left = aRect.left
        top = aRect.top - offset - pRect.height
      } else if (placement === 'right') {
        left = aRect.right + offset
        top = aRect.top + aRect.height / 2 - pRect.height / 2
      }

      const clamped = clampFixedPositionToViewport({
        left,
        top,
        width: pRect.width,
        height: pRect.height,
        pad,
      })

      setPos(clamped)
    })
  }, [open, anchorRef, popoverRef, placement, offset, pad])

  return pos
}

