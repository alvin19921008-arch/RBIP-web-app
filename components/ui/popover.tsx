'use client'

import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '@/lib/utils'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverClose = PopoverPrimitive.Close
export const PopoverAnchor = PopoverPrimitive.Anchor

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent({ className, align = 'center', sideOffset = 8, ...props }, ref) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        forceMount
        className={cn(
          'z-50 outline-none',
          // Entrance: keyframes run every time open (obvious animation).
          'data-[state=open]:animate-popover-in',
          'data-[side=right]:[--popover-in-x:10px] data-[side=right]:[--popover-out-x:-10px]',
          'data-[side=left]:[--popover-in-x:-10px] data-[side=left]:[--popover-out-x:10px]',
          'data-[side=top]:[--popover-in-y:8px] data-[side=top]:[--popover-out-y:-8px]',
          'data-[side=bottom]:[--popover-in-y:-8px] data-[side=bottom]:[--popover-out-y:8px]',
          'data-[state=closed]:animate-popover-out',
          'data-[state=closed]:pointer-events-none',
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
})

export const PopoverArrow = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Arrow>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Arrow>
>(function PopoverArrow({ className, ...props }, ref) {
  return (
    <PopoverPrimitive.Arrow
      ref={ref}
      className={cn('fill-amber-50/95 stroke-amber-200', className)}
      {...props}
    />
  )
})

