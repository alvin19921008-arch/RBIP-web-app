'use client'

import React from 'react'
import { Team } from '@/types/staff'
import { cn } from '@/lib/utils'
import { Check, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

interface TeamPickerPopoverProps {
  title: string
  selectedTeam: Team | null
  onSelectTeam: (team: Team) => void
  onClose: () => void
  onConfirm: () => void
  confirmDisabled?: boolean
  position: { x: number; y: number }
  hint?: React.ReactNode
  pageIndicator?: { current: number; total: number } // optional, for multi-page flows
  onPrevPage?: () => void
  onNextPage?: () => void
  prevDisabled?: boolean
  nextDisabled?: boolean
}

export function TeamPickerPopover({
  title,
  selectedTeam,
  onSelectTeam,
  onClose,
  onConfirm,
  confirmDisabled = false,
  position,
  hint,
  pageIndicator,
  onPrevPage,
  onNextPage,
  prevDisabled = false,
  nextDisabled = false,
}: TeamPickerPopoverProps) {
  return (
    <div
      className="absolute z-[10002] bg-white dark:bg-slate-800 rounded-lg shadow-xl border-2 border-amber-500 p-2.5 w-[220px]"
      style={{
        left: position.x,
        top: position.y,
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Close button */}
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

      {hint ? (
        <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
          {hint}
        </div>
      ) : null}

      <div className="mt-2 grid grid-cols-4 gap-1">
        {TEAMS.map((t) => {
          const active = t === selectedTeam
          return (
            <button
              key={t}
              type="button"
              className={cn(
                'px-2 py-1 rounded text-xs font-medium border transition-colors',
                active
                  ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-500 text-amber-800 dark:text-amber-200'
                  : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600'
              )}
              onClick={(e) => {
                e.stopPropagation()
                onSelectTeam(t)
              }}
            >
              {t}
            </button>
          )
        })}
      </div>

      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 flex items-center justify-between">
        {pageIndicator ? (
          <div className="flex items-center gap-2">
            <Tooltip content="Previous" side="top" zIndex={120000}>
              <button
                type="button"
                className={cn(
                  'p-1 rounded text-slate-600 dark:text-slate-300',
                  prevDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                )}
                disabled={prevDisabled}
                onClick={(e) => {
                  e.stopPropagation()
                  if (prevDisabled) return
                  onPrevPage?.()
                }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </Tooltip>

            <div className="text-sm text-slate-400 dark:text-slate-500 leading-none select-none">
              {Array.from({ length: pageIndicator.total }).map((_, idx) => (
                <span
                  key={idx}
                  className={cn(idx + 1 === pageIndicator.current ? 'text-slate-700 dark:text-slate-200' : '')}
                >
                  {idx === 0 ? '' : ' '}
                  •
                </span>
              ))}
            </div>

            <Tooltip content="Next" side="top" zIndex={120000}>
              <button
                type="button"
                className={cn(
                  'p-1 rounded text-slate-600 dark:text-slate-300',
                  nextDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                )}
                disabled={nextDisabled}
                onClick={(e) => {
                  e.stopPropagation()
                  if (nextDisabled) return
                  onNextPage?.()
                }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-1.5">
          <Tooltip content="Cancel" side="top" zIndex={120000}>
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

          <Tooltip content="Confirm" side="top" zIndex={120000}>
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

