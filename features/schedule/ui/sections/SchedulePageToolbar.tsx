/**
 * Display / Split / Undo / Redo segmented control for the schedule header.
 *
 * R3-27: Grid interaction overlays (ScheduleOverlays → DragOverlay) were not extracted here — that
 * block depends on dozens of page locals and inline handlers; a stable props-only surface would be
 * enormous. Toolbar-only extraction keeps behavior and a11y identical.
 */
import { Eye, EyeOff, Redo2, SquareSplitHorizontal, Undo2 } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type SchedulePageToolbarProps = {
  isDisplayMode: boolean
  isSplitMode: boolean
  isRefHidden: boolean
  canUndo: boolean
  canRedo: boolean
  onToggleDisplayMode: () => void
  onToggleSplitMode: () => void
  onUndo: () => void
  onRedo: () => void
}

export function SchedulePageToolbar({
  isDisplayMode,
  isSplitMode,
  isRefHidden,
  canUndo,
  canRedo,
  onToggleDisplayMode,
  onToggleSplitMode,
  onUndo,
  onRedo,
}: SchedulePageToolbarProps) {
  return (
    <div
      className={cn(
        // Soft segmented control (2026-style): subtle surface, minimal borders.
        'inline-flex items-center rounded-lg overflow-hidden',
        'bg-muted/35',
        'ring-1 ring-border/40 shadow-sm'
      )}
    >
      <span className="hidden lg:inline-flex px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground/80 select-none pointer-events-none tracking-wider uppercase">
        Mode
      </span>
      <Tooltip side="bottom" content={isDisplayMode ? 'Exit display mode' : 'Enter display mode (read-only)'}>
        <button
          type="button"
          onClick={onToggleDisplayMode}
          className={cn(
            'px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5',
            'transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            isDisplayMode
              ? 'bg-blue-600 text-white shadow-inner'
              : 'text-slate-700 dark:text-slate-300 hover:text-foreground hover:bg-slate-200/80 dark:hover:bg-slate-800/80',
            'active:bg-muted/55'
          )}
          aria-pressed={isDisplayMode}
        >
          {isDisplayMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span>Display</span>
        </button>
      </Tooltip>
      <Tooltip
        side="bottom"
        content={
          isSplitMode
            ? isRefHidden
              ? 'Split screen: ON (reference retracted)'
              : 'Split screen: ON'
            : 'Split screen: OFF'
        }
      >
        <button
          type="button"
          onClick={onToggleSplitMode}
          className={cn(
            'px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5',
            'transition-all duration-200',
            'border-l border-border/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            isSplitMode
              ? 'bg-blue-600 text-white shadow-inner'
              : 'text-slate-700 dark:text-slate-300 hover:text-foreground hover:bg-slate-200/80 dark:hover:bg-slate-800/80',
            'active:bg-muted/55'
          )}
          aria-pressed={isSplitMode}
        >
          <SquareSplitHorizontal className="h-4 w-4" />
          <span>Split</span>
        </button>
      </Tooltip>
      <Tooltip
        side="bottom"
        content={
          isDisplayMode
            ? 'Undo disabled in display mode'
            : canUndo
              ? 'Undo last manual edit'
              : 'Nothing to undo'
        }
      >
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo || isDisplayMode}
          className={cn(
            'px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5',
            'transition-all duration-200 border-l border-border/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            canUndo && !isDisplayMode
              ? 'text-slate-700 dark:text-slate-300 hover:text-foreground hover:bg-slate-200/80 dark:hover:bg-slate-800/80 active:bg-muted/55'
              : 'text-slate-400/30 dark:text-slate-600/30 cursor-not-allowed'
          )}
          aria-disabled={!canUndo || isDisplayMode}
        >
          <Undo2 className="h-4 w-4" />
          <span>Undo</span>
        </button>
      </Tooltip>
      <Tooltip
        side="bottom"
        content={
          isDisplayMode
            ? 'Redo disabled in display mode'
            : canRedo
              ? 'Redo last undone edit'
              : 'Nothing to redo'
        }
      >
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo || isDisplayMode}
          className={cn(
            'px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5',
            'transition-all duration-200 border-l border-border/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            canRedo && !isDisplayMode
              ? 'text-slate-700 dark:text-slate-300 hover:text-foreground hover:bg-slate-200/80 dark:hover:bg-slate-800/80 active:bg-muted/55'
              : 'text-slate-400/30 dark:text-slate-600/30 cursor-not-allowed'
          )}
          aria-disabled={!canRedo || isDisplayMode}
        >
          <Redo2 className="h-4 w-4" />
          <span>Redo</span>
        </button>
      </Tooltip>
    </div>
  )
}
