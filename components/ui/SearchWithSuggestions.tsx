'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

export type SearchSuggestionItem = {
  id: string
  label: string
  keywords?: string[]
  subLabel?: string
}

export function SearchWithSuggestions(props: {
  value: string
  onValueChange: (value: string) => void
  items: SearchSuggestionItem[]
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  maxResults?: number
  className?: string
  inputClassName?: string
  listClassName?: string
  onSelect: (item: SearchSuggestionItem) => void
}) {
  const maxResults = typeof props.maxResults === 'number' ? props.maxResults : 8
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIdx, setHighlightedIdx] = useState<number>(-1)

  const q = props.value.trim().toLowerCase()

  const results = useMemo(() => {
    if (!q) return []
    const scored = props.items
      .map((it) => {
        const hay = [it.label, ...(it.keywords ?? [])].join(' ').toLowerCase()
        if (!hay.includes(q)) return null
        const labelLower = it.label.toLowerCase()
        const starts =
          labelLower.startsWith(q) ||
          (it.keywords ?? []).some((k) => String(k).toLowerCase().startsWith(q))
        const score = starts ? 2 : 1
        return { it, score, labelLower }
      })
      .filter((x): x is { it: SearchSuggestionItem; score: number; labelLower: string } => x !== null)

    scored.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      return a.labelLower.localeCompare(b.labelLower)
    })

    return scored.slice(0, maxResults).map((x) => x.it)
  }, [props.items, q, maxResults])

  useEffect(() => {
    if (!q) {
      setIsOpen(false)
      setHighlightedIdx(-1)
      return
    }
    setIsOpen(true)
    setHighlightedIdx((prev) => (prev >= 0 && prev < results.length ? prev : results.length > 0 ? 0 : -1))
  }, [q, results.length])

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const root = rootRef.current
      if (!root) return
      if (root.contains(e.target as Node)) return
      setIsOpen(false)
      setHighlightedIdx(-1)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const selectItem = (item: SearchSuggestionItem) => {
    props.onSelect(item)
    setIsOpen(false)
    setHighlightedIdx(-1)
    // Keep focus so user can continue typing/refining.
    inputRef.current?.focus()
  }

  return (
    <div ref={rootRef} className={cn('relative', props.className)}>
      <Input
        ref={inputRef}
        value={props.value}
        onChange={(e) => props.onValueChange(e.target.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
        autoFocus={props.autoFocus}
        className={props.inputClassName}
        onFocus={() => {
          if (q) setIsOpen(true)
        }}
        onKeyDown={(e) => {
          if (!isOpen) return
          if (results.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlightedIdx((prev) => {
              const next = prev < 0 ? 0 : (prev + 1) % results.length
              return next
            })
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlightedIdx((prev) => {
              const next = prev < 0 ? results.length - 1 : (prev - 1 + results.length) % results.length
              return next
            })
          } else if (e.key === 'Enter') {
            const idx = highlightedIdx
            if (idx >= 0 && idx < results.length) {
              e.preventDefault()
              selectItem(results[idx]!)
            }
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setIsOpen(false)
            setHighlightedIdx(-1)
          }
        }}
      />

      {isOpen && results.length > 0 ? (
        <div
          className={cn(
            'absolute z-50 mt-1 w-full rounded-md border border-border bg-background shadow-lg overflow-hidden',
            props.listClassName
          )}
          role="listbox"
        >
          {results.map((it, idx) => {
            const isActive = idx === highlightedIdx
            return (
              <button
                key={it.id}
                type="button"
                className={cn(
                  'w-full text-left px-3 py-2 text-sm flex items-start justify-between gap-2',
                  isActive ? 'bg-accent' : 'hover:bg-accent/60'
                )}
                onMouseEnter={() => setHighlightedIdx(idx)}
                onMouseDown={(e) => {
                  // Prevent input blur before click.
                  e.preventDefault()
                }}
                onClick={() => selectItem(it)}
                role="option"
                aria-selected={isActive}
              >
                <span className="min-w-0">
                  <span className="block font-medium truncate">{it.label}</span>
                  {it.subLabel ? (
                    <span className="block text-xs text-muted-foreground truncate">{it.subLabel}</span>
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

