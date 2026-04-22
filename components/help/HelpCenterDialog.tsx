'use client'

import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HelpCenterContent } from '@/components/help/HelpCenterContent'
import { Button } from '@/components/ui/button'
import { Maximize2, X } from 'lucide-react'

export function HelpCenterDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <div className="absolute right-3 top-3 flex items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link
              href="/help"
              aria-label="Open full-page Help — print or share"
              title="Full-page Help"
              onClick={() => props.onOpenChange(false)}
            >
              <Maximize2 className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Close help"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <DialogHeader className="pr-[4.75rem] mb-6">
          <DialogTitle className="leading-snug">Help Center</DialogTitle>
        </DialogHeader>
        <HelpCenterContent
          onAfterStartTour={() => props.onOpenChange(false)}
          onRequestCloseBeforeNavigate={() => props.onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

