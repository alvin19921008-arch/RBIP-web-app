'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, ChevronRight, Maximize2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface RemountOnOpenDetailsProps {
  className?: string
  summaryClassName?: string
  summary: React.ReactNode
  children: React.ReactNode
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
    <details className={cn('group', className)} open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className={cn('list-none cursor-pointer flex items-center gap-1.5', summaryClassName)}>
        {showChevron ? (open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />) : null}
        {summary}
      </summary>
      <div key={open ? 'open' : 'closed'}>{children}</div>
    </details>
  )
}

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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && handleClose()
    document.addEventListener('keydown', onKey)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen, handleClose])

  return (
    <>
      <div className={cn('relative group block w-full overflow-hidden rounded-md bg-transparent ring-1 ring-border/15', className)}>
        <div className={cn('block w-full', thumbnailClassName)} aria-hidden>
          {render('thumbnail')}
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={cn(
            'absolute top-2 left-2',
            'bg-black/50 hover:bg-black/70 rounded-full p-1.5',
            'transition-all duration-150 opacity-60 group-hover:opacity-100',
            'focus:outline-none focus:ring-2 focus:ring-white/50 focus:opacity-100'
          )}
          aria-label={`Expand ${label}`}
        >
          <Maximize2 className="h-4 w-4 text-white" />
        </button>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={label}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative z-10 flex flex-col items-center">
            <button
              type="button"
              onClick={handleClose}
              className="absolute -top-10 right-0 bg-white/10 hover:bg-white/20 rounded-full p-2 text-white/80 hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="w-full max-w-[720px] rounded-lg overflow-hidden shadow-2xl bg-muted/50">{render('modal')}</div>
          </div>
        </div>
      ) : null}
    </>
  )
}

type TeamState = { id: string; needed: number; filled: number }
type PcaState = { id: string; available: number }
type AnimationStep = {
  teams: TeamState[]
  pcas: PcaState[]
  subtitle: string
  activeTeam?: string
  activePca?: string
  slotsMoved?: number
}

type FlightRect = { id: string; sx: number; sy: number; tx: number; ty: number; delay: number }

function Controls({
  stepIdx,
  total,
  isPlaying,
  onPrev,
  onNext,
  onToggle,
}: {
  stepIdx: number
  total: number
  isPlaying: boolean
  onPrev: () => void
  onNext: () => void
  onToggle: () => void
}) {
  return (
    <div
      className={cn(
        'absolute top-2 left-1/2 -translate-x-1/2 z-30',
        'flex items-center gap-1 px-1 py-0.5',
        'rounded-2xl border border-white/18 dark:border-white/10',
        'bg-white/10 dark:bg-white/5',
        'backdrop-blur-xl supports-[backdrop-filter]:backdrop-blur-xl',
        'supports-[backdrop-filter]:[backdrop-filter:blur(18px)_saturate(165%)]',
        'shadow-[0_6px_20px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(255,255,255,0.12)]',
        'dark:shadow-[0_6px_20px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(255,255,255,0.06)]'
      )}
    >
      {/* Specular highlight strip for liquid-glass feel */}
      <div className="pointer-events-none absolute inset-x-1 top-0 h-[42%] rounded-t-xl bg-gradient-to-b from-white/30 to-transparent dark:from-white/10" />
      <div className="relative text-[9px] font-semibold text-slate-600/90 dark:text-slate-200/90 px-1.5 min-w-[24px] text-center">
        {stepIdx + 1}/{total}
      </div>
      <div className="relative w-px h-3 bg-white/35 dark:bg-white/16 mx-0.5" />
      <button onClick={onPrev} className="p-1 rounded-md hover:bg-white/22 dark:hover:bg-white/12 transition-colors" aria-label="Previous step">
        <SkipBack className="w-3 h-3 text-slate-700/80 dark:text-slate-200/80" />
      </button>
      <button onClick={onToggle} className="p-1 rounded-md hover:bg-white/22 dark:hover:bg-white/12 transition-colors" aria-label={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? <Pause className="w-3 h-3 text-slate-700/80 dark:text-slate-200/80" /> : <Play className="w-3 h-3 text-slate-700/80 dark:text-slate-200/80 ml-[0.5px]" />}
      </button>
      <button onClick={onNext} className="p-1 rounded-md hover:bg-white/22 dark:hover:bg-white/12 transition-colors" aria-label="Next step">
        <SkipForward className="w-3 h-3 text-slate-700/80 dark:text-slate-200/80" />
      </button>
    </div>
  )
}

function ModeExplainer({
  steps,
  className,
  idPrefix,
}: {
  steps: AnimationStep[]
  className?: string
  idPrefix: string
}) {
  const [stepIdx, setStepIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [flights, setFlights] = useState<FlightRect[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const FRAME_MS = 2000

  const current = steps[stepIdx]
  const moved = current.slotsMoved ?? 0

  useEffect(() => {
    if (!isPlaying) return
    const t = window.setInterval(() => setStepIdx((p) => (p + 1) % steps.length), FRAME_MS)
    return () => window.clearInterval(t)
  }, [isPlaying, steps.length])

  const prev = useCallback(() => {
    setIsPlaying(false)
    setStepIdx((p) => (p - 1 + steps.length) % steps.length)
  }, [steps.length])

  const next = useCallback(() => {
    setIsPlaying(false)
    setStepIdx((p) => (p + 1) % steps.length)
  }, [steps.length])

  useEffect(() => {
    const root = containerRef.current
    if (!root || !current.activeTeam || !current.activePca || moved <= 0) {
      setFlights([])
      return
    }
    const raf = window.requestAnimationFrame(() => {
      const rootRect = root.getBoundingClientRect()
      const nextFlights: FlightRect[] = []
      for (let i = 0; i < moved; i++) {
        const id = `${idPrefix}-${stepIdx}-${i}`
        const src = root.querySelector(`[data-flight-source="${id}"]`) as HTMLElement | null
        const dst = root.querySelector(`[data-flight-target="${id}"]`) as HTMLElement | null
        if (!src || !dst) continue
        const s = src.getBoundingClientRect()
        const d = dst.getBoundingClientRect()
        nextFlights.push({
          id,
          sx: s.left - rootRect.left + s.width / 2,
          sy: s.top - rootRect.top + s.height / 2,
          tx: d.left - rootRect.left + d.width / 2,
          ty: d.top - rootRect.top + d.height / 2,
          delay: i * 0.12,
        })
      }
      setFlights(nextFlights)
    })
    return () => window.cancelAnimationFrame(raf)
  }, [current.activeTeam, current.activePca, moved, stepIdx, idPrefix])

  return (
    <div className={cn('relative flex flex-col w-full font-sans text-foreground overflow-hidden bg-background rounded-md', className)} style={{ aspectRatio: '4/3' }}>
      <Controls stepIdx={stepIdx} total={steps.length} isPlaying={isPlaying} onPrev={prev} onNext={next} onToggle={() => setIsPlaying((v) => !v)} />

      <div ref={containerRef} className="flex-1 flex px-3 pt-8 pb-2 gap-4 relative">
        {flights.length > 0 ? (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible">
            {flights.map((f) => (
              <motion.circle
                key={f.id}
                cx={f.sx}
                cy={f.sy}
                r="5"
                fill="#3b82f6"
                stroke="#2563eb"
                strokeWidth="1"
                initial={{ cx: f.sx, cy: f.sy, opacity: 1, scale: 1 }}
                animate={{ cx: [f.sx, f.tx, f.tx], cy: [f.sy, f.ty, f.ty], opacity: [1, 1, 0], scale: [1, 1.08, 0.95] }}
                transition={{ duration: 0.75, ease: [0.2, 0.6, 0.2, 1], delay: f.delay, times: [0, 0.82, 1] }}
              />
            ))}
          </svg>
        ) : null}

        <div className="flex-1 flex flex-col justify-between relative z-10">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Teams (Need)</div>
          {current.teams.map((team) => (
            <div key={team.id} className="flex items-center justify-between bg-muted/30 p-1.5 rounded-md border border-border/50">
              <span className={cn('text-xs font-semibold w-8', current.activeTeam === team.id ? 'text-blue-600' : '')}>{team.id}</span>
              <div className="flex gap-1">
                {Array.from({ length: team.needed }).map((_, i) => {
                  const isTarget = current.activeTeam === team.id && moved > 0 && i >= team.filled - moved && i < team.filled
                  const order = isTarget ? i - (team.filled - moved) : -1
                  const fid = `${idPrefix}-${stepIdx}-${order}`
                  return (
                    <motion.div
                      key={`${team.id}-${i}`}
                      layout
                      initial={false}
                      animate={{ backgroundColor: i < team.filled ? '#2563eb' : 'transparent', borderColor: i < team.filled ? '#1d4ed8' : '#d1d5db' }}
                      transition={{ duration: 0.2, delay: 0.12 }}
                      className="w-3.5 h-3.5 border rounded-sm relative"
                    >
                      {isTarget ? <span data-flight-target={fid} className="absolute inset-0" /> : null}
                    </motion.div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="w-px bg-border/50 my-2 relative z-0" />

        <div className="flex-[0.8] flex flex-col gap-2 relative z-10">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">PCAs (Avail)</div>
          {current.pcas.map((pca) => (
            <div key={pca.id} className="flex items-center justify-between bg-muted/30 p-1.5 rounded-md border border-border/50">
              <span className={cn('text-xs w-8', current.activePca === pca.id ? 'font-bold text-blue-600' : 'text-muted-foreground')}>{pca.id}</span>
              <div className="flex gap-1 justify-end flex-1">
                {Array.from({ length: 4 }).map((_, i) => {
                  const isSource = current.activePca === pca.id && moved > 0 && i >= pca.available && i < pca.available + moved
                  const order = isSource ? i - pca.available : -1
                  const fid = `${idPrefix}-${stepIdx}-${order}`
                  return (
                    <motion.div
                      key={`${pca.id}-${i}`}
                      animate={{ backgroundColor: i < pca.available ? '#93c5fd' : 'transparent', opacity: i < pca.available ? 1 : 0.2 }}
                      transition={{ duration: 0.2, delay: 0.12 }}
                      className="w-3.5 h-3.5 rounded-sm border border-blue-200 relative"
                    >
                      {isSource ? <span data-flight-source={fid} className="absolute inset-0" /> : null}
                    </motion.div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-[48px] bg-muted/50 border-t border-border/50 flex items-start justify-center px-2 py-1 text-center overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIdx}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.2 }}
            className="text-[10px] sm:text-[11px] font-medium leading-snug w-full"
          >
            {current.subtitle}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="absolute top-0 left-0 w-full h-0.5 bg-muted">
        {isPlaying ? (
          <motion.div key={`p-${stepIdx}`} className="h-full bg-blue-500" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: FRAME_MS / 1000, ease: 'linear' }} />
        ) : null}
      </div>
    </div>
  )
}

const STANDARD_STEPS: AnimationStep[] = [
  {
    subtitle: 'Standard Mode: Highest need teams get all their slots first.',
    teams: [{ id: 'FO', needed: 3, filled: 0 }, { id: 'CPPC', needed: 2, filled: 0 }, { id: 'NSM', needed: 2, filled: 0 }],
    pcas: [{ id: '光劭', available: 3 }, { id: '友好', available: 4 }],
  },
  {
    subtitle: 'FO takes all 3 needed slots at once.',
    activeTeam: 'FO',
    activePca: '友好',
    slotsMoved: 3,
    teams: [{ id: 'FO', needed: 3, filled: 3 }, { id: 'CPPC', needed: 2, filled: 0 }, { id: 'NSM', needed: 2, filled: 0 }],
    pcas: [{ id: '光劭', available: 3 }, { id: '友好', available: 1 }],
  },
  {
    subtitle: 'CPPC takes its 2 slots next.',
    activeTeam: 'CPPC',
    activePca: '光劭',
    slotsMoved: 2,
    teams: [{ id: 'FO', needed: 3, filled: 3 }, { id: 'CPPC', needed: 2, filled: 2 }, { id: 'NSM', needed: 2, filled: 0 }],
    pcas: [{ id: '光劭', available: 1 }, { id: '友好', available: 1 }],
  },
  {
    subtitle: 'NSM takes remaining slots. If PCAs ran out, lower teams get 0.',
    activeTeam: 'NSM',
    activePca: '友好',
    slotsMoved: 2,
    teams: [{ id: 'FO', needed: 3, filled: 3 }, { id: 'CPPC', needed: 2, filled: 2 }, { id: 'NSM', needed: 2, filled: 2 }],
    pcas: [{ id: '光劭', available: 0 }, { id: '友好', available: 0 }],
  },
]

const BALANCED_STEPS: AnimationStep[] = [
  {
    subtitle: 'Balanced Mode: Teams take turns. One slot per pass.',
    teams: [{ id: 'FO', needed: 3, filled: 0 }, { id: 'CPPC', needed: 2, filled: 0 }, { id: 'NSM', needed: 2, filled: 0 }],
    pcas: [{ id: '光劭', available: 3 }, { id: '友好', available: 4 }],
  },
  {
    subtitle: 'Pass 1: FO gets 1 slot from PCA with most capacity (友好).',
    activeTeam: 'FO',
    activePca: '友好',
    slotsMoved: 1,
    teams: [{ id: 'FO', needed: 3, filled: 1 }, { id: 'CPPC', needed: 2, filled: 0 }, { id: 'NSM', needed: 2, filled: 0 }],
    pcas: [{ id: '光劭', available: 3 }, { id: '友好', available: 3 }],
  },
  {
    subtitle: 'Pass 1: CPPC gets 1 slot next (taking turns).',
    activeTeam: 'CPPC',
    activePca: '光劭',
    slotsMoved: 1,
    teams: [{ id: 'FO', needed: 3, filled: 1 }, { id: 'CPPC', needed: 2, filled: 1 }, { id: 'NSM', needed: 2, filled: 0 }],
    pcas: [{ id: '光劭', available: 2 }, { id: '友好', available: 3 }],
  },
  {
    subtitle: 'Pass 1: NSM gets 1 slot. Everyone got at least 1!',
    activeTeam: 'NSM',
    activePca: '友好',
    slotsMoved: 1,
    teams: [{ id: 'FO', needed: 3, filled: 1 }, { id: 'CPPC', needed: 2, filled: 1 }, { id: 'NSM', needed: 2, filled: 1 }],
    pcas: [{ id: '光劭', available: 2 }, { id: '友好', available: 2 }],
  },
  {
    subtitle: 'Pass 2: Back to FO for their next slot.',
    activeTeam: 'FO',
    activePca: '光劭',
    slotsMoved: 1,
    teams: [{ id: 'FO', needed: 3, filled: 2 }, { id: 'CPPC', needed: 2, filled: 1 }, { id: 'NSM', needed: 2, filled: 1 }],
    pcas: [{ id: '光劭', available: 1 }, { id: '友好', available: 2 }],
  },
  {
    subtitle: 'Round-robin prevents teams from getting 0 slots.',
    activeTeam: 'NSM',
    activePca: '友好',
    slotsMoved: 1,
    teams: [{ id: 'FO', needed: 3, filled: 3 }, { id: 'CPPC', needed: 2, filled: 2 }, { id: 'NSM', needed: 2, filled: 2 }],
    pcas: [{ id: '光劭', available: 0 }, { id: '友好', available: 0 }],
  },
]

export function Step3StandardModeExplainerSvg({ className }: { className?: string }) {
  return <ModeExplainer steps={STANDARD_STEPS} className={className} idPrefix="std" />
}

export function Step3BalancedModeExplainerSvg({ className }: { className?: string }) {
  return <ModeExplainer steps={BALANCED_STEPS} className={className} idPrefix="bal" />
}

