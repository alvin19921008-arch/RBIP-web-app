"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const Dialog = ({ open, onOpenChange, children }: DialogProps) => {
  const dialogId = React.useId()

  // Prevent background (underlay) page scroll while dialog is open.
  // Also reduces scroll-chaining when dialog scroll reaches edges.
  React.useEffect(() => {
    if (!open) return

    const LOCK_KEY = "__rbip_dialog_scroll_lock_count__"
    const PREV_KEY = "__rbip_dialog_scroll_lock_prev__"
    const g = globalThis as any
    const nextCount = (g[LOCK_KEY] ?? 0) + 1
    g[LOCK_KEY] = nextCount

    // Only apply styles for the first active dialog.
    if (nextCount === 1) {
      const { body, documentElement } = document
      g[PREV_KEY] = {
        bodyOverflow: body.style.overflow,
        htmlOverflow: documentElement.style.overflow,
      }
      body.style.overflow = "hidden"
      documentElement.style.overflow = "hidden"
    }

    return () => {
      const curr = (g[LOCK_KEY] ?? 1) - 1
      g[LOCK_KEY] = Math.max(0, curr)

      if (g[LOCK_KEY] === 0) {
        const { body, documentElement } = document
        const prev = g[PREV_KEY] ?? {}
        body.style.overflow = prev.bodyOverflow ?? ""
        documentElement.style.overflow = prev.htmlOverflow ?? ""
        delete g[PREV_KEY]
      }
    }
  }, [open])

  // Track a simple global "dialog stack" so Escape closes the top-most dialog only.
  React.useEffect(() => {
    if (!open) return
    const STACK_KEY = "__rbip_dialog_stack__"
    const g = globalThis as any
    const stack: string[] = Array.isArray(g[STACK_KEY]) ? g[STACK_KEY] : []
    stack.push(dialogId)
    g[STACK_KEY] = stack
    return () => {
      const curr: string[] = Array.isArray(g[STACK_KEY]) ? g[STACK_KEY] : []
      const idx = curr.lastIndexOf(dialogId)
      if (idx >= 0) curr.splice(idx, 1)
      g[STACK_KEY] = curr
    }
  }, [open, dialogId])

  React.useEffect(() => {
    if (!open) return
    const STACK_KEY = "__rbip_dialog_stack__"
    const g = globalThis as any
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      const stack: string[] = Array.isArray(g[STACK_KEY]) ? g[STACK_KEY] : []
      if (stack[stack.length - 1] !== dialogId) return
      e.preventDefault()
      onOpenChange?.(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, dialogId, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" />
      <div
        className="relative z-50 flex min-h-full items-start justify-center p-2 sm:items-center sm:p-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onOpenChange?.(false)
        }}
        onTouchStart={(e) => {
          if (e.target === e.currentTarget) onOpenChange?.(false)
        }}
      >
        {children}
      </div>
    </div>
  )
}

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative w-[calc(100vw-16px)] max-w-lg rounded-lg bg-background p-4 shadow-lg sm:w-full sm:p-6",
      className
    )}
    {...props}
  >
    {children}
  </div>
))
DialogContent.displayName = "DialogContent"

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = "DialogDescription"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
}

