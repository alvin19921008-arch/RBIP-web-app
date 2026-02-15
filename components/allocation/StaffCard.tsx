'use client'

import React, { useCallback, useEffect, useRef, useState, ReactNode } from 'react'
import { Staff } from '@/types/staff'
import { TherapistAllocation } from '@/types/schedule'
import { useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Pencil, X } from 'lucide-react'
import { formatFTE } from '@/lib/utils/rounding'
import { Tooltip } from '@/components/ui/tooltip'

interface StaffCardProps {
  staff: Staff
  allocation?: TherapistAllocation
  fteRemaining?: number | string  // Can be number or string (e.g., "0.5 AM")
  sptDisplay?: string
  slotDisplay?: ReactNode // Optional: slot display with leave/come back times
  headerRight?: ReactNode // Optional: right-aligned label in header row (e.g. special program name)
  onEdit?: (event?: React.MouseEvent) => void
  onOpenContextMenu?: (event: React.MouseEvent) => void
  onConvertToInactive?: (event?: React.MouseEvent) => void // For buffer staff: convert back to inactive
  draggable?: boolean
  nameColor?: string // Optional: custom color class for name (e.g., 'text-red-600')
  borderColor?: string // Optional: custom border color class (e.g., 'border-green-700')
  fillColorClassName?: string // Optional: background fill color classes (schedule overrides)
  dragTeam?: string // Optional: team context for drag-and-drop (used for PCA slot transfers)
  baseFTE?: number // For battery outer border (Base_FTE-remaining)
  trueFTE?: number // For battery green fill (True-FTE-remaining)
  isFloatingPCA?: boolean // Enable battery display
  showFTE?: boolean // Show FTE next to name
  currentStep?: string // For slot transfer validation
  initializedSteps?: Set<string> // For slot transfer validation
  useDragOverlay?: boolean // If true, keep original card stationary while DragOverlay follows cursor
}

function wrapTimeRangesInNode(node: ReactNode): ReactNode {
  // Wrap time ranges like "1500-1630" so they never split across lines.
  const TIME_RANGE_RE = /(\d{4}-\d{4})/g

  if (typeof node === 'string') {
    const parts = node.split(TIME_RANGE_RE)
    if (parts.length === 1) return node
    return parts.map((part, idx) => {
      if (TIME_RANGE_RE.test(part)) {
        // Reset regex state after .test on global regex
        TIME_RANGE_RE.lastIndex = 0
        return (
          <span key={`tr-${idx}`} className="whitespace-nowrap">
            {part}
          </span>
        )
      }
      TIME_RANGE_RE.lastIndex = 0
      return <React.Fragment key={`txt-${idx}`}>{part}</React.Fragment>
    })
  }

  if (Array.isArray(node)) {
    return node.map((child, idx) => (
      <React.Fragment key={`arr-${idx}`}>{wrapTimeRangesInNode(child)}</React.Fragment>
    ))
  }

  if (React.isValidElement(node)) {
    const children = (node.props as { children?: ReactNode }).children
    if (children === undefined) return node
    // React 19 typings are stricter: don't pass `node.props` (often inferred as `unknown`)
    // since we are not overriding any props here.
    return React.cloneElement(node, undefined, wrapTimeRangesInNode(children))
  }

  return node
}

export function StaffCard({ staff, allocation, fteRemaining, sptDisplay, slotDisplay, headerRight, onEdit, onOpenContextMenu, onConvertToInactive, draggable = true, nameColor, borderColor, fillColorClassName, dragTeam, baseFTE, trueFTE, isFloatingPCA, showFTE, currentStep, initializedSteps, useDragOverlay = false }: StaffCardProps) {
  const LONG_PRESS_MS = 420
  const LONG_PRESS_MOVE_TOLERANCE = 8
  // Use composite ID to ensure each team's instance has a unique draggable id
  // This prevents drag styling from applying to the same staff card in other teams
  // Use '::' as separator (unlikely to appear in UUIDs)
  const draggableId = dragTeam ? `${staff.id}::${dragTeam}` : staff.id
  
  // Always call useDraggable hook (React hooks must be called unconditionally)
  // But conditionally apply listeners/attributes based on draggable prop
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId,
    data: { staff, allocation, team: dragTeam },
  })
  
  // Conditionally apply drag functionality based on draggable prop
  const effectiveAttributes = draggable ? attributes : {}
  const effectiveListeners = draggable ? listeners : {}
  const cardRef = useRef<HTMLDivElement | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressPulseResetRef = useRef<number | null>(null)
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const longPressPointerIdRef = useRef<number | null>(null)
  const [longPressPulseActive, setLongPressPulseActive] = useState(false)

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const clearLongPressPulseReset = useCallback(() => {
    if (longPressPulseResetRef.current !== null) {
      window.clearTimeout(longPressPulseResetRef.current)
      longPressPulseResetRef.current = null
    }
  }, [])

  const triggerHaptic = useCallback((pattern: number | number[] = 10) => {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    try {
      navigator.vibrate(pattern)
    } catch {
      // Ignore unsupported/browser-blocked vibration.
    }
  }, [])

  useEffect(() => {
    return () => {
      clearLongPressTimer()
      clearLongPressPulseReset()
    }
  }, [clearLongPressPulseReset, clearLongPressTimer])

  useEffect(() => {
    if (!isDragging) return
    // Guard against delayed long-press firing while a drag is already active.
    clearLongPressTimer()
    clearLongPressPulseReset()
    setLongPressPulseActive(false)
    longPressPointerIdRef.current = null
    longPressStartRef.current = null
  }, [isDragging, clearLongPressPulseReset, clearLongPressTimer])

  const setCardNodeRef = useCallback((node: HTMLDivElement | null) => {
    cardRef.current = node
    if (draggable) setNodeRef(node)
  }, [draggable, setNodeRef])

  const shouldApplyTransform = !!transform && !(useDragOverlay && isDragging)
  const style = {
    WebkitTouchCallout: 'none' as const,
    WebkitUserSelect: 'none' as const,
    userSelect: 'none' as const,
    ...(shouldApplyTransform ? { transform: `translate3d(${transform!.x}px, ${transform!.y}px, 0)` } : {}),
  }

  // Display name (FTE will be shown separately on the right)
  // Add "*" suffix for buffer staff
  const isBufferStaff = staff.status === 'buffer'
  const baseName = sptDisplay 
    ? `${staff.name} ${sptDisplay}`
    : staff.name
  const displayName = isBufferStaff ? `${baseName}*` : baseName
  
  // FTE value to display on the right (for staff pool)
  const fteDisplay = showFTE && fteRemaining !== undefined
    ? fteRemaining === 0
      ? '0'
      : typeof fteRemaining === 'string'
        ? fteRemaining  // Already formatted string (e.g., "0.5 AM")
        : formatFTE(fteRemaining)
    : fteRemaining !== undefined && fteRemaining !== 1.0 && fteRemaining !== 0
    ? typeof fteRemaining === 'string'
      ? fteRemaining  // Already formatted string (e.g., "0.5 AM")
      : formatFTE(fteRemaining)
    : undefined

  const [isHoveringCard, setIsHoveringCard] = useState(false)
  const [isHoveringEdit, setIsHoveringEdit] = useState(false)
  const [isHoveringConvert, setIsHoveringConvert] = useState(false)

  // Determine border color: use provided borderColor, or default based on rank
  const borderColorClass = borderColor 
    ? borderColor
    : staff.rank === 'APPT' 
    ? 'border-[#e7cc32]' 
    : staff.rank === 'SPT' 
    ? 'border-[#d38e25]' 
    : 'border-border'

  // Battery display for floating PCA in staff pool
  const showBattery = isFloatingPCA && baseFTE !== undefined && trueFTE !== undefined
  const renderedSlotDisplay = slotDisplay ? wrapTimeRangesInNode(slotDisplay) : null

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!onOpenContextMenu) return
    if (e.pointerType !== 'touch') return
    if ((e.target as HTMLElement).closest('button')) return

    clearLongPressTimer()
    longPressPointerIdRef.current = e.pointerId
    longPressStartRef.current = { x: e.clientX, y: e.clientY }

    longPressTimerRef.current = window.setTimeout(() => {
      const node = cardRef.current
      const start = longPressStartRef.current
      if (!node || !start || isDragging) return

      triggerHaptic(12)
      clearLongPressPulseReset()
      setLongPressPulseActive(true)
      longPressPulseResetRef.current = window.setTimeout(() => {
        setLongPressPulseActive(false)
        longPressPulseResetRef.current = null
      }, 180)

      // Reuse the existing onContextMenu path so schedule/staff-pool menus stay consistent.
      node.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: start.x,
          clientY: start.y,
        })
      )
      clearLongPressTimer()
    }, LONG_PRESS_MS)
  }, [LONG_PRESS_MS, clearLongPressTimer, onOpenContextMenu, triggerHaptic])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return
    if (longPressPointerIdRef.current !== e.pointerId) return
    if (!longPressStartRef.current) return

    const dx = Math.abs(e.clientX - longPressStartRef.current.x)
    const dy = Math.abs(e.clientY - longPressStartRef.current.y)
    if (dx > LONG_PRESS_MOVE_TOLERANCE || dy > LONG_PRESS_MOVE_TOLERANCE) {
      clearLongPressTimer()
    }
  }, [LONG_PRESS_MOVE_TOLERANCE, clearLongPressTimer])

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return
    if (longPressPointerIdRef.current !== e.pointerId) return
    clearLongPressTimer()
    longPressPointerIdRef.current = null
    longPressStartRef.current = null
  }, [clearLongPressTimer])

  return (
    <div
      ref={setCardNodeRef}
      style={style}
      {...(draggable && !isHoveringEdit && !isHoveringConvert ? { ...effectiveListeners, ...effectiveAttributes } : {})}
      className={cn(
        "relative p-1 border-2 rounded-md bg-card hover:bg-accent transition-colors select-none",
        borderColorClass,
        fillColorClassName,
        draggable && !isHoveringEdit && !isHoveringConvert && "cursor-move",
        isDragging && "opacity-50",
        showBattery && "overflow-hidden",
        longPressPulseActive && "ring-2 ring-primary/40 scale-[1.02]"
      )}
      onMouseEnter={() => setIsHoveringCard(true)}
      onMouseLeave={() => {
        setIsHoveringCard(false)
        setIsHoveringEdit(false)
        setIsHoveringConvert(false)
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!onOpenContextMenu) return
        onOpenContextMenu(e)
      }}
    >
      {showBattery ? (
        // Battery display: outer border + green background + text overlay
        <div className="relative w-full">
          {/* Outer border container (based on Base_FTE) - using TeamReservationCard colors (border-blue-300, bg-blue-50) */}
          <div 
            className="absolute top-0 left-0 h-full border border-blue-300 dark:border-blue-400 rounded-sm"
            style={{ width: `${baseFTE * 100}%` }}
          >
            {/* Background fill (based on True-FTE, relative to outer border) - using TeamReservationCard colors */}
            {trueFTE > 0 && (
              <div
                className="absolute top-0 left-0 h-full bg-blue-50 dark:bg-blue-950/30 rounded-sm"
                style={{ width: baseFTE > 0 ? `${(trueFTE / baseFTE) * 100}%` : '0%' }}
              />
            )}
          </div>
          {/* Text content overlay */}
          <div className="relative z-10 flex flex-col">
            <div className="flex items-start justify-between gap-1">
          <span className={cn("text-sm font-medium flex-1 min-w-0", nameColor === 'underline' ? 'underline' : nameColor || "")}>{displayName}</span>
              {headerRight ? (
                <span className="text-xs font-medium flex-shrink-0 whitespace-nowrap">
                  {headerRight}
                </span>
              ) : null}
              {fteDisplay && (
                <span className="text-sm font-medium text-muted-foreground text-right flex-shrink max-w-[60%] whitespace-normal break-words leading-tight">
                  {fteDisplay}
                </span>
              )}
          {onEdit && isHoveringCard && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 flex-shrink-0 ml-1"
              onMouseEnter={() => setIsHoveringEdit(true)}
              onMouseLeave={() => setIsHoveringEdit(false)}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                onEdit?.(e)
              }}
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          {onConvertToInactive && isBufferStaff && isHoveringCard && (
            <Tooltip content="Convert to Inactive">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 flex-shrink-0 ml-1"
                onMouseEnter={() => setIsHoveringConvert(true)}
                onMouseLeave={() => setIsHoveringConvert(false)}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onConvertToInactive?.(e)
                }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </Tooltip>
          )}
        </div>
        {slotDisplay && (
          <div className="text-xs mt-0.5 ml-0 break-normal hyphens-none">
            {renderedSlotDisplay}
          </div>
        )}
      </div>
        </div>
      ) : (
        // Normal display (no battery)
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-1">
            <span className={cn("text-sm font-medium flex-1 min-w-0", nameColor === 'underline' ? 'underline' : nameColor || "")}>{displayName}</span>
            {headerRight ? (
              <span className="text-xs font-medium flex-shrink-0 whitespace-nowrap">
                {headerRight}
              </span>
            ) : null}
            {fteDisplay && (
              <span className="text-sm font-medium text-muted-foreground text-right flex-shrink max-w-[60%] whitespace-normal break-words leading-tight">
                {fteDisplay}
              </span>
            )}
            {onEdit && isHoveringCard && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 flex-shrink-0 ml-1"
                onMouseEnter={() => setIsHoveringEdit(true)}
                onMouseLeave={() => setIsHoveringEdit(false)}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onEdit?.(e)
                }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            {onConvertToInactive && isBufferStaff && isHoveringCard && (
              <Tooltip content="Convert to Inactive">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 flex-shrink-0 ml-1"
                  onMouseEnter={() => setIsHoveringConvert(true)}
                  onMouseLeave={() => setIsHoveringConvert(false)}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    onConvertToInactive?.(e)
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Tooltip>
            )}
          </div>
          {slotDisplay && (
            <div className="text-xs mt-0.5 ml-0 break-normal hyphens-none">
              {renderedSlotDisplay}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

