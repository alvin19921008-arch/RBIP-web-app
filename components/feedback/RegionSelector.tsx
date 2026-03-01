'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X } from 'lucide-react'
import type { CropRect } from '@/lib/feedback/screenshot'

interface RegionSelectorProps {
  active: boolean
  onConfirm: (rect: CropRect) => void
  onCancel: () => void
}

interface DragState {
  startX: number
  startY: number
  currentX: number
  currentY: number
  dragging: boolean
}

const INITIAL_DRAG: DragState = {
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  dragging: false,
}

export function RegionSelector({ active, onConfirm, onCancel }: RegionSelectorProps) {
  const [drag, setDrag] = useState<DragState>(INITIAL_DRAG)
  const [confirmed, setConfirmed] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Reset when activated
  useEffect(() => {
    if (active) {
      setDrag(INITIAL_DRAG)
      setConfirmed(false)
    }
  }, [active])

  const getRect = useCallback((): CropRect => {
    const x = Math.min(drag.startX, drag.currentX)
    const y = Math.min(drag.startY, drag.currentY)
    const width = Math.abs(drag.currentX - drag.startX)
    const height = Math.abs(drag.currentY - drag.startY)
    return { x, y, width, height }
  }, [drag])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (confirmed) return
    e.preventDefault()
    setDrag({
      startX: e.clientX + window.scrollX,
      startY: e.clientY + window.scrollY,
      currentX: e.clientX + window.scrollX,
      currentY: e.clientY + window.scrollY,
      dragging: true,
    })
  }, [confirmed])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setDrag(d => {
      if (!d.dragging) return d
      return { ...d, currentX: e.clientX + window.scrollX, currentY: e.clientY + window.scrollY }
    })
  }, [])

  const handleMouseUp = useCallback(() => {
    setDrag(d => ({ ...d, dragging: false }))
  }, [])

  useEffect(() => {
    if (!active) return
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [active, handleMouseMove, handleMouseUp])

  const rect = getRect()
  const hasSelection = rect.width > 10 && rect.height > 10

  const handleConfirm = () => {
    setConfirmed(true)
    onConfirm(rect)
  }

  if (!active) return null

  return (
    <>
      {/* Full-page dim overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[9998] bg-black/20"
        style={{ cursor: drag.dragging ? 'crosshair' : 'crosshair' }}
        onMouseDown={handleMouseDown}
        data-feedback-exclude="true"
      />

      {/* Selection rectangle */}
      {hasSelection && (
        <div
          className="fixed z-[9999] border-2 border-sky-500 bg-sky-500/10 pointer-events-none"
          style={{
            left: Math.min(drag.startX, drag.currentX) - window.scrollX,
            top: Math.min(drag.startY, drag.currentY) - window.scrollY,
            width: rect.width,
            height: rect.height,
          }}
          data-feedback-exclude="true"
        />
      )}

      {/* "Done selecting" chip — fixed bottom-center */}
      <AnimatePresence>
        <motion.div
          className="fixed bottom-6 left-1/2 z-[10000] -translate-x-1/2"
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          data-feedback-exclude="true"
        >
          <div className="flex items-center gap-3 rounded-full bg-slate-900 px-5 py-2.5 shadow-xl text-white text-sm">
            {hasSelection ? (
              <>
                <span className="text-slate-300">Area selected</span>
                <button
                  onClick={handleConfirm}
                  className="inline-flex items-center gap-1 text-emerald-400 font-medium hover:text-emerald-300 transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                  Confirm
                </button>
                <span className="text-slate-600">·</span>
                <button
                  onClick={onCancel}
                  className="text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="text-slate-300">Draw a region to capture</span>
                <button
                  onClick={onCancel}
                  className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  )
}
