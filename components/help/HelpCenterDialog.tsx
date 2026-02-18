'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HelpCenterContent } from '@/components/help/HelpCenterContent'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

export function HelpCenterDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 h-8 w-8"
          aria-label="Close help"
          onClick={() => props.onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </Button>

        <DialogHeader className="pr-10">
          <DialogTitle>Help Center</DialogTitle>
        </DialogHeader>
        <HelpCenterContent onAfterStartTour={() => props.onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

