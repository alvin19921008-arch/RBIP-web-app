import * as React from 'react'
import { cn } from '@/lib/utils'

export function ToggleGroup({
  type,
  value,
  onValueChange,
  className,
  children,
}: {
  type: 'single'
  value: string
  onValueChange: (value: string) => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        'inline-flex items-center justify-center rounded-md bg-muted p-1 gap-1',
        className
      )}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          const childElement = child as React.ReactElement<{ value: string }>
          return React.cloneElement(childElement, {
            isSelected: childElement.props.value === value,
            onSelect: () => onValueChange(childElement.props.value),
          } as any)
        }
        return child
      })}
    </div>
  )
}

interface ToggleGroupItemProps {
  value: string
  children: React.ReactNode
  className?: string
  isSelected?: boolean
  onSelect?: () => void
}

export function ToggleGroupItem({
  value,
  children,
  className,
  isSelected,
  onSelect,
}: ToggleGroupItemProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onSelect}
      className={cn(
        'inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium transition-all',
        'focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        isSelected
          ? 'bg-background text-foreground shadow-sm'
          : 'bg-transparent text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  )
}
