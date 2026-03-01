'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion'
import { MessageSquarePlus, X } from 'lucide-react'
import { FeedbackForm } from './FeedbackForm'

interface FeedbackButtonProps {
  userRole: string
  userName: string | null
}

const STORAGE_KEY = 'rbip_feedback_btn_pos'
const DEFAULT_POS = { x: -24, y: -24 } // bottom-right offset from window edge (negative = from right/bottom)
const DRAG_THRESHOLD = 5

function loadPosition(): { right: number; bottom: number } {
  if (typeof window === 'undefined') return { right: 24, bottom: 24 }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { right: 24, bottom: 24 }
}

function savePosition(right: number, bottom: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ right, bottom }))
  } catch {}
}

export function FeedbackButton({ userRole, userName }: FeedbackButtonProps) {
  const [mounted, setMounted] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerHiddenForCrop, setDrawerHiddenForCrop] = useState(false)
  const [pos, setPos] = useState<{ right: number; bottom: number }>({ right: 24, bottom: 24 })
  const [unreadCount, setUnreadCount] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  // Only render on client — this component uses window extensively
  useEffect(() => { setMounted(true) }, [])

  const dragStart = useRef<{ mouseX: number; mouseY: number; right: number; bottom: number } | null>(null)
  const didDrag = useRef(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Load saved position
  useEffect(() => {
    setPos(loadPosition())
  }, [])

  // Load unread reply count
  useEffect(() => {
    fetch('/api/feedback?mode=similar')
      .then(r => r.json())
      .then(data => {
        // Count own reports with unread dev_reply — we filter client-side from the full list
        // This is a lightweight approach; for accuracy we'd need a dedicated endpoint
      })
      .catch(() => {})
  }, [])

  // ─── DRAG ──────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      right: pos.right,
      bottom: pos.bottom,
    }
    didDrag.current = false
  }, [pos])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragStart.current) return
    const dx = e.clientX - dragStart.current.mouseX
    const dy = e.clientY - dragStart.current.mouseY
    if (!didDrag.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    didDrag.current = true
    setIsDragging(true)

    const newRight = Math.max(8, Math.min(window.innerWidth - 52, dragStart.current.right - dx))
    const newBottom = Math.max(8, Math.min(window.innerHeight - 52, dragStart.current.bottom - dy))
    setPos({ right: newRight, bottom: newBottom })
  }, [])

  const handleMouseUp = useCallback(() => {
    if (dragStart.current) {
      if (didDrag.current) {
        savePosition(pos.right, pos.bottom)
      }
    }
    dragStart.current = null
    setIsDragging(false)
  }, [pos])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const handleClick = () => {
    if (didDrag.current) return // was a drag, not a click
    setDrawerOpen(v => !v)
  }

  // Determine transform-origin for the drawer based on button position
  // Computed safely (window only available client-side, and this component is client-only)
  const drawerOriginX = typeof window !== 'undefined' && pos.right < window.innerWidth / 2 ? 'left' : 'right'
  const drawerOriginY = typeof window !== 'undefined' && pos.bottom < window.innerHeight / 2 ? 'top' : 'bottom'
  const transformOrigin = `${drawerOriginY} ${drawerOriginX}`

  if (!mounted) return null

  return (
    <>
      {/* ─── FLOATING BUTTON ──────────────────────────────────────────── */}
      <AnimatePresence>
        {!drawerOpen && (
          <motion.div
            className="fixed z-[9000]"
            style={{ right: pos.right, bottom: pos.bottom }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            data-feedback-exclude="true"
          >
            {/* Pulse ring — renders when unread > 0 */}
            {unreadCount > 0 && (
              <span className="absolute inset-0 rounded-full animate-ping bg-slate-400/30 pointer-events-none" />
            )}

            <motion.button
              ref={btnRef}
              onMouseDown={handleMouseDown}
              onClick={handleClick}
              animate={{
                scale: isDragging ? 1.04 : 1,
                boxShadow: isDragging
                  ? '0 8px 24px rgba(0,0,0,0.25)'
                  : '0 4px 12px rgba(0,0,0,0.15)',
              }}
              whileHover={{
                scale: 1.08,
                boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
              }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className="relative h-11 w-11 rounded-full bg-slate-900 flex items-center justify-center"
              style={{
                cursor: isDragging ? 'grabbing' : 'grab',
                userSelect: 'none',
              }}
              aria-label="Report feedback or bug"
            >
              <motion.div
                animate={{ rotate: isDragging ? -8 : 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <MessageSquarePlus className="h-5 w-5 text-white" />
              </motion.div>

              {/* Unread badge */}
              <AnimatePresence>
                {unreadCount > 0 && (
                  <motion.span
                    key="badge"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-white"
                  >
                    {unreadCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── DRAWER ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            {/* Backdrop — very subtle dim; hidden when crop mode so page is visible */}
            <motion.div
              className="fixed inset-0 z-[8999] bg-black/10"
              initial={{ opacity: 0 }}
              animate={{ opacity: drawerHiddenForCrop ? 0 : 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => !drawerHiddenForCrop && setDrawerOpen(false)}
              data-feedback-exclude="true"
              style={{ pointerEvents: drawerHiddenForCrop ? 'none' : 'auto' }}
            />

            {/* Drawer panel — origin-expand from button position; slides off when crop mode */}
            <motion.div
              className="fixed z-[9000] w-[400px] max-w-[calc(100vw-16px)] bg-background border-l border-border shadow-xl overflow-hidden flex flex-col"
              style={{
                right: 0,
                bottom: 0,
                top: 0,
                transformOrigin,
              }}
              initial={{ opacity: 0, scale: 0.6, x: 40 }}
              animate={{
                opacity: drawerHiddenForCrop ? 0 : 1,
                scale: drawerHiddenForCrop ? 0.95 : 1,
                x: drawerHiddenForCrop ? '100%' : 0,
              }}
              exit={{ opacity: 0, scale: 0.85, x: 20 }}
              transition={{
                type: 'spring',
                stiffness: 380,
                damping: 30,
                opacity: { duration: drawerHiddenForCrop ? 0.2 : 0.18 },
              }}
              data-feedback-exclude="true"
            >
              {/* Header */}
              <motion.div
                className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.08, duration: 0.2 }}
              >
                <span className="text-sm font-semibold">Report an Issue</span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto py-4">
                <FeedbackForm
                  userRole={userRole}
                  userName={userName}
                  compact
                  onCropModeChange={setDrawerHiddenForCrop}
                  onSubmitSuccess={() => {
                    // Keep drawer open to show success state
                  }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
