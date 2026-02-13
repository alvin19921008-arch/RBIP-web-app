'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HelpCenterContent } from '@/components/help/HelpCenterContent'

export function HelpCenterDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Help Center</DialogTitle>
        </DialogHeader>
        <HelpCenterContent onAfterStartTour={() => props.onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

