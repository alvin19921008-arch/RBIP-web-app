'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StaffEditOverlaySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: React.ReactNode
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  /**
   * Defaults to a slightly wider-than-dialog sheet for editing room.
   * Example: `max-w-xl` (576px).
   */
  widthClassName?: string
}

/**
 * A centered, slide-in sheet intended as a "Layer 2" editor above an existing dialog.
 * Uses the same global dialog stack key as `components/ui/dialog.tsx` so Escape closes
 * only the top-most overlay.
 */
export function StaffEditOverlaySheet({
  open,
  onOpenChange,
  title,
  children,
  closeOnBackdrop = true,
  closeOnEscape = true,
  widthClassName,
}: StaffEditOverlaySheetProps) {
  const [mounted, setMounted] = React.useState(false)
  const sheetId = React.useId()

  React.useEffect(() => setMounted(true), [])

  // Participate in the global dialog stack so Escape closes the top-most overlay only.
  React.useEffect(() => {
    if (!open) return
    const STACK_KEY = '__rbip_dialog_stack__'
    const g = globalThis as any
    const stack: string[] = Array.isArray(g[STACK_KEY]) ? g[STACK_KEY] : []
    stack.push(sheetId)
    g[STACK_KEY] = stack
    return () => {
      const curr: string[] = Array.isArray(g[STACK_KEY]) ? g[STACK_KEY] : []
      const idx = curr.lastIndexOf(sheetId)
      if (idx >= 0) curr.splice(idx, 1)
      g[STACK_KEY] = curr
    }
  }, [open, sheetId])

  React.useEffect(() => {
    if (!open) return
    const STACK_KEY = '__rbip_dialog_stack__'
    const g = globalThis as any
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (!closeOnEscape) return
      const stack: string[] = Array.isArray(g[STACK_KEY]) ? g[STACK_KEY] : []
      if (stack[stack.length - 1] !== sheetId) return
      e.preventDefault()
      onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, sheetId, onOpenChange, closeOnEscape])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.2, 0.9, 0.2, 1] }}
          onMouseDown={(e) => {
            if (closeOnBackdrop && e.target === e.currentTarget) onOpenChange(false)
          }}
          onTouchStart={(e) => {
            if (closeOnBackdrop && e.target === e.currentTarget) onOpenChange(false)
          }}
        >
          {/* Hit-area overlay (transparent; avoid adding a second heavy dim) */}
          <div className="absolute inset-0" />

          <motion.div
            className={cn(
              'relative z-[61] w-[calc(100vw-24px)] max-h-[90vh] overflow-hidden rounded-lg bg-background',
              'border border-border',
              widthClassName ?? 'max-w-xl'
            )}
            initial={{ x: 240, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 240, opacity: 0 }}
            transition={{
              type: 'tween',
              ease: [0.2, 0.9, 0.2, 1],
              duration: 0.28,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">{title}</h3>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[calc(90vh-52px)] overflow-y-auto p-4">
              {children}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}

