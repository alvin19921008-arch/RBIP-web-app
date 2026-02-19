'use client'

import { useState, useEffect, useCallback } from 'react'
import { Maximize2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GifViewerProps {
  src: string
  alt: string
  className?: string
  thumbnailClassName?: string
  frame?: boolean
}

export function GifViewer({ src, alt, className, thumbnailClassName, frame = true }: GifViewerProps) {
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
          'relative group block w-full max-w-[360px] overflow-hidden rounded-md bg-transparent',
          frame && 'ring-1 ring-border/15',
          className
        )}
      >
        <img
          src={src}
          alt={alt}
          className={cn(
            'block h-auto max-h-[220px] w-full object-contain object-top',
            thumbnailClassName
          )}
          loading="lazy"
        />
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
          aria-label="Expand GIF"
        >
          <Maximize2 className="h-4 w-4 text-white" />
        </button>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
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
            <div className="w-full max-w-[560px] rounded-lg overflow-hidden shadow-2xl bg-muted/50">
              <img
                src={src}
                alt={alt}
                className="w-full h-auto max-h-[80vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
