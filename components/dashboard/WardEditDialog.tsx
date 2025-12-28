'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Ward } from '@/types/allocation'
import { Info, X } from 'lucide-react'

interface WardEditDialogProps {
  ward: Ward | Partial<Ward>
  existingWards: Ward[]
  onSave: (wardData: Partial<Ward>) => Promise<void>
  onCancel: () => void
}

export function WardEditDialog({ ward, existingWards, onSave, onCancel }: WardEditDialogProps) {
  const isNew = !ward.id
  const supabase = createClientComponentClient()

  const [name, setName] = useState(ward.name || '')
  const [totalBeds, setTotalBeds] = useState(ward.total_beds || 1)
  const [error, setError] = useState<string | null>(null)

  // Validate ward name format
  const validateWardName = (wardName: string): boolean => {
    const pattern = /^R\d+[A-Z]$/i
    return pattern.test(wardName)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate ward name format
    if (!validateWardName(name)) {
      setError('Invalid ward name format. Must be like R7A, R11B, etc.')
      return
    }

    // Check for duplicate name (excluding current ward if editing)
    const isDuplicate = existingWards.some(
      w => w.name.toLowerCase() === name.toLowerCase() && w.id !== ward.id
    )
    if (isDuplicate) {
      setError('Ward name already exists')
      return
    }

    // Validate bed number
    if (totalBeds < 1) {
      setError('Bed number must be at least 1')
      return
    }

    const wardData: Partial<Ward> = {
      name: name.trim(),
      total_beds: totalBeds,
    }

    try {
      await onSave(wardData)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
    }
  }

  return (
    <Dialog open={true} onOpenChange={() => onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{isNew ? 'Add New Ward' : 'Edit Ward'}</DialogTitle>
            <button
              onClick={onCancel}
              className="p-1 hover:bg-accent rounded"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Ward Name */}
          <div>
            <Label htmlFor="name">
              Ward Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              required
              className="mt-1"
              placeholder="e.g., R7A, R11B"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Format: R followed by floor number and letter (e.g., R7A, R11B)
            </p>
          </div>

          {/* Bed Number */}
          <div>
            <Label htmlFor="totalBeds">
              Ward Bed Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="totalBeds"
              type="number"
              min="1"
              value={totalBeds}
              onChange={(e) => {
                setTotalBeds(parseInt(e.target.value, 10) || 1)
                setError(null)
              }}
              required
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1.5">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                This value is used to calculate the "Ward Beds" in <strong>Beds Calculations</strong> on schedule page.
              </span>
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}