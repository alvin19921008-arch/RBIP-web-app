'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'

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
  items: StaffContextMenuItem[]
  onClose: () => void
  className?: string
}

export function StaffContextMenu({ open, position, items, onClose, className }: StaffContextMenuProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const isOpen = open && !!position

  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (e: PointerEvent) => {
      const el = containerRef.current
      if (!el) return
      if (el.contains(e.target as Node)) return
      onClose()
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [isOpen, onClose])

  const renderedItems = useMemo(() => items, [items])

  if (!isOpen) return null

  return (
    <div
      ref={containerRef}
      className={cn(
        // Use document-relative positioning so it scrolls with the page.
        'absolute z-[10001] w-[220px] rounded-md border border-border bg-white dark:bg-slate-800 shadow-xl p-1',
        className
      )}
      style={{
        left: position!.x,
        top: position!.y,
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
            disabled={!!item.disabled}
            onClick={(e) => {
              e.stopPropagation()
              if (item.disabled) return
              item.onSelect()
            }}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-2 rounded-sm text-sm text-left transition-colors',
              item.disabled
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-slate-100 dark:hover:bg-slate-700'
            )}
          >
            <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
              {item.icon}
            </span>
            <span className="flex-1">{item.label}</span>
          </button>
        )

        if (item.disabled && item.disabledTooltip) {
          return (
            <Tooltip
              key={item.key}
              content={item.disabledTooltip}
              side="right"
              wrapperClassName="block w-full"
              className="z-[11000] bg-slate-200 text-slate-900 border-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
            >
              <span className="block">{row}</span>
            </Tooltip>
          )
        }

        return row
      })}
    </div>
  )
}

