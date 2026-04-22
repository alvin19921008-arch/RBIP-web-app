'use client'

import { Eye, EyeOff, Redo2, SquareSplitHorizontal, Undo2 } from 'lucide-react'

import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type SchedulePageSplitMainPaneHeaderProps = {
  isRefHidden: boolean
  isDisplayMode: boolean
  canUndo: boolean
  canRedo: boolean
  onToggleDisplayMode: () => void
  onExitSplitMode: () => void
  onUndoManualEdit: () => void
  onRedoManualEdit: () => void
}

/** Split layout: fixed “Main (Editable)” strip with view / split / undo / redo (Phase 2d). */
export function SchedulePageSplitMainPaneHeader({
  isRefHidden,
  isDisplayMode,
  canUndo,
  canRedo,
  onToggleDisplayMode,
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
            <Tooltip side="bottom" content={isDisplayMode ? 'Exit display mode' : 'Enter display mode (read-only)'}>
              <button
                type="button"
                onClick={onToggleDisplayMode}
                className={cn(
                  'px-2 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1.5',
                  isDisplayMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-muted-foreground hover:text-primary hover:bg-muted/60'
                )}
                aria-pressed={isDisplayMode}
              >
                {isDisplayMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="hidden md:inline">Display</span>
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
              content={isDisplayMode ? 'Undo disabled in display mode' : canUndo ? 'Undo last manual edit' : 'Nothing to undo'}
            >
              <button
                type="button"
                onClick={onUndoManualEdit}
                disabled={!canUndo || isDisplayMode}
                className={cn(
                  'px-2 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1.5 border-l border-border',
                  canUndo && !isDisplayMode
                    ? 'text-muted-foreground hover:text-primary hover:bg-muted/60'
                    : 'text-muted-foreground/50 cursor-not-allowed'
                )}
                aria-disabled={!canUndo || isDisplayMode}
              >
                <Undo2 className="h-4 w-4" />
                <span className="hidden md:inline">Undo</span>
              </button>
            </Tooltip>
            <Tooltip
              side="bottom"
              content={isDisplayMode ? 'Redo disabled in display mode' : canRedo ? 'Redo last undone edit' : 'Nothing to redo'}
            >
              <button
                type="button"
                onClick={onRedoManualEdit}
                disabled={!canRedo || isDisplayMode}
                className={cn(
                  'px-2 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1.5 border-l border-border',
                  canRedo && !isDisplayMode
                    ? 'text-muted-foreground hover:text-primary hover:bg-muted/60'
                    : 'text-muted-foreground/50 cursor-not-allowed'
                )}
                aria-disabled={!canRedo || isDisplayMode}
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
