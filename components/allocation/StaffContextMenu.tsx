'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { CursorTooltip } from '@/components/ui/cursor-tooltip'
import { useOnClickOutside } from '@/lib/hooks/useOnClickOutside'

export type StaffContextMenuItem = {
  key: string
  label: string
  icon: React.ReactNode
  disabled?: boolean
  disabledTooltip?: React.ReactNode
  onSelect: () => void
}

export type StaffContextMenuPosition = { x: number; y: number }

interface StaffContextMenuProps {
  open: boolean
  position: StaffContextMenuPosition | null
  /** Anchor point (usually pencil icon center). Used for "expand from icon" animation. */
  anchor?: StaffContextMenuPosition | null
  items: StaffContextMenuItem[]
  onClose: () => void
  className?: string
}

export function StaffContextMenu({
  open,
  position,
  anchor,
  items,
  onClose,
  className,
}: StaffContextMenuProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [rendered, setRendered] = useState(false)
  const [closing, setClosing] = useState(false)
  const [renderPos, setRenderPos] = useState<StaffContextMenuPosition | null>(null)
  const [renderAnchor, setRenderAnchor] = useState<StaffContextMenuPosition | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  const isOpen = open && !!position

  const [disabledTooltipOpen, setDisabledTooltipOpen] = useState(false)
  const [disabledTooltipContent, setDisabledTooltipContent] = useState<React.ReactNode>(null)
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  useEffect(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }

    if (isOpen) {
      setRendered(true)
      setClosing(false)
      setRenderPos(position!)
      setRenderAnchor(anchor ?? null)
      return
    }

    if (!rendered) return
    setClosing(true)
    // Keep mounted briefly so the retract animation can play.
    closeTimerRef.current = window.setTimeout(() => {
      setRendered(false)
      setClosing(false)
      setRenderPos(null)
      setRenderAnchor(null)
      closeTimerRef.current = null
    }, 160)
  }, [anchor, isOpen, position, rendered])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [])

  useOnClickOutside(containerRef, onClose, { enabled: rendered && !closing, event: 'pointerdown' })

  const renderedItems = useMemo(() => items, [items])

  if (!rendered || !renderPos) return null

  const deltaX = (renderAnchor?.x ?? renderPos.x) - renderPos.x
  const deltaY = (renderAnchor?.y ?? renderPos.y) - renderPos.y

  return (
    <>
    <div
      ref={containerRef}
      className={cn(
        // Use document-relative positioning so it scrolls with the page.
        'absolute z-[10001] w-[180px] rounded-md border border-border bg-white dark:bg-slate-800 shadow-xl p-0.5',
        'will-change-[transform,opacity]',
        closing ? 'animate-context-menu-out pointer-events-none' : 'animate-context-menu-in',
        className
      )}
      style={{
        left: renderPos.x,
        top: renderPos.y,
        // Animate "from/to" the pencil icon click point.
        ['--ctx-from-x' as any]: `${deltaX}px`,
        ['--ctx-from-y' as any]: `${deltaY}px`,
      }}
      onPointerDown={(e) => {
        // Prevent schedule page global handlers from seeing this click.
        e.stopPropagation()
      }}
    >
      {renderedItems.map((item) => {
        const row = (
          <button
            key={item.key}
            type="button"
              aria-disabled={!!item.disabled}
            onClick={(e) => {
              e.stopPropagation()
              if (item.disabled) return
              item.onSelect()
            }}
            className={cn(
              'w-full flex items-center gap-1.5 px-1.5 py-1.5 rounded-sm text-[13px] leading-none text-left transition-colors',
              item.disabled
                  ? 'opacity-50 cursor-default'
                : 'hover:bg-slate-100 dark:hover:bg-slate-700'
            )}
          >
            <span className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
              {item.icon}
            </span>
            <span className="flex-1">{item.label}</span>
          </button>
        )

        if (item.disabled && item.disabledTooltip) {
          return (
              <span
              key={item.key}
                className="block"
                onPointerEnter={(e) => {
                  setDisabledTooltipContent(item.disabledTooltip)
                  setCursorPos({ x: e.clientX, y: e.clientY })
                  setDisabledTooltipOpen(true)
                }}
                onPointerMove={(e) => {
                  if (!disabledTooltipOpen) return
                  setCursorPos({ x: e.clientX, y: e.clientY })
                }}
                onPointerLeave={() => {
                  setDisabledTooltipOpen(false)
                  setDisabledTooltipContent(null)
                }}
              >
                {row}
              </span>
          )
        }

        return row
      })}
    </div>

      <CursorTooltip
        open={disabledTooltipOpen}
        content={disabledTooltipContent}
        clientX={cursorPos.x}
        clientY={cursorPos.y}
        className="bg-slate-200 text-slate-900 border-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
      />
    </>
  )
}

