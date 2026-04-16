'use client'

import { Eye, EyeOff, Redo2, SquareSplitHorizontal, Undo2 } from 'lucide-react'

import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type SchedulePageSplitMainPaneHeaderProps = {
  isRefHidden: boolean
  isViewingMode: boolean
  canUndo: boolean
  canRedo: boolean
  onToggleViewingMode: () => void
  onExitSplitMode: () => void
  onUndoManualEdit: () => void
  onRedoManualEdit: () => void
}

/** Split layout: fixed “Main (Editable)” strip with view / split / undo / redo (Phase 2d). */
export function SchedulePageSplitMainPaneHeader({
  isRefHidden,
  isViewingMode,
  canUndo,
  canRedo,
  onToggleViewingMode,
  onExitSplitMode,
  onUndoManualEdit,
  onRedoManualEdit,
}: SchedulePageSplitMainPaneHeaderProps) {
  return (
    <div className="shrink-0 bg-blue-50/60 dark:bg-blue-950/25 backdrop-blur border-b border-border">
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-800 dark:text-blue-200">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
            Main (Editable)
          </div>
          {isRefHidden ? <div className="text-[11px] text-muted-foreground truncate">Reference is retracted</div> : null}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <div className="inline-flex items-center border border-border rounded-md overflow-hidden bg-background shadow-xs">
            <Tooltip side="bottom" content={isViewingMode ? 'Exit viewing mode' : 'Enter viewing mode'}>
              <button
                type="button"
                onClick={onToggleViewingMode}
                className={cn(
                  'px-2 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1.5',
                  isViewingMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-muted-foreground hover:text-primary hover:bg-muted/60'
                )}
                aria-pressed={isViewingMode}
              >
                {isViewingMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="hidden md:inline">View</span>
              </button>
            </Tooltip>
            <Tooltip side="bottom" content="Exit split mode">
              <button
                type="button"
                onClick={onExitSplitMode}
                className={cn(
                  'px-2 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1.5 border-l border-border',
                  'bg-blue-600 text-white hover:bg-blue-700'
                )}
              >
                <SquareSplitHorizontal className="h-4 w-4" />
                <span className="hidden md:inline">Split</span>
              </button>
            </Tooltip>
            <Tooltip
              side="bottom"
              content={isViewingMode ? 'Undo disabled in viewing mode' : canUndo ? 'Undo last manual edit' : 'Nothing to undo'}
            >
              <button
                type="button"
                onClick={onUndoManualEdit}
                disabled={!canUndo || isViewingMode}
                className={cn(
                  'px-2 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1.5 border-l border-border',
                  canUndo && !isViewingMode
                    ? 'text-muted-foreground hover:text-primary hover:bg-muted/60'
                    : 'text-muted-foreground/50 cursor-not-allowed'
                )}
                aria-disabled={!canUndo || isViewingMode}
              >
                <Undo2 className="h-4 w-4" />
                <span className="hidden md:inline">Undo</span>
              </button>
            </Tooltip>
            <Tooltip
              side="bottom"
              content={isViewingMode ? 'Redo disabled in viewing mode' : canRedo ? 'Redo last undone edit' : 'Nothing to redo'}
            >
              <button
                type="button"
                onClick={onRedoManualEdit}
                disabled={!canRedo || isViewingMode}
                className={cn(
                  'px-2 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1.5 border-l border-border',
                  canRedo && !isViewingMode
                    ? 'text-muted-foreground hover:text-primary hover:bg-muted/60'
                    : 'text-muted-foreground/50 cursor-not-allowed'
                )}
                aria-disabled={!canRedo || isViewingMode}
              >
                <Redo2 className="h-4 w-4" />
                <span className="hidden md:inline">Redo</span>
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  )
}
