'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, Maximize2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ——— RemountOnOpenDetails ———
// Collapsible details that remounts inner content when opened (e.g. for animations).
interface RemountOnOpenDetailsProps {
  className?: string
  summaryClassName?: string
  summary: React.ReactNode
  children: React.ReactNode
  /** When true, shows a chevron icon indicating expand/collapse state. */
  showChevron?: boolean
}

export function RemountOnOpenDetails({
  className,
  summaryClassName,
  summary,
  children,
  showChevron = false,
}: RemountOnOpenDetailsProps) {
  const [open, setOpen] = useState(false)
  return (
    <details
      className={cn('group', className)}
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className={cn('list-none cursor-pointer flex items-center gap-1.5', summaryClassName)}>
        {showChevron && (
          open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          )
        )}
        {summary}
      </summary>
      <div key={open ? 'open' : 'closed'}>{children}</div>
    </details>
  )
}

// ——— SvgViewer ———
// Thumbnail + modal expand for inline SVG content (render prop receives 'thumbnail' | 'modal').
interface SvgViewerProps {
  label: string
  className?: string
  thumbnailClassName?: string
  render: (variant: 'thumbnail' | 'modal') => React.ReactNode
}

export function SvgViewer({ label, className, thumbnailClassName, render }: SvgViewerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const handleClose = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen])

  return (
    <>
      <div
        className={cn(
          'relative group block w-full overflow-hidden rounded-md bg-transparent ring-1 ring-border/15',
          className
        )}
      >
        <div className={cn('block w-full', thumbnailClassName)} aria-hidden>
          {render('thumbnail')}
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={cn(
            'absolute bottom-2 right-2',
            'bg-black/50 hover:bg-black/70',
            'rounded-full p-1.5',
            'transition-all duration-150',
            'opacity-60 group-hover:opacity-100',
            'focus:outline-none focus:ring-2 focus:ring-white/50 focus:opacity-100'
          )}
          aria-label={`Expand ${label}`}
        >
          <Maximize2 className="h-4 w-4 text-white" />
        </button>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={handleClose}
          />
          <div className="relative z-10 flex flex-col items-center">
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                'absolute -top-10 right-0',
                'bg-white/10 hover:bg-white/20 backdrop-blur-sm',
                'rounded-full p-2',
                'transition-colors duration-150',
                'text-white/80 hover:text-white'
              )}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="w-full max-w-[720px] rounded-lg overflow-hidden shadow-2xl bg-muted/50">
              {render('modal')}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ——— Step 3 mode explainer SVGs (placeholder illustrations) ———
// Minimal inline SVGs so the dialog renders; replace with real assets if needed.

interface SvgPlaceholderProps {
  className?: string
}

/** Standard mode: preferred/adjacent slots then remaining allocation. */
export function Step3StandardModeExplainerSvg({ className }: SvgPlaceholderProps) {
  return (
    <svg
      viewBox="0 0 400 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('block w-full h-auto', className)}
      aria-hidden
    >
      <rect x="10" y="20" width="70" height="40" rx="4" className="fill-primary/20 stroke-primary/50" strokeWidth="1" />
      <text x="45" y="44" textAnchor="middle" className="fill-foreground text-[10px] font-medium">3.2</text>
      <rect x="90" y="20" width="70" height="40" rx="4" className="fill-primary/20 stroke-primary/50" strokeWidth="1" />
      <text x="125" y="44" textAnchor="middle" className="fill-foreground text-[10px] font-medium">3.3</text>
      <path d="M 170 40 L 200 40" className="stroke-muted-foreground" strokeWidth="1.5" strokeDasharray="4 2" />
      <rect x="210" y="20" width="180" height="40" rx="4" className="fill-muted/50 stroke-border" strokeWidth="1" />
      <text x="300" y="44" textAnchor="middle" className="fill-muted-foreground text-[10px]">3.4 remaining</text>
    </svg>
  )
}

/** Balanced mode: take turns, no 3.2/3.3. */
export function Step3BalancedModeExplainerSvg({ className }: SvgPlaceholderProps) {
  return (
    <svg
      viewBox="0 0 400 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('block w-full h-auto', className)}
      aria-hidden
    >
      <circle cx="60" cy="40" r="24" className="fill-primary/20 stroke-primary/50" strokeWidth="1" />
      <text x="60" y="45" textAnchor="middle" className="fill-foreground text-[10px] font-medium">1</text>
      <circle cx="140" cy="40" r="24" className="fill-muted stroke-border" strokeWidth="1" />
      <text x="140" y="45" textAnchor="middle" className="fill-muted-foreground text-[10px]">2</text>
      <circle cx="220" cy="40" r="24" className="fill-muted stroke-border" strokeWidth="1" />
      <text x="220" y="45" textAnchor="middle" className="fill-muted-foreground text-[10px]">3</text>
      <circle cx="300" cy="40" r="24" className="fill-muted stroke-border" strokeWidth="1" />
      <text x="300" y="45" textAnchor="middle" className="fill-muted-foreground text-[10px]">…</text>
      <path d="M 84 40 L 116 40 M 164 40 L 196 40 M 244 40 L 276 40" className="stroke-muted-foreground" strokeWidth="1.5" />
    </svg>
  )
}
