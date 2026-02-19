'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export function HorizontalCardCarousel(props: {
  children: React.ReactNode
  /**
   * When this value changes (e.g. dialog open), overflow + index are recomputed.
   * Useful when the carousel is mounted inside a dialog/portal.
   */
  recomputeKey?: any
  /** Initial card index when mounted (default 0). */
  initialIndex?: number
  /** Called when the closest (visible) card index changes. */
  onIndexChange?: (index: number) => void
  /** If true (default), carousel tries to fill parent's available height. */
  fill?: boolean
  /** Show dot markers under carousel (default true). */
  showDots?: boolean

  className?: string
  containerClassName?: string
  cardWrapperClassName?: string
}) {
  const {
    children,
    recomputeKey,
    initialIndex = 0,
    onIndexChange,
    fill = true,
    showDots = true,
    className,
    containerClassName,
    cardWrapperClassName,
  } = props

  const items = React.Children.toArray(children)
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)

  const [currentCardIndex, setCurrentCardIndex] = React.useState(() => Math.max(0, Math.min(initialIndex, items.length - 1)))
  const [carouselOverflowing, setCarouselOverflowing] = React.useState(false)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)

  const recomputeScrollEdges = React.useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const max = Math.max(0, el.scrollWidth - el.clientWidth)
    // Small tolerance to avoid flicker on fractional pixels.
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < max - 4)
  }, [])

  const recomputeCarouselOverflow = React.useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    // Small tolerance to avoid flicker on fractional pixels.
    setCarouselOverflowing(el.scrollWidth > el.clientWidth + 4)
    recomputeScrollEdges()
  }, [recomputeScrollEdges])

  const scrollToCard = React.useCallback(
    (index: number) => {
      const container = scrollContainerRef.current
      if (!container) return
      const cards = container.children
      if (!cards[index]) return
      const card = cards[index] as HTMLElement
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
      setCurrentCardIndex(index)
      onIndexChange?.(index)
    },
    [onIndexChange]
  )

  const scrollLeft = React.useCallback(() => {
    if (currentCardIndex > 0) scrollToCard(currentCardIndex - 1)
  }, [currentCardIndex, scrollToCard])

  const scrollRight = React.useCallback(() => {
    if (currentCardIndex < items.length - 1) scrollToCard(currentCardIndex + 1)
  }, [currentCardIndex, items.length, scrollToCard])

  // Track scroll position for carousel (closest card to container left edge)
  React.useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const cards = container.children
      if (cards.length === 0) return

      const containerRect = container.getBoundingClientRect()
      const containerCenter = containerRect.left + containerRect.width / 2
      let closestIndex = 0
      let closestDistance = Infinity

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i] as HTMLElement
        const cardRect = card.getBoundingClientRect()
        const cardCenter = cardRect.left + cardRect.width / 2
        const distance = Math.abs(cardCenter - containerCenter)
        if (distance < closestDistance) {
          closestDistance = distance
          closestIndex = i
        }
      }

      setCurrentCardIndex((prev) => {
        if (prev === closestIndex) return prev
        onIndexChange?.(closestIndex)
        return closestIndex
      })

      recomputeScrollEdges()
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [items.length, onIndexChange, recomputeScrollEdges])

  // Only show arrows/markers when the carousel actually overflows.
  React.useLayoutEffect(() => {
    recomputeCarouselOverflow()
    const el = scrollContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => recomputeCarouselOverflow())
    ro.observe(el)

    // If we remount/reopen, ensure we start at initialIndex.
    if (items.length > 0) {
      const idx = Math.max(0, Math.min(initialIndex, items.length - 1))
      scrollToCard(idx)
    }

    return () => {
      try {
        ro.disconnect()
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, recomputeKey])

  if (items.length === 0) {
    return null
  }

  return (
    <div className={cn('relative min-h-0', fill ? 'flex-1' : null, className)}>
      {carouselOverflowing && items.length > 1 && (
        <Button
          variant="outline"
          size="icon"
          className={cn(
            'absolute left-1 top-1/2 -translate-y-1/2 z-10 bg-background/95 shadow-lg h-8 w-8',
            !canScrollLeft ? 'opacity-40 pointer-events-none' : null
          )}
          onClick={scrollLeft}
          disabled={!canScrollLeft}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}

      <div
        ref={scrollContainerRef}
        className={cn(
          'flex overflow-x-auto scroll-smooth gap-4 px-6 items-start overscroll-x-contain',
          !carouselOverflowing ? 'justify-center' : null,
          fill ? 'h-full' : 'h-auto',
          containerClassName
        )}
        style={{
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth',
        }}
      >
        {items.map((node, index) => (
          <div
            key={(node as any)?.key ?? `carousel-card:${index}`}
            className={cn('flex-shrink-0', cardWrapperClassName)}
            style={{ scrollSnapAlign: 'start' }}
          >
            {node}
          </div>
        ))}
      </div>

      {carouselOverflowing && items.length > 1 && (
        <Button
          variant="outline"
          size="icon"
          className={cn(
            'absolute right-1 top-1/2 -translate-y-1/2 z-10 bg-background/95 shadow-lg h-8 w-8',
            !canScrollRight ? 'opacity-40 pointer-events-none' : null
          )}
          onClick={scrollRight}
          disabled={!canScrollRight}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      {showDots && carouselOverflowing && items.length > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {items.map((_, index) => (
            <button
              key={index}
              onClick={() => scrollToCard(index)}
              className={cn(
                'w-2 h-2 rounded-full transition-all',
                index === currentCardIndex ? 'bg-blue-600 w-6' : 'bg-gray-300 hover:bg-gray-400'
              )}
              aria-label={`Go to card ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

