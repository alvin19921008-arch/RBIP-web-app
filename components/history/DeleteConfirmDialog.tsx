'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface DeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  onConfirm: () => void
  title?: string
  description?: string
}

export function DeleteConfirmDialog({ open, onOpenChange, count, onConfirm, title, description }: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title || 'Delete schedules'}</DialogTitle>
          <DialogDescription>
            {description ||
              `Are you sure you want to delete ${count} schedule${count > 1 ? 's' : ''}? This action is irreversible and will permanently remove all allocation data for the selected schedule${count > 1 ? 's' : ''}.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete {count > 1 ? `${count} Schedules` : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
