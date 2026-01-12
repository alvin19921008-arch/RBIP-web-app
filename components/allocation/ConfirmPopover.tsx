'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Check, X } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'

interface ConfirmPopoverProps {
  title: string
  description?: React.ReactNode
  onClose: () => void
  onConfirm: () => void
  confirmDisabled?: boolean
  position: { x: number; y: number }
  pageIndicator?: { current: number; total: number }
}

export function ConfirmPopover({
  title,
  description,
  onClose,
  onConfirm,
  confirmDisabled = false,
  position,
  pageIndicator,
}: ConfirmPopoverProps) {
  return (
    <div
      className="absolute z-[10003] bg-white dark:bg-slate-800 rounded-lg shadow-xl border-2 border-amber-500 p-2.5 w-[240px]"
      style={{
        left: position.x,
        top: position.y,
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 pr-4">
        {title}
      </div>

      {description ? (
        <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
          {description}
        </div>
      ) : null}

      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 flex items-center justify-between">
        {pageIndicator ? (
          <div className="text-[10px] text-slate-400 dark:text-slate-500">
            {Array.from({ length: pageIndicator.total }).map((_, idx) => (
              <span
                key={idx}
                className={cn(
                  idx + 1 === pageIndicator.current ? 'text-slate-700 dark:text-slate-200' : ''
                )}
              >
                {idx === 0 ? '' : ' '}
                •
              </span>
            ))}
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-1.5">
          <Tooltip content="Cancel" side="top">
            <button
              type="button"
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </Tooltip>

          <Tooltip content="Confirm" side="top">
            <button
              type="button"
              className={cn(
                'p-1 rounded text-amber-700 dark:text-amber-300',
                confirmDisabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-amber-100 dark:hover:bg-amber-900/40'
              )}
              disabled={confirmDisabled}
              onClick={(e) => {
                e.stopPropagation()
                if (confirmDisabled) return
                onConfirm()
              }}
            >
              <Check className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

