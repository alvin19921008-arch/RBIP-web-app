'use client'

import * as React from 'react'
import { Save, Loader2, Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ScheduleSaveButton(props: {
  saving: boolean
  hasUnsavedChanges: boolean
  onSave: () => void
}) {
  const { saving, hasUnsavedChanges, onSave } = props

  const [showSavedFlash, setShowSavedFlash] = React.useState(false)
  const prevSavingRef = React.useRef<boolean>(saving)
  const flashTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    const wasSaving = prevSavingRef.current
    if (hasUnsavedChanges) {
      setShowSavedFlash(false)
    } else if (wasSaving && !saving) {
      setShowSavedFlash(true)
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current)
      flashTimerRef.current = window.setTimeout(() => {
        setShowSavedFlash(false)
      }, 1200)
    }
    prevSavingRef.current = saving
  }, [saving, hasUnsavedChanges])

  React.useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current)
    }
  }, [])

  const isSaving = saving
  const isDirty = hasUnsavedChanges && !isSaving
  const isSavedFlash = !isSaving && !hasUnsavedChanges && showSavedFlash
  const isSavedRest = !isSaving && !hasUnsavedChanges && !showSavedFlash

  const disabled = isSaving || isSavedRest

  return (
    <Button
      onClick={onSave}
      disabled={disabled}
      variant={isDirty || isSaving || isSavedFlash ? 'default' : 'outline'}
      className={cn(
        'relative overflow-hidden min-w-[99px]',
        isDirty || isSaving || isSavedFlash ? 'bg-green-600 hover:bg-green-700 text-white' : null
      )}
    >
      {isSaving ? (
        <>
          {/* subtle progress sweep/glow while saving */}
          <span
            aria-hidden="true"
            className="save-sweep absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent"
          />
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Saving...
        </>
      ) : isDirty ? (
        <>
          <Save className="h-4 w-4 mr-2" />
          Save Schedule
        </>
      ) : isSavedFlash ? (
        <>
          <Check className="h-4 w-4 mr-2 save-check-pop" />
          Saved
        </>
      ) : (
        <>
          <Save className="h-4 w-4 mr-2" />
          Saved
        </>
      )}

      <style jsx>{`
        .save-sweep {
          animation: saveSweep 1.1s linear infinite;
        }
        .save-check-pop {
          animation: checkPop 240ms ease-out;
        }
        @keyframes saveSweep {
          0% {
            transform: translateX(-140%);
            opacity: 0;
          }
          25% {
            opacity: 1;
          }
          75% {
            opacity: 1;
          }
          100% {
            transform: translateX(260%);
            opacity: 0;
          }
        }
        @keyframes checkPop {
          0% {
            transform: scale(0.75);
            opacity: 0.7;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </Button>
  )
}

