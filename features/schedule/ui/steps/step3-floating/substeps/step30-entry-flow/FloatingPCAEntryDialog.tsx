'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface FloatingPCAEntryDialogProps {
  open: boolean
  v2Enabled?: boolean
  onSelectV1: () => void
  onSelectV2?: () => void
  onCancel: () => void
}

export function FloatingPCAEntryDialog({
  open,
  v2Enabled = false,
  onSelectV1,
  onSelectV2,
  onCancel,
}: FloatingPCAEntryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Floating PCA allocation</DialogTitle>
          <DialogDescription>
            Choose which Step 3 flow to open. Legacy V1 stays unchanged while the ranked-slot V2 flow is rebuilt separately.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <button
            type="button"
            onClick={onSelectV1}
            className="rounded-xl border border-border bg-background p-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-foreground">V1 legacy</div>
              <Badge variant="secondary" className="h-5 px-2 text-[10px] font-medium">
                Current flow
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Opens the existing Step 3.0 to 3.3 flow without changing legacy behavior.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              if (v2Enabled && onSelectV2) onSelectV2()
            }}
            disabled={!v2Enabled}
            className="rounded-xl border border-border bg-background p-4 text-left transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-foreground">V2 ranked</div>
              <Badge variant="outline" className="h-5 px-2 text-[10px] font-medium">
                Next phase
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Reserved for the standalone ranked-slot rebuild so V2 can evolve without touching V1 runtime or save behavior.
            </p>
          </button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
